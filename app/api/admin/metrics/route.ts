/**
 * /api/admin/metrics — inspeciona MetricSample DAY pra debug.
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * GET ?product=claude-pro&days=14
 *   -> lista samples agrupados por (source, metric, date SP)
 *
 * POST ?product=claude-pro&days=14&action=ingest-google-ads
 *   -> dispara ingest Google Ads (manual trigger) e devolve detail
 *
 * Util quando o cron nao rodou ou pra comparar com Google Ads UI.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ingestGoogleAds } from "@/lib/ingest/google-ads";
import { ingestMetaAds } from "@/lib/ingest/meta-ads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-admin-secret") || "") === secret;
}

function spDateFromBucket(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const product = url.searchParams.get("product") || "claude-pro";
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "14", 10), 1), 90);

  const sinceUTC = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await prisma.metricSample.findMany({
    where: {
      productSlug: product,
      bucket: "DAY",
      startsAt: { gte: sinceUTC },
    },
    orderBy: { startsAt: "desc" },
    select: { source: true, metric: true, value: true, startsAt: true, unit: true },
  });

  // Pivot por (date SP, source, metric)
  const byDate = new Map<string, Record<string, number | string>>();
  for (const r of rows) {
    const date = spDateFromBucket(r.startsAt);
    let cur = byDate.get(date);
    if (!cur) {
      cur = { date };
      byDate.set(date, cur);
    }
    const k = `${r.source}.${r.metric}`;
    cur[k] = Number(r.value);
  }
  const series = Array.from(byDate.values()).sort((a, b) =>
    String(b.date).localeCompare(String(a.date))
  );

  // Soma agregada (todo periodo)
  const totals: Record<string, number> = {};
  for (const r of rows) {
    const k = `${r.source}.${r.metric}`;
    totals[k] = (totals[k] ?? 0) + Number(r.value);
  }

  return NextResponse.json({
    product,
    period_days: days,
    total_rows: rows.length,
    totals,
    series,
  });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const product = url.searchParams.get("product") || "claude-pro";
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "14", 10), 1), 30);
  const action = url.searchParams.get("action") || "ingest-google-ads";

  try {
    if (action === "ingest-google-ads") {
      const result = await ingestGoogleAds({ productSlug: product, days });
      return NextResponse.json({ action, result });
    }
    if (action === "ingest-meta-ads") {
      const result = await ingestMetaAds({ productSlug: product, days });
      return NextResponse.json({ action, result });
    }
    return NextResponse.json(
      { error: "unknown_action", supported: ["ingest-google-ads", "ingest-meta-ads"] },
      { status: 400 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "ingest_failed", action, message: msg }, { status: 500 });
  }
}
