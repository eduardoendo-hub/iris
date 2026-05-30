/**
 * /api/investments — registrar (POST) e listar (GET) investimento de mídia
 * diário, lançado manualmente quando não há ingestão automática de Meta/Google.
 *
 * Armazenado em MetricSample (source=MANUAL, metric="spend", bucket=DAY) pra
 * somar junto com o spend ingerido das plataformas e alimentar o ROAS.
 *
 * GET  ?product=<slug>&days=<n>  : lista lançamentos manuais do produto
 * POST {productSlug, date, amount, notes?}  : upsert do dia (idempotente)
 *
 * Auth POST: X-Admin-Secret = IRIS_WEBHOOK_SECRET (mesmo padrão de /api/sales).
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

const InvestmentInput = z.object({
  productSlug: z.string().min(2).max(64),
  // Dia do investimento em horario de Sao Paulo (YYYY-MM-DD).
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date deve ser YYYY-MM-DD"),
  amount: z.coerce.number().min(0),
  notes: z.string().max(500).nullish(),
});

/** "YYYY-MM-DD" (SP) -> instante UTC da meia-noite SP (03:00 UTC). */
function spMidnightUTC(date: string): Date {
  return new Date(`${date}T03:00:00.000Z`);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const product = url.searchParams.get("product") || "claude-pro";
  const days = Math.min(parseInt(url.searchParams.get("days") || "60", 10), 180);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const samples = await prisma.metricSample.findMany({
      where: {
        productSlug: product,
        source: "MANUAL",
        metric: "spend",
        bucket: "DAY",
        startsAt: { gte: since },
      },
      orderBy: { startsAt: "desc" },
      select: { startsAt: true, value: true, meta: true },
    });
    return NextResponse.json({
      product,
      investments: samples.map((s) => ({
        date: s.startsAt.toISOString().slice(0, 10),
        amount: Number(s.value),
        meta: s.meta ?? null,
      })),
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
  const parsed = InvestmentInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }

  const { productSlug, date, amount, notes } = parsed.data;
  const startsAt = spMidnightUTC(date);
  const meta = notes ? { notes } : undefined;

  try {
    const sample = await prisma.metricSample.upsert({
      where: {
        productSlug_source_metric_bucket_startsAt: {
          productSlug,
          source: "MANUAL",
          metric: "spend",
          bucket: "DAY",
          startsAt,
        },
      },
      create: {
        productSlug,
        source: "MANUAL",
        metric: "spend",
        bucket: "DAY",
        startsAt,
        value: amount,
        unit: "BRL",
        meta,
      },
      update: { value: amount, meta },
    });
    return NextResponse.json(
      {
        status: "saved",
        investment: {
          date,
          amount: Number(sample.value),
          productSlug,
        },
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
