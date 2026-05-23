/**
 * /api/cron/google-ads — pull de spend/impressions/clicks via Google Ads API.
 *
 * Auth: header X-Cron-Secret = process.env.CRON_SECRET
 * Query: ?product=<slug>&days=<n>   (defaults: claude-pro, 7)
 *
 * Roda ingestGoogleAds. Idempotente — pode rodar a cada 15min sem duplicar.
 *
 * Pré-requisitos no Coolify (mesma chave usada pelo Meta):
 *   GOOGLE_ADS_DEVELOPER_TOKEN
 *   GOOGLE_ADS_CLIENT_ID
 *   GOOGLE_ADS_CLIENT_SECRET
 *   GOOGLE_ADS_REFRESH_TOKEN
 *   GOOGLE_ADS_CUSTOMER_ID
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID  (opcional, só se usar MCC)
 */
import { NextRequest, NextResponse } from "next/server";
import { ingestGoogleAds } from "@/lib/ingest/google-ads";
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
  // Caso contrario, ingere apenas o produto solicitado (legado).
  const slugs = productParam === "all" ? listProductSlugs() : [productParam];

  const results: Array<{ productSlug: string; [k: string]: unknown }> = [];
  const errors: Array<{ productSlug: string; error: string; code: number }> = [];

  for (const slug of slugs) {
    try {
      const result = await ingestGoogleAds({ productSlug: slug, days });
      results.push({ productSlug: slug, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const code =
        msg.includes("not configured") || msg.includes("nao configurada") ? 422 : 500;
      errors.push({ productSlug: slug, error: msg, code });
    }
  }

  const allFailed = errors.length === slugs.length && slugs.length > 0;
  const status = errors.length === 0 ? "ok" : allFailed ? "all_failed" : "partial";
  // Quando todas falham, devolve o codigo do primeiro erro pra cron reportar
  // failure no GitHub Actions; senao devolve 200 (parcial conta como sucesso).
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

export async function GET(req: NextRequest) {
  return POST(req);
}
