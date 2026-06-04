/**
 * /api/cron/daily-insight — gera insight estratégico do dia anterior pra
 * todos os produtos ativos. Chamado pelo cron Coolify 05:00 SP diariamente.
 *
 * Auth: header X-Cron-Secret = process.env.CRON_SECRET
 * Query:
 *   ?product=claude-pro  (opcional — default: todos os products do registry)
 *   ?date=YYYY-MM-DD     (opcional — default: ontem em SP)
 *   ?dry_run=true        (opcional — não chama LLM, só verifica setup)
 */
import { NextRequest, NextResponse } from "next/server";
import { listProductSlugs, getProductConfig } from "@/lib/products";
import { collectDailySnapshot, spDayBucketUTC } from "@/lib/agent/collect-daily-data";
import { generateInsight } from "@/lib/agent/generate-insight";
import { getInsightCampaignContext } from "@/lib/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min — adaptive thinking pode demorar

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-cron-secret") || "") === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const productFilter = url.searchParams.get("product");
  const dateOverride = url.searchParams.get("date"); // YYYY-MM-DD SP
  const dryRun = url.searchParams.get("dry_run") === "true";

  const slugs = productFilter ? [productFilter] : listProductSlugs();

  // Calcula a data analisada — ontem em SP por default
  let analysisDateUTC: Date;
  if (dateOverride) {
    analysisDateUTC = new Date(dateOverride + "T03:00:00.000Z");
  } else {
    const nowMinusOneDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
    analysisDateUTC = spDayBucketUTC(nowMinusOneDay);
  }

  const results: Array<{
    productSlug: string;
    campaignSlug?: string;
    outcome: string;
    insightId?: string;
    reason?: string;
    tokensIn?: number;
    tokensOut?: number;
    cachedTokensRead?: number;
  }> = [];

  for (const slug of slugs) {
    const product = getProductConfig(slug);
    if (!product) {
      results.push({ productSlug: slug, outcome: "error", reason: "product_not_in_registry" });
      continue;
    }

    // Contexto da campanha ATIVA (slug/janela/metas) vem do DB — nao mais
    // hardcoded da turma de maio. Sem campanha ativa, PULA (nao gera insight
    // com contexto errado). Campanha nova entra automaticamente assim que vira
    // ACTIVE — sem tocar codigo.
    const ctx = await getInsightCampaignContext(slug);
    if (!ctx) {
      results.push({ productSlug: slug, outcome: "skipped", reason: "no_active_campaign" });
      continue;
    }

    try {
      const snapshot = await collectDailySnapshot({
        productSlug: slug,
        campaignSlug: ctx.campaignSlug,
        campaignName: ctx.campaignName,
        analysisDateUTC,
        campaignStartISO: ctx.startISO,
        campaignEnrollmentEndISO: ctx.endISO,
        campaignGoals: ctx.goals,
      });

      const r = await generateInsight({
        snapshot,
        campaignSlug: ctx.campaignSlug,
        dryRun,
      });

      results.push({ productSlug: slug, campaignSlug: ctx.campaignSlug, ...r });
    } catch (err) {
      results.push({
        productSlug: slug,
        campaignSlug: ctx.campaignSlug,
        outcome: "error",
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    status: "ok",
    analysisDate: analysisDateUTC.toISOString(),
    dryRun,
    products: slugs.length,
    results,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
