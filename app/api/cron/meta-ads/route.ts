/**
 * /api/cron/meta-ads — chamado pelo cron (GitHub Actions ou manual).
 *
 * Auth: header X-Cron-Secret = process.env.CRON_SECRET
 * Query: ?product=<slug>&days=<n>   (defaults: claude-pro, 7)
 *
 * Roda ingestMetaAds. Idempotente — pode rodar a cada 1h sem duplicar.
 *
 * Resposta: 200 com {productSlug, daysFetched, samplesUpserted, details}
 */
import { NextRequest, NextResponse } from "next/server";
import { ingestMetaAds } from "@/lib/ingest/meta-ads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-cron-secret") || "";
  return provided === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const productSlug = url.searchParams.get("product") || "claude-pro";
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "7", 10), 1), 30);

  try {
    const result = await ingestMetaAds({ productSlug, days });
    return NextResponse.json({ status: "ok", ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code =
      msg.includes("not configured") ||
      msg.includes("nao configurada")
        ? 422
        : 500;
    return NextResponse.json({ error: "ingest_failed", message: msg }, { status: code });
  }
}

// GET pra debug rapido (mesmo auth)
export async function GET(req: NextRequest) {
  return POST(req);
}
