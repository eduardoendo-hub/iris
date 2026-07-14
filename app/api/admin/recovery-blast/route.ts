/**
 * /api/admin/recovery-blast — disparo PONTUAL de recuperação pra TODOS os
 * leads de um produto (ex.: reta final de matrícula com cupom).
 *
 * Diferente da régua (/api/admin/recovery-run):
 *   - Ignora as janelas de tempo (30min/24h/72h) e o filtro "stale"
 *   - Junta DUAS fontes: EngagedPurchase não-PAID + tabela Lead (form/whats)
 *   - Manda direto o template do passo 3 COM CUPOM (config /admin/recovery)
 *
 * Proteções mantidas:
 *   - Filtra quem já pagou (Sale + EngagedPurchase PAID, por email/telefone)
 *   - Dedup por telefone entre as fontes
 *   - Não repete pra quem já recebeu o blast (RecoveryTouch step=3)
 *   - dryRun por DEFAULT — envio real só com {"dryRun": false}
 *   - maxSends por chamada (default 60)
 *
 * Auth: X-Admin-Secret. POST { productSlug, dryRun?, maxSends? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/admin-auth";
import { getProductConfig } from "@/lib/products";
import { sendWhatsAppTemplate, chatproConfigured, normalizeWaNumber } from "@/lib/chatpro";
import {
  DEFAULT_TEMPLATE_TEXTS,
  firstName,
  buildRecoveryLink,
  renderText,
  paramValue,
  type TemplateVars,
} from "@/lib/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const Input = z.object({
  productSlug: z.string().min(2).max(64),
  dryRun: z.boolean().default(true),
  maxSends: z.coerce.number().int().positive().max(300).default(60),
});

export async function POST(req: NextRequest) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Input.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  }
  const { productSlug, dryRun, maxSends } = parsed.data;

  // Campanha ativa do produto (dá o checkout + turma pro link)
  const campaign = await prisma.campaign.findFirst({
    where: { productSlug, status: "ACTIVE" },
  });
  if (!campaign) {
    return NextResponse.json({ error: "no_active_campaign", productSlug }, { status: 400 });
  }
  const sharedId = campaign.engagedCheckoutSharedIds[0];
  if (!sharedId) {
    return NextResponse.json({ error: "campaign_sem_checkout_engaged" }, { status: 400 });
  }
  const voucher = process.env.RECOVERY_VOUCHER_CODE || null;
  if (!voucher) {
    return NextResponse.json({ error: "RECOVERY_VOUCHER_CODE_nao_configurado" }, { status: 400 });
  }

  // Template do cupom (config da tela /admin/recovery)
  let tplCfg: { chatproTemplate: string | null; params: string[]; fallbackText: string | null } | null = null;
  try {
    tplCfg = await prisma.recoveryTemplate.findUnique({
      where: { key: "step3_com_cupom" },
      select: { chatproTemplate: true, params: true, fallbackText: true },
    });
  } catch { /* segue sem template — texto livre */ }

  const product = getProductConfig(productSlug);
  const courseName = product?.name || productSlug;

  // Fontes + quem já pagou
  const [engaged, leads, paidEngaged, sales, priorTouches] = await Promise.all([
    prisma.engagedPurchase.findMany({
      where: { productSlug, status: { not: "PAID" } },
      select: { id: true, customerName: true, customerEmail: true, customerPhone: true, status: true },
    }),
    prisma.lead.findMany({
      where: { productSlug, phone: { not: null } },
      select: { id: true, name: true, email: true, phone: true, eventType: true },
    }),
    prisma.engagedPurchase.findMany({
      where: { productSlug, status: "PAID" },
      select: { customerEmail: true, customerPhone: true },
    }),
    prisma.sale.findMany({
      where: { productSlug },
      select: { customerEmail: true, customerPhone: true },
    }),
    prisma.recoveryTouch.findMany({
      where: { productSlug, step: 3 },
      select: { engagedPurchaseId: true },
    }),
  ]);

  const paidEmails = new Set<string>();
  const paidPhones = new Set<string>();
  for (const r of [...paidEngaged, ...sales]) {
    if (r.customerEmail) paidEmails.add(r.customerEmail.toLowerCase().trim());
    const d = (r.customerPhone || "").replace(/\D/g, "");
    if (d.length >= 8) paidPhones.add(d.slice(-8));
  }
  const alreadyBlasted = new Set(priorTouches.map((t) => t.engagedPurchaseId));

  // Unifica candidatos (Engaged primeiro — status mais rico), dedup por telefone
  type Cand = { refId: string; source: string; name: string | null; email: string | null; phone: string };
  const seenPhones = new Set<string>();
  const candidates: Cand[] = [];
  const skipped: Record<string, number> = {};
  const skip = (r: string) => (skipped[r] = (skipped[r] ?? 0) + 1);

  const pool: Array<{ refId: string; source: string; name: string | null; email: string | null; rawPhone: string | null }> = [
    ...engaged.map((e) => ({ refId: e.id, source: `engaged:${e.status}`, name: e.customerName, email: e.customerEmail, rawPhone: e.customerPhone })),
    ...leads.map((l) => ({ refId: l.id, source: `lead:${l.eventType}`, name: l.name, email: l.email, rawPhone: l.phone })),
  ];

  for (const c of pool) {
    const digits = (c.rawPhone || "").replace(/\D/g, "");
    if (digits.length < 10) { skip("sem_telefone"); continue; }
    const tail = digits.slice(-8);
    if (seenPhones.has(tail)) { skip("duplicado"); continue; }
    if (c.email && paidEmails.has(c.email.toLowerCase().trim())) { skip("ja_pagou"); continue; }
    if (paidPhones.has(tail)) { skip("ja_pagou"); continue; }
    if (alreadyBlasted.has(c.refId)) { skip("ja_recebeu_blast"); continue; }
    seenPhones.add(tail);
    candidates.push({ refId: c.refId, source: c.source, name: c.name, email: c.email, phone: normalizeWaNumber(c.rawPhone!) });
  }

  const toSend = candidates.slice(0, maxSends);
  const overflow = candidates.length - toSend.length;

  const link = buildRecoveryLink({
    sharedId,
    turmaId: campaign.impactaTurmaId,
    campaignSlug: campaign.slug,
    step: 3,
    voucherCode: voucher,
  });

  let sent = 0;
  let errors = 0;
  const results: Array<Record<string, unknown>> = [];

  for (const c of toSend) {
    const vars: TemplateVars = { nome: firstName(c.name), curso: courseName, link, cupom: voucher };
    const message = renderText(tplCfg?.fallbackText || DEFAULT_TEMPLATE_TEXTS.step3_com_cupom, vars);
    if (dryRun) {
      results.push({ name: c.name, phone: c.phone, source: c.source, message });
      continue;
    }
    const tplName = tplCfg?.chatproTemplate || null;
    const r = tplName
      ? await sendWhatsAppTemplate(c.phone, tplName, (tplCfg?.params ?? []).map((p) => paramValue(p, vars)))
      : { ok: false as const, error: "template_cupom_nao_configurado" };
    try {
      await prisma.recoveryTouch.create({
        data: {
          engagedPurchaseId: c.refId,
          productSlug,
          campaignSlug: campaign.slug,
          channel: "whatsapp",
          step: 3,
          templateKey: tplName ? `blast@${tplName}` : "blast",
          message,
          phone: c.phone,
          status: r.ok ? "sent" : "error",
          error: r.ok ? null : (r.error || "unknown").slice(0, 300),
        },
      });
    } catch { /* unique violation — já tocado */ }
    if (r.ok) sent++; else errors++;
    results.push({ name: c.name, phone: c.phone, source: c.source, ok: r.ok, error: r.error });
  }

  return NextResponse.json({
    mode: dryRun ? "DRY_RUN" : "SEND",
    productSlug,
    campaignSlug: campaign.slug,
    voucher,
    chatproConfigured: chatproConfigured(),
    fontes: { engagedNaoPago: engaged.length, leadsTabela: leads.length },
    candidatos: candidates.length,
    aEnviar: toSend.length,
    acimaDoCap: overflow > 0 ? overflow : 0,
    enviados: sent,
    erros: errors,
    skipped,
    linkUsado: link,
    preview: results,
  });
}
