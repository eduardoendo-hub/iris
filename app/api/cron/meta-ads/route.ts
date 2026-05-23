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
import { listProductSlugs } from "@/lib/products";

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
  const productParam = url.searchParams.get("product") || "claude-pro";
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "7", 10), 1), 30);

  // ?product=all → itera sobre todos os produtos cadastrados em lib/products.ts.
  const slugs = productParam === "all" ? listProductSlugs() : [productParam];

  const results: Array<{ productSlug: string; [k: string]: unknown }> = [];
  const errors: Array<{ productSlug: string; error: string; code: number }> = [];

  for (const slug of slugs) {
    try {
      const result = await ingestMetaAds({ productSlug: slug, days });
      // productSlug por ultimo: garante que o slug do loop sobrescreve qualquer
      // valor que o `result` traga (evita TS "specified more than once" warning).
      results.push({ ...result, productSlug: slug });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code =
        msg.includes("not configured") || msg.includes("nao configurada") ? 422 : 500;
      errors.push({ productSlug: slug, error: msg, code });
    }
  }

  const allFailed = errors.length === slugs.length && slugs.length > 0;
  const status = errors.length === 0 ? "ok" : allFailed ? "all_failed" : "partial";
  const httpCode = allFailed ? errors[0].code : 200;

  return NextResponse.json(
    {
      status,
      productsRequested: slugs,
      results,
      errors: errors.length ? errors : undefined,
    },
    { status: httpCode },
  );
}

// GET pra debug rapido (mesmo auth)
export async function GET(req: NextRequest) {
  return POST(req);
}
