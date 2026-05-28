/**
 * /api/admin/purge-leads — remoção DIRECIONADA de leads/compras de teste,
 * por lista de emails e TRAVADA num productSlug. Pensado pra limpar a base
 * antes do go-live sem afetar leads reais nem outros produtos.
 *
 * Apaga em: Lead, EngagedPurchase, Sale (todos filtrados por productSlug +
 * email/customerEmail na lista). NÃO toca em RD CRM (sistema externo).
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * Params (query):
 *   ?product=codigozero            (OBRIGATÓRIO — escopo travado)
 *   ?emails=a@x.com,b@y.com        (OBRIGATÓRIO — lista separada por vírgula)
 *
 * Uso:
 *   # 1. preview (dry-run, não apaga) — mostra exatamente o que casa
 *   curl -H "X-Admin-Secret: ..." \
 *     "https://iris.../api/admin/purge-leads?product=codigozero&emails=a@x.com,b@y.com"
 *
 *   # 2. apagar (requer header de confirmação)
 *   curl -X POST -H "X-Admin-Secret: ..." -H "X-Confirm-Purge: yes" \
 *     "https://iris.../api/admin/purge-leads?product=codigozero&emails=a@x.com,b@y.com"
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-admin-secret") || "") === secret;
}

type Params = { product: string; emails: string[] };

function parseParams(req: NextRequest): Params | { error: string } {
  const url = new URL(req.url);
  const product = (url.searchParams.get("product") || "").trim();
  if (!product) return { error: "param 'product' obrigatório (escopo travado)" };
  const raw = (url.searchParams.get("emails") || "").trim();
  const emails = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (emails.length === 0) return { error: "param 'emails' obrigatório (lista separada por vírgula)" };
  return { product, emails };
}

function whereFor(product: string, emails: string[], emailField: "email" | "customerEmail") {
  return {
    productSlug: product,
    OR: emails.map((e) => ({ [emailField]: { equals: e, mode: "insensitive" as const } })),
  };
}

async function findMatches(product: string, emails: string[]) {
  const [leads, purchases, sales] = await Promise.all([
    prisma.lead.findMany({
      where: whereFor(product, emails, "email"),
      select: { id: true, eventType: true, name: true, email: true, phone: true, rdCrmDealId: true, capturedAt: true },
      orderBy: { capturedAt: "desc" },
    }),
    prisma.engagedPurchase.findMany({
      where: whereFor(product, emails, "customerEmail"),
      select: { id: true, status: true, customerName: true, customerEmail: true, amount: true, eventAt: true },
      orderBy: { eventAt: "desc" },
    }),
    prisma.sale.findMany({
      where: whereFor(product, emails, "customerEmail"),
      select: { id: true, source: true, customerName: true, customerEmail: true, amount: true, saleDate: true },
      orderBy: { saleDate: "desc" },
    }),
  ]);
  return { leads, purchases, sales };
}

// Preview — não apaga
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = parseParams(req);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const matches = await findMatches(parsed.product, parsed.emails);
    return NextResponse.json({
      status: "preview",
      product: parsed.product,
      emails: parsed.emails,
      will_delete: {
        leads: matches.leads.length,
        engagedPurchases: matches.purchases.length,
        sales: matches.sales.length,
      },
      matches,
      to_confirm: "POST com X-Confirm-Purge: yes",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "db_error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// Apaga — requer X-Confirm-Purge: yes
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (req.headers.get("x-confirm-purge") !== "yes") {
    return NextResponse.json(
      { error: "confirmation_required", message: "Adicione header 'X-Confirm-Purge: yes'. Operação destrutiva." },
      { status: 400 }
    );
  }
  const parsed = parseParams(req);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const before = await findMatches(parsed.product, parsed.emails);
    const [delLeads, delPurchases, delSales] = await Promise.all([
      prisma.lead.deleteMany({ where: whereFor(parsed.product, parsed.emails, "email") }),
      prisma.engagedPurchase.deleteMany({ where: whereFor(parsed.product, parsed.emails, "customerEmail") }),
      prisma.sale.deleteMany({ where: whereFor(parsed.product, parsed.emails, "customerEmail") }),
    ]);
    return NextResponse.json({
      status: "ok",
      product: parsed.product,
      emails: parsed.emails,
      deleted: {
        leads: delLeads.count,
        engagedPurchases: delPurchases.count,
        sales: delSales.count,
      },
      deleted_ids: {
        leads: before.leads.map((l) => l.id),
        engagedPurchases: before.purchases.map((p) => p.id),
        sales: before.sales.map((s) => s.id),
      },
      message: "Purge aplicado. Refresh https://iris.technowhub.ai/ pra ver.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "db_error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
