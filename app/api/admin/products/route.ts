/**
 * /api/admin/products — inspeciona o registro de produtos rodando em produção.
 *
 * Util pra confirmar que o deploy atual tem a config esperada (sharedIds,
 * productIds, filtros Meta/Google) sem precisar abrir o git.
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * Exemplo:
 *   curl -s -H "X-Admin-Secret: ..." https://iris.technowhub.ai/api/admin/products | jq
 */
import { NextRequest, NextResponse } from "next/server";
import { PRODUCTS } from "@/lib/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-admin-secret") || "") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const slugs = Object.keys(PRODUCTS);
  const products = slugs.map((slug) => {
    const p = PRODUCTS[slug];
    return {
      slug: p.slug,
      name: p.name,
      lpUrl: p.lpUrl,
      campaignSlug: p.campaignSlug ?? null,
      metaCampaignFilter: p.metaCampaignFilter ?? null,
      googleCampaignFilter: p.googleCampaignFilter ?? null,
      engagedCheckoutSharedIds: p.engagedCheckoutSharedIds ?? [],
      engagedProductIds: p.engagedProductIds ?? [],
      // Sinaliza configs incompletas pra debug rapido
      warnings: [
        !p.metaCampaignFilter && "metaCampaignFilter ausente",
        !p.googleCampaignFilter && "googleCampaignFilter ausente",
        (!p.engagedCheckoutSharedIds || p.engagedCheckoutSharedIds.length === 0) &&
          "engagedCheckoutSharedIds vazio (vai vazar vendas alheias)",
        (!p.engagedProductIds || p.engagedProductIds.length === 0) &&
          "engagedProductIds vazio (fallback ausente)",
      ].filter(Boolean) as string[],
    };
  });

  return NextResponse.json({
    total: products.length,
    products,
    // Echo das envs criticas mascaradas — confirma que o container subiu
    // com config esperada sem expor segredos.
    env: {
      has_iris_webhook_secret: Boolean(process.env.IRIS_WEBHOOK_SECRET),
      has_engaged_webhook_token: Boolean(process.env.ENGAGED_WEBHOOK_TOKEN),
      has_meta_access_token: Boolean(process.env.META_ACCESS_TOKEN),
      has_google_ads_refresh_token: Boolean(process.env.GOOGLE_ADS_REFRESH_TOKEN),
    },
  });
}
