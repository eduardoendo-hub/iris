/**
 * collect-portfolio-data — monta o snapshot que o Gestor de Tráfego analisa:
 * TODAS as campanhas rastreadas (TrackedCampaign ativas) lado a lado, com
 * métrica de mídia POR campanha (CampaignMetricSample) + funil da LP por
 * campanha (VisitEvent via utm_campaign) + comparações (7d vs 7d anteriores)
 * e medianas da carteira.
 *
 * Saída JSON-serializável → vai direto pro prompt da LLM.
 */
import { prisma } from "@/lib/prisma";
import { spDayBucketFromYMD } from "@/lib/time-buckets";

/** YYYY-MM-DD em SP, offset de dias atrás. */
function spDate(offsetDays: number): string {
  const d = new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
/** Boundary (instante UTC) do início do dia SP que está N dias atrás. */
function cutoff(daysAgo: number): Date {
  return spDayBucketFromYMD(spDate(daysAgo));
}

export type CampaignBlock = {
  trackedId: string;
  platform: "META" | "GOOGLE";
  label: string;
  externalId: string | null;
  campaignName: string | null;
  productSlug: string | null;
  utmCampaign: string | null;
  objective: string | null;
  targetCpl: number | null;
  targetRoas: number | null;

  // Mídia — janela 7d (precisa, da plataforma)
  spend7d: number;
  impressions7d: number;
  clicks7d: number;
  ctr7d: number; // %
  cpc7d: number; // R$
  spendYesterday: number;
  spendPrev7d: number; // 8–14 dias atrás
  spendTrendPct: number; // 7d vs prev7d, %
  daysWithData: number;

  // Funil da LP — janela 7d (só quando utmCampaign está cadastrado)
  hasLpJoin: boolean;
  visits7d: number;
  leads7d: number;
  whats7d: number;
  cpl7d: number | null; // spend7d / leads7d
  convVisitLead: number | null; // %
  cplVsTargetPct: number | null; // cpl7d vs targetCpl, % (negativo = melhor que meta)
};

export type PortfolioSnapshot = {
  analysisDate: string; // YYYY-MM-DD SP
  generatedAt: string;
  totals: {
    activeCampaigns: number;
    spend7d: number;
    leads7d: number;
    blendedCpl: number | null;
    metaSpend7d: number;
    googleSpend7d: number;
  };
  medians: {
    cpl7d: number | null;
    ctr7d: number | null;
    cpc7d: number | null;
  };
  campaigns: CampaignBlock[];
  notes: string[];
};

type MetricRow = { metric: string; value: unknown; startsAt: Date };

function sumMetric(rows: MetricRow[], metric: string, from: Date, to?: Date): number {
  return rows
    .filter((r) => r.metric === metric && r.startsAt >= from && (!to || r.startsAt < to))
    .reduce((acc, r) => acc + Number(r.value), 0);
}

function median(nums: number[]): number | null {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}

export async function collectPortfolioSnapshot(): Promise<PortfolioSnapshot> {
  const c7 = cutoff(6); // início do dia 6 dias atrás → cobre 7 dias (hoje incl.)
  const c14 = cutoff(13);
  const cYesterdayFrom = cutoff(1);
  const cYesterdayTo = cutoff(0); // início de hoje SP

  const tracked = await prisma.trackedCampaign.findMany({
    where: { active: true },
    orderBy: [{ platform: "asc" }, { createdAt: "desc" }],
  });

  const notes: string[] = [];
  const campaigns: CampaignBlock[] = [];

  for (const t of tracked) {
    // Métrica de mídia por campanha — precisa de externalId (vem da ingestão).
    let mediaRows: MetricRow[] = [];
    if (t.externalId) {
      mediaRows = await prisma.campaignMetricSample.findMany({
        where: { platform: t.platform, externalId: t.externalId, startsAt: { gte: c14 } },
        select: { metric: true, value: true, startsAt: true },
      });
    }

    const spend7d = sumMetric(mediaRows, "spend", c7);
    const impressions7d = sumMetric(mediaRows, "impressions", c7);
    const clicks7d = sumMetric(mediaRows, "clicks", c7);
    const spendYesterday = sumMetric(mediaRows, "spend", cYesterdayFrom, cYesterdayTo);
    const spendPrev7d = sumMetric(mediaRows, "spend", c14, c7);
    const ctr7d = impressions7d > 0 ? (clicks7d / impressions7d) * 100 : 0;
    const cpc7d = clicks7d > 0 ? spend7d / clicks7d : 0;
    const spendTrendPct = spendPrev7d > 0 ? ((spend7d - spendPrev7d) / spendPrev7d) * 100 : 0;
    const daysWithData = new Set(
      mediaRows.filter((r) => r.metric === "spend" && r.startsAt >= c7).map((r) => r.startsAt.getTime()),
    ).size;

    // Funil da LP por campanha — via utm_campaign (CPL real).
    let visits7d = 0;
    let leads7d = 0;
    let whats7d = 0;
    const hasLpJoin = !!t.utmCampaign;
    if (hasLpJoin) {
      const ev = await prisma.visitEvent.groupBy({
        by: ["eventName"],
        where: { utmCampaign: t.utmCampaign!, ts: { gte: c7 } },
        _count: { _all: true },
      });
      for (const row of ev) {
        const n = row._count._all;
        if (row.eventName === "lp_view") visits7d += n;
        else if (row.eventName === "lead_form") leads7d += n;
        else if (row.eventName === "click_whats") whats7d += n;
      }
    } else if (t.externalId || t.nameFilter) {
      notes.push(`Campanha "${t.label}" sem utm_campaign cadastrado → CPL por campanha indisponível (cadastre o utm_campaign na tela).`);
    }

    const cpl7d = hasLpJoin && leads7d > 0 ? spend7d / leads7d : null;
    const convVisitLead = hasLpJoin && visits7d > 0 ? (leads7d / visits7d) * 100 : null;
    const targetCpl = t.targetCpl != null ? Number(t.targetCpl) : null;
    const cplVsTargetPct = cpl7d != null && targetCpl != null && targetCpl > 0
      ? ((cpl7d - targetCpl) / targetCpl) * 100
      : null;

    if (t.externalId && daysWithData === 0) {
      notes.push(`Campanha "${t.label}" cadastrada mas sem dados de mídia ainda (rode a ingestão de portfólio ou aguarde o cron).`);
    }
    if (!t.externalId && !t.nameFilter) {
      notes.push(`Campanha "${t.label}" sem externalId nem nameFilter → impossível casar com a plataforma.`);
    }

    campaigns.push({
      trackedId: t.id,
      platform: t.platform as "META" | "GOOGLE",
      label: t.label,
      externalId: t.externalId,
      campaignName: null, // preenchido abaixo a partir do sample mais recente
      productSlug: t.productSlug,
      utmCampaign: t.utmCampaign,
      objective: t.objective,
      targetCpl,
      targetRoas: t.targetRoas != null ? Number(t.targetRoas) : null,
      spend7d,
      impressions7d,
      clicks7d,
      ctr7d,
      cpc7d,
      spendYesterday,
      spendPrev7d,
      spendTrendPct,
      daysWithData,
      hasLpJoin,
      visits7d,
      leads7d,
      whats7d,
      cpl7d,
      convVisitLead,
      cplVsTargetPct,
    });
  }

  // Nome da campanha (snapshot mais recente) — busca leve só pras que têm id.
  const idsWithData = campaigns.filter((c) => c.externalId).map((c) => c.externalId!) as string[];
  if (idsWithData.length > 0) {
    const names = await prisma.campaignMetricSample.findMany({
      where: { externalId: { in: idsWithData } },
      select: { externalId: true, campaignName: true },
      orderBy: { startsAt: "desc" },
    });
    const nameById = new Map<string, string>();
    for (const n of names) if (n.campaignName && !nameById.has(n.externalId)) nameById.set(n.externalId, n.campaignName);
    for (const c of campaigns) if (c.externalId) c.campaignName = nameById.get(c.externalId) ?? null;
  }

  const totalSpend7d = campaigns.reduce((a, c) => a + c.spend7d, 0);
  const totalLeads7d = campaigns.reduce((a, c) => a + c.leads7d, 0);
  const metaSpend7d = campaigns.filter((c) => c.platform === "META").reduce((a, c) => a + c.spend7d, 0);
  const googleSpend7d = campaigns.filter((c) => c.platform === "GOOGLE").reduce((a, c) => a + c.spend7d, 0);

  return {
    analysisDate: spDate(0),
    generatedAt: new Date().toISOString(),
    totals: {
      activeCampaigns: campaigns.length,
      spend7d: totalSpend7d,
      leads7d: totalLeads7d,
      blendedCpl: totalLeads7d > 0 ? totalSpend7d / totalLeads7d : null,
      metaSpend7d,
      googleSpend7d,
    },
    medians: {
      cpl7d: median(campaigns.map((c) => c.cpl7d).filter((x): x is number => x != null)),
      ctr7d: median(campaigns.filter((c) => c.impressions7d > 0).map((c) => c.ctr7d)),
      cpc7d: median(campaigns.filter((c) => c.clicks7d > 0).map((c) => c.cpc7d)),
    },
    campaigns,
    notes: Array.from(new Set(notes)),
  };
}
