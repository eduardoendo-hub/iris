/**
 * /api/cron/ga4 — chamado pelo cron (GitHub Actions ou manual via curl).
 *
 * Auth: header X-Cron-Secret = process.env.CRON_SECRET
 * Query: ?product=<slug>&days=<n>   (defaults: claude-pro, 7)
 *
 * Roda ingestGA4 pro product+dias informado. Idempotente — pode rodar
 * a cada 10min sem duplicar.
 *
 * Resposta: 200 com {productSlug, daysFetched, samplesUpserted, details}
 */
import { NextRequest, NextResponse } from "next/server";
import { ingestGA4 } from "@/lib/ingest/ga4";

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
    const result = await ingestGA4({ productSlug, days });
    return NextResponse.json({ status: "ok", ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code =
      msg.includes("not configured") ||
      msg.includes("nao configurada") ||
      msg.includes("invalid")
        ? 422
        : 500;
    return NextResponse.json({ error: "ingest_failed", message: msg }, { status: code });
  }
}

// Permite GET pra debug rapido (mesmo auth)
export async function GET(req: NextRequest) {
  return POST(req);
}
