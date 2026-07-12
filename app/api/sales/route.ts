/**
 * /api/sales — listar (GET) e criar (POST) vendas manualmente.
 *
 * GET ?product=<slug>&limit=<n>  : lista vendas do produto
 * POST {productSlug, customerName, customerEmail?, customerPhone?, amount, saleDate?, notes?}
 *
 * Auth POST: X-Admin-Secret = IRIS_WEBHOOK_SECRET (mesma chave por enquanto;
 * separar em IRIS_ADMIN_SECRET no hardening pos-launch).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { promoteSiblingLeadsToPaid } from "@/lib/engaged-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-admin-secret") || "";
  return provided === secret;
}

const SaleInput = z.object({
  productSlug: z.string().min(2).max(64),
  source: z.enum(["ENGAGED", "DIRETA", "CONSULTOR", "SISTEMA", "MANUAL", "OTHER"]).default("DIRETA"),
  customerName: z.string().min(1).max(200),
  customerEmail: z.string().email().nullish(),
  customerPhone: z.string().max(40).nullish(),
  amount: z.coerce.number().positive(),
  currency: z.string().length(3).default("BRL"),
  saleDate: z.coerce.date().optional(),
  externalId: z.string().nullish(),
  externalRef: z.string().nullish(),
  notes: z.string().max(2000).nullish(),
});

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const product = url.searchParams.get("product") || "claude-pro";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);

  try {
    const sales = await prisma.sale.findMany({
      where: { productSlug: product },
      orderBy: { saleDate: "desc" },
      take: limit,
    });
    const agg = await prisma.sale.aggregate({
      where: { productSlug: product },
      _sum: { amount: true },
      _count: { _all: true },
    });
    // Quebra por origem (Diretas vs Consultor vs Engaged)
    const grouped = await prisma.sale.groupBy({
      by: ["source"],
      where: { productSlug: product },
      _count: { _all: true },
      _sum: { amount: true },
    });
    const bySource: Record<string, { count: number; amount: number }> = {};
    for (const g of grouped) {
      bySource[g.source] = {
        count: g._count._all,
        amount: Number(g._sum.amount ?? 0),
      };
    }
    return NextResponse.json({
      product,
      totalCount: agg._count._all,
      totalAmount: Number(agg._sum.amount ?? 0),
      bySource,
      sales,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "db_error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = SaleInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  try {
    const sale = await prisma.sale.create({ data: parsed.data });

    // Apos criar venda manual (consultor, direta, manual), tenta remover
    // o cliente da lista de "Leads Engaged" — pode ja ter capturado por
    // outro canal antes do consultor fechar.
    let dedup: Awaited<ReturnType<typeof promoteSiblingLeadsToPaid>> | null = null;
    try {
      dedup = await promoteSiblingLeadsToPaid({
        productSlug: sale.productSlug,
        target: {
          customerEmail: sale.customerEmail,
          customerPhone: sale.customerPhone,
          customerName: sale.customerName,
        },
        reason: `manual sale ${sale.source}:${sale.id}`,
      });
    } catch (err) {
      // best-effort — nao quebra criacao da venda
      console.error("[sales] dedup engaged leads failed:", err);
    }

    return NextResponse.json(
      {
        status: "created",
        sale,
        engagedLeadsPromoted: dedup?.promotedIds.length ?? 0,
        engagedLeadsMatchedBy: dedup?.matchedBy ?? [],
      },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      { error: "db_error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
