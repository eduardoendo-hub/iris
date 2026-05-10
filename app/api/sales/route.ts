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
  source: z.enum(["ENGAGED", "MANUAL", "OTHER"]).default("MANUAL"),
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
    return NextResponse.json({
      product,
      totalCount: agg._count._all,
      totalAmount: Number(agg._sum.amount ?? 0),
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
    return NextResponse.json({ status: "created", sale }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: "db_error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
