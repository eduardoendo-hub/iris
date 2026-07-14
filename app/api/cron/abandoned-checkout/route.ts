/**
 * /api/cron/abandoned-checkout — cadência de recuperação de checkout.
 *
 * A cada execução (agendar ~15 min):
 *   1. Para cada campanha ATIVA com checkout Engaged, busca EngagedPurchase
 *      em status recuperável (DRAFT/WAITING_PAYMENT/REFUSED/EXPIRED) com telefone.
 *   2. Filtra quem já pagou (email/telefone bate com Sale ou Engaged PAID
 *      do mesmo produto — mesma lógica do cockpit).
 *   3. Decide o próximo passo da cadência (30min → 24h → 72h desde o 1º
 *      evento, com gap mínimo entre toques) e envia WhatsApp via ChatPro.
 *   4. Grava RecoveryTouch (1 por passo — unique constraint = idempotente).
 *
 * SEGURANÇA DE ENVIO:
 *   - DRY-RUN por padrão: só retorna o preview das mensagens, não envia
 *     nem grava. Envio real exige env RECOVERY_SEND=1 E ChatPro configurado.
 *   - RECOVERY_MAX_PER_RUN (default 20) limita envios por execução
 *     (protege a reputação do número).
 *   - Leads sem toque com mais de RECOVERY_MAX_AGE_DAYS (default 7) são
 *     ignorados ("stale") — ligar o cron não dispara pro backlog antigo.
 *
 * Auth: X-Cron-Secret = CRON_SECRET  OU  X-Admin-Secret = IRIS_WEBHOOK_SECRET.
 * GET ?send=0 força dry-run mesmo com RECOVERY_SEND=1 (pra inspecionar).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProductConfig } from "@/lib/products";
import { sendWhatsAppText, sendWhatsAppTemplate, chatproConfigured, normalizeWaNumber, looksSuspiciousPhone } from "@/lib/chatpro";
import {
  RECOVERY_STEPS,
  MAX_STEPS,
  RECOVERABLE_STATUSES,
  DEFAULT_TEMPLATE_TEXTS,
  pickTemplate,
  firstName,
  buildRecoveryLink,
  renderText,
  paramValue,
  type TemplateVars,
} from "@/lib/recovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MIN_GAP_HOURS: Record<number, number> = { 2: 12, 3: 24 }; // gap mínimo desde o toque anterior

function authorized(req: NextRequest): boolean {
  const cron = process.env.CRON_SECRET;
  const admin = process.env.IRIS_WEBHOOK_SECRET;
  const xc = req.headers.get("x-cron-secret") || "";
  const xa = req.headers.get("x-admin-secret") || "";
  return !!((cron && xc === cron) || (admin && xa === admin));
}

type Planned = {
  engagedPurchaseId: string;
  productSlug: string;
  campaignSlug: string | null;
  customerName: string | null;
  phone: string;
  status: string;
  step: number;
  templateKey: string;
  message: string;
  /** Template aprovado no ChatPro/Meta (config /admin/recovery). Null = texto livre. */
  chatproTemplate: string | null;
  /** Valores dos parâmetros {{1}},{{2}},... na ordem configurada. */
  tplParams: string[];
};

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const forceDry = url.searchParams.get("send") === "0";
  const sendEnabled =
    !forceDry && process.env.RECOVERY_SEND === "1" && chatproConfigured();

  const maxPerRun = Number(process.env.RECOVERY_MAX_PER_RUN || 20);
  const maxAgeDays = Number(process.env.RECOVERY_MAX_AGE_DAYS || 7);
  const voucher = process.env.RECOVERY_VOUCHER_CODE || null;
  const now = Date.now();

  // 1) Campanhas ativas com checkout Engaged
  const campaigns = await prisma.campaign.findMany({
    where: { status: "ACTIVE" },
    select: {
      slug: true,
      productSlug: true,
      startDate: true,
      impactaTurmaId: true,
      engagedCheckoutSharedIds: true,
    },
  });
  const byProduct = new Map(campaigns.map((c) => [c.productSlug, c]));

  // Config editável dos templates (/admin/recovery). Sem linha no DB = default.
  const templateCfg = new Map<
    string,
    { chatproTemplate: string | null; params: string[]; fallbackText: string | null; active: boolean }
  >();
  try {
    for (const t of await prisma.recoveryTemplate.findMany()) {
      templateCfg.set(t.key, {
        chatproTemplate: t.chatproTemplate,
        params: t.params,
        fallbackText: t.fallbackText,
        active: t.active,
      });
    }
  } catch { /* tabela ainda não migrada — usa defaults */ }

  const planned: Planned[] = [];
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => (skipped[reason] = (skipped[reason] ?? 0) + 1);

  for (const campaign of campaigns) {
    const sharedId = campaign.engagedCheckoutSharedIds[0];
    if (!sharedId) continue; // sem checkout Engaged — nada a recuperar
    const productSlug = campaign.productSlug;
    const product = getProductConfig(productSlug);
    const courseName = product?.name || productSlug;

    // 2) Candidatos + quem já pagou (pra filtrar)
    const [candidates, paidEngaged, sales] = await Promise.all([
      prisma.engagedPurchase.findMany({
        where: {
          productSlug,
          status: { in: [...RECOVERABLE_STATUSES] },
          firstSeenAt: { gte: campaign.startDate },
        },
        orderBy: { firstSeenAt: "desc" },
        take: 500,
      }),
      prisma.engagedPurchase.findMany({
        where: { productSlug, status: "PAID" },
        select: { customerEmail: true, customerPhone: true },
      }),
      prisma.sale.findMany({
        where: { productSlug },
        select: { customerEmail: true, customerPhone: true },
      }),
    ]);

    const paidEmails = new Set<string>();
    const paidPhones = new Set<string>();
    for (const r of [...paidEngaged, ...sales]) {
      if (r.customerEmail) paidEmails.add(r.customerEmail.toLowerCase().trim());
      const d = (r.customerPhone || "").replace(/\D/g, "");
      if (d.length >= 8) paidPhones.add(d.slice(-8));
    }

    // 3) Toques já dados (todos os candidatos numa query)
    const touches = await prisma.recoveryTouch.findMany({
      where: { engagedPurchaseId: { in: candidates.map((c) => c.id) } },
      select: { engagedPurchaseId: true, step: true, sentAt: true },
    });
    const touchesById = new Map<string, { step: number; sentAt: Date }[]>();
    for (const t of touches) {
      const arr = touchesById.get(t.engagedPurchaseId) ?? [];
      arr.push({ step: t.step, sentAt: t.sentAt });
      touchesById.set(t.engagedPurchaseId, arr);
    }

    for (const lead of candidates) {
      const phoneDigits = (lead.customerPhone || "").replace(/\D/g, "");
      if (phoneDigits.length < 10) { skip("sem_telefone"); continue; }
      if (looksSuspiciousPhone(normalizeWaNumber(lead.customerPhone!))) { skip("numero_suspeito"); continue; }
      if (lead.customerEmail && paidEmails.has(lead.customerEmail.toLowerCase().trim())) { skip("ja_pagou"); continue; }
      if (paidPhones.has(phoneDigits.slice(-8))) { skip("ja_pagou"); continue; }

      const prior = (touchesById.get(lead.id) ?? []).sort((a, b) => a.step - b.step);
      const nextStep = (prior.at(-1)?.step ?? 0) + 1;
      if (nextStep > MAX_STEPS) { skip("cadencia_completa"); continue; }

      const ageMin = (now - lead.firstSeenAt.getTime()) / 60000;
      // Backlog antigo sem nenhum toque: não iniciar cadência
      if (nextStep === 1 && ageMin > maxAgeDays * 24 * 60) { skip("stale"); continue; }

      const threshold = RECOVERY_STEPS.find((s) => s.step === nextStep);
      if (!threshold || ageMin < threshold.afterMinutes) { skip("aguardando_janela"); continue; }

      // Gap mínimo desde o toque anterior (evita rajada em lead antigo)
      const lastTouch = prior.at(-1);
      const gapH = MIN_GAP_HOURS[nextStep] ?? 0;
      if (lastTouch && now - lastTouch.sentAt.getTime() < gapH * 3600_000) { skip("gap_minimo"); continue; }

      const templateKey = pickTemplate(nextStep, lead.status, !!voucher);
      const cfg = templateCfg.get(templateKey);
      if (cfg && !cfg.active) { skip("template_inativo"); continue; }

      const link = buildRecoveryLink({
        sharedId,
        turmaId: campaign.impactaTurmaId,
        campaignSlug: campaign.slug,
        step: nextStep,
        voucherCode: voucher,
      });
      const vars: TemplateVars = {
        nome: firstName(lead.customerName),
        curso: courseName,
        link,
        cupom: voucher || undefined,
      };
      const message = renderText(
        cfg?.fallbackText || DEFAULT_TEMPLATE_TEXTS[templateKey],
        vars
      );
      const chatproTemplate = cfg?.chatproTemplate ?? null;
      const tplParams = chatproTemplate
        ? (cfg?.params ?? []).map((p) => paramValue(p, vars))
        : [];

      planned.push({
        engagedPurchaseId: lead.id,
        productSlug,
        campaignSlug: campaign.slug,
        customerName: lead.customerName,
        phone: normalizeWaNumber(lead.customerPhone!),
        status: lead.status,
        step: nextStep,
        templateKey,
        message,
        chatproTemplate,
        tplParams,
      });
    }
  }

  // 4) Cap por execução + envio (ou dry-run)
  const toSend = planned.slice(0, maxPerRun);
  const overflow = planned.length - toSend.length;

  let sent = 0;
  let errors = 0;
  const results: Array<Record<string, unknown>> = [];

  if (sendEnabled) {
    for (const p of toSend) {
      // Template aprovado (número oficial, proativo) quando configurado
      // em /admin/recovery; senão texto livre (só entrega com janela aberta).
      const r = p.chatproTemplate
        ? await sendWhatsAppTemplate(p.phone, p.chatproTemplate, p.tplParams)
        : await sendWhatsAppText(p.phone, p.message);
      try {
        await prisma.recoveryTouch.create({
          data: {
            engagedPurchaseId: p.engagedPurchaseId,
            productSlug: p.productSlug,
            campaignSlug: p.campaignSlug,
            channel: "whatsapp",
            step: p.step,
            // "step1_draft@recuperacao_1" = enviado via template Meta
            templateKey: p.chatproTemplate ? `${p.templateKey}@${p.chatproTemplate}` : p.templateKey,
            message: p.message,
            phone: p.phone,
            status: r.ok ? "sent" : "error",
            error: r.ok ? null : (r.error || "unknown").slice(0, 300),
          },
        });
      } catch {
        // unique violation (corrida entre execuções) — considera já tocado
      }
      if (r.ok) sent++; else errors++;
      results.push({ name: p.customerName, phone: p.phone, step: p.step, viaTemplate: p.chatproTemplate, ok: r.ok, error: r.error });
    }
  }

  return NextResponse.json({
    mode: sendEnabled ? "SEND" : "DRY_RUN",
    chatproConfigured: chatproConfigured(),
    campaigns: campaigns.filter((c) => byProduct.get(c.productSlug) === c).length,
    planned: planned.length,
    capped: overflow > 0 ? overflow : 0,
    sent,
    errors,
    skipped,
    preview: sendEnabled
      ? results
      : toSend.map((p) => ({
          name: p.customerName,
          phone: p.phone,
          status: p.status,
          step: p.step,
          template: p.templateKey,
          viaTemplate: p.chatproTemplate,
          message: p.message,
        })),
  });
}
