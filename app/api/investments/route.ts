/**
 * /api/investments — registrar (POST) e listar (GET) investimento de mídia
 * diário, lançado manualmente quando não há ingestão automática de Meta/Google.
 *
 * Armazenado por plataforma em MetricSample (source=META_ADS / GOOGLE_ADS,
 * metric="spend", bucket=DAY) pra somar junto com o spend ingerido e alimentar
 * o ROAS, mantendo a divisão Meta x Google nos gráficos e no resumo.
 *
 * GET  ?product=<slug>&days=<n>  : lista lançamentos de mídia do produto
 * POST {productSlug, date, meta?, google?, notes?}  : upsert do dia (idempotente)
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

const InvestmentInput = z
  .object({
    productSlug: z.string().min(2).max(64),
    // Dia do investimento em horario de Sao Paulo (YYYY-MM-DD).
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date deve ser YYYY-MM-DD"),
    meta: z.coerce.number().min(0).optional(),
    google: z.coerce.number().min(0).optional(),
    notes: z.string().max(500).nullish(),
  })
  .refine((d) => d.meta !== undefined || d.google !== undefined, {
    message: "informe ao menos meta ou google",
    path: ["meta"],
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
        source: { in: ["META_ADS", "GOOGLE_ADS", "MANUAL"] },
        metric: "spend",
        bucket: "DAY",
        startsAt: { gte: since },
      },
      orderBy: { startsAt: "desc" },
      select: { startsAt: true, value: true, source: true, meta: true },
    });
    // Agrupa por dia, separando Meta x Google (MANUAL legado entra no total).
    const byDate = new Map<
      string,
      { meta: number; google: number; amount: number; metaJson: unknown }
    >();
    for (const s of samples) {
      const date = s.startsAt.toISOString().slice(0, 10);
      const slot = byDate.get(date) ?? { meta: 0, google: 0, amount: 0, metaJson: null };
      const v = Number(s.value);
      if (s.source === "META_ADS") slot.meta += v;
      else if (s.source === "GOOGLE_ADS") slot.google += v;
      slot.amount += v;
      if (s.meta != null) slot.metaJson = s.meta;
      byDate.set(date, slot);
    }
    const investments = Array.from(byDate.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, v]) => ({
        date,
        meta: v.meta,
        google: v.google,
        amount: v.amount,
        notes: v.metaJson,
      }));
    return NextResponse.json({ product, investments });
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

  const { productSlug, date, meta: metaAmount, google: googleAmount, notes } = parsed.data;
  const startsAt = spMidnightUTC(date);
  const metaJson = notes ? { notes } : undefined;

  /** Upsert (ou remove se 0/undefined) de uma plataforma no dia. */
  async function upsertPlatform(source: "META_ADS" | "GOOGLE_ADS", amount?: number) {
    const where = {
      productSlug_source_metric_bucket_startsAt: {
        productSlug,
        source,
        metric: "spend",
        bucket: "DAY",
        startsAt,
      },
    } as const;
    if (amount === undefined) return; // plataforma não enviada: preserva valor existente
    await prisma.metricSample.upsert({
      where,
      create: {
        productSlug,
        source,
        metric: "spend",
        bucket: "DAY",
        startsAt,
        value: amount,
        unit: "BRL",
        meta: metaJson,
      },
      update: { value: amount, meta: metaJson },
    });
  }

  try {
    await upsertPlatform("META_ADS", metaAmount);
    await upsertPlatform("GOOGLE_ADS", googleAmount);
    // Remove lançamento MANUAL legado do dia pra não duplicar no total de mídia.
    await prisma.metricSample.deleteMany({
      where: { productSlug, source: "MANUAL", metric: "spend", bucket: "DAY", startsAt },
    });
    return NextResponse.json(
      {
        status: "saved",
        investment: {
          date,
          meta: metaAmount ?? 0,
          google: googleAmount ?? 0,
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
