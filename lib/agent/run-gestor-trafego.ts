/**
 * runGestorTrafego — orquestra o ciclo do Gestor de Tráfego:
 *   1. Ingestão por campanha (Meta + Google) → CampaignMetricSample
 *   2. Coleta do snapshot da carteira
 *   3. Geração das recomendações (Claude) → AgentRecommendation
 *
 * Usado tanto pelo cron diário quanto pelo botão "Atualizar análise" (ADM).
 */
import { ingestPortfolio } from "@/lib/ingest/portfolio";
import { collectPortfolioSnapshot } from "@/lib/agent/collect-portfolio-data";
import { generatePortfolioRecs } from "@/lib/agent/generate-portfolio-recs";

export async function runGestorTrafego(opts: { days?: number; dryRun?: boolean; skipIngest?: boolean } = {}) {
  const days = opts.days ?? 7;

  const ingest = opts.skipIngest ? null : await ingestPortfolio({ days });
  const snapshot = await collectPortfolioSnapshot();
  const recs = await generatePortfolioRecs({ snapshot, dryRun: opts.dryRun });

  return {
    ok: recs.outcome !== "error",
    ingest,
    snapshot: {
      analysisDate: snapshot.analysisDate,
      irisCampaigns: snapshot.totals.irisCampaigns,
      platformCampaigns: snapshot.totals.platformCampaigns,
      spend7d: snapshot.totals.spend7d,
      leads7d: snapshot.totals.leads7d,
      notes: snapshot.notes,
    },
    recs,
  };
}
