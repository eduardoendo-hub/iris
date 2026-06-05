/**
 * /api/admin/insight — admin endpoint pra o agente de insights:
 *   GET  ?product=&days=N  → lista os ultimos N insights gerados
 *   POST ?action=generate&product=&date=YYYY-MM-DD  → gera (ou regenera) insight
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * Util pra backfill (regenerar insight de um dia passado), debug, ou
 * trigger manual sem esperar o cron.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProductConfig } from "@/lib/products";
import { getInsightCampaignContext } from "@/lib/campaigns";
import { collectDailySnapshot, spDayBucketUTC } from "@/lib/agent/collect-daily-data";
import { generateInsight } from "@/lib/agent/generate-insight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-admin-secret") || "") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const product = url.searchParams.get("product") || "claude-pro";
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "14", 10), 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const insights = await prisma.dailyInsight.findMany({
    where: { productSlug: product, analysisDate: { gte: since } },
    orderBy: { analysisDate: "desc" },
    select: {
      id: true,
      productSlug: true,
      campaignSlug: true,
      analysisDate: true,
      generatedAt: true,
      headline: true,
      summary: true,
      severity: true,
      recommendations: true,
      model: true,
      tokensIn: true,
      tokensOut: true,
      cachedTokensRead: true,
      promptVersion: true,
    },
  });
  return NextResponse.json({ product, days, total: insights.length, insights });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "generate";
  const productSlug = url.searchParams.get("product") || "claude-pro";
  const dateOverride = url.searchParams.get("date");
  const dryRun = url.searchParams.get("dry_run") === "true";

  if (action !== "generate") {
    return NextResponse.json(
      { error: "unknown_action", supported: ["generate"] },
      { status: 400 }
    );
  }

  const product = getProductConfig(productSlug);
  if (!product) {
    return NextResponse.json(
      { error: "product_not_in_registry", productSlug },
      { status: 404 }
    );
  }

  // Default: dia anterior em SP
  let analysisDateUTC: Date;
  if (dateOverride) {
    analysisDateUTC = new Date(dateOverride + "T03:00:00.000Z");
  } else {
    const nowMinusOneDay = new Date(Date.now() - 24 * 60 * 60 * 1000);
    analysisDateUTC = spDayBucketUTC(nowMinusOneDay);
  }

  // Contexto da campanha ATIVA (slug/janela/metas) vem do DB. Sem campanha
  // ativa, nao tem o que analisar — retorna 400 explicito.
  const ctx = await getInsightCampaignContext(productSlug);
  if (!ctx) {
    return NextResponse.json(
      { error: "no_active_campaign", productSlug, hint: "Crie/ative uma campanha em /admin/campaigns." },
      { status: 400 }
    );
  }

  try {
    const snapshot = await collectDailySnapshot({
      productSlug,
      campaignSlug: ctx.campaignSlug,
      campaignName: ctx.campaignName,
      campaignPlan: ctx.marketingPlan,
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
    return NextResponse.json({
      analysisDate: analysisDateUTC.toISOString(),
      snapshotPreview: {
        visitas: snapshot.captacao.visitas,
        clickCompra: snapshot.captacao.clickCompra,
        spendDia: snapshot.midia.spendDia,
        vendasDia: snapshot.vendas.novasDia,
      },
      ...r,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "insight_generation_failed",
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
