/**
 * collect-portfolio-data — snapshot que o Gestor de Tráfego analisa, AGRUPADO
 * por campanha da IRIS (Campaign). Cada campanha da IRIS traz suas campanhas de
 * mídia atreladas (TrackedCampaign → Meta/Google) com métrica precisa por
 * campanha (CampaignMetricSample), e o funil/leads vêm do campaignSlug que a LP
 * já manda (VisitEvent) — comparado contra o goalCpl da campanha.
 *
 * utm_campaign é opcional: quando preenchido numa campanha de mídia, dá leads/
 * CPL também no nível da campanha de mídia (separando dentro da campanha IRIS).
 *
 * Saída JSON-serializável → vai direto pro prompt da LLM.
 */
import { prisma } from "@/lib/prisma";
import { spDayBucketFromYMD } from "@/lib/time-buckets";
import { collectGoogleKeywordContext, type GoogleKwContext } from "./collect-google-keywords";

function spDate(offsetDays: number): string {
  const d = new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}
function cutoff(daysAgo: number): Date {
  return spDayBucketFromYMD(spDate(daysAgo));
}

export type PlatformChild = {
  trackedId: string;
  platform: "META" | "GOOGLE";
  label: string;
  externalId: string | null;
  campaignName: string | null;
  utmCampaign: string | null;
  spend7d: number;
  impressions7d: number;
  clicks7d: number;
  ctr7d: number;
  cpc7d: number;
  spendPrev7d: number;
  spendTrendPct: number;
  daysWithData: number;
  // só quando utm_campaign está preenchido nesta campanha de mídia
  leads7d: number | null;
  cpl7d: number | null;
};

export type IrisCampaignBlock = {
  campaignId: string;
  slug: string;
  name: string;
  productSlug: string;
  status: string;
  goalCpl: number | null;
  goalRoas: number | null;
  spend7d: number; // soma das filhas
  visits7d: number; // via campaignSlug
  leads7d: number;
  whats7d: number;
  cpl7d: number | null; // spend7d / leads7d
  cplVsGoalPct: number | null;
  convVisitLead: number | null;
  children: PlatformChild[];
};

export type PortfolioSnapshot = {
  analysisDate: string;
  generatedAt: string;
  totals: {
    irisCampaigns: number;
    platformCampaigns: number;
    spend7d: number;
    leads7d: number;
    blendedCpl: number | null;
    metaSpend7d: number;
    googleSpend7d: number;
  };
  medians: {
    cplIris7d: number | null;
    ctr7d: number | null;
    cpc7d: number | null;
  };
  campaigns: IrisCampaignBlock[];
  googleKeywords: GoogleKwContext[];
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

function reduceFunnel(ev: Array<{ eventName: string; _count: { _all: number } }>) {
  let visits = 0,
    leads = 0,
    whats = 0;
  for (const row of ev) {
    const n = row._count._all;
    if (row.eventName === "lp_view") visits += n;
    else if (row.eventName === "lead_form") leads += n;
    else if (row.eventName === "click_whats") whats += n;
  }
  return { visits, leads, whats };
}

// Nível da CAMPANHA IRIS: atribui por productSlug. A LP sempre marca
// product_slug='corporativo' (o IRIS só permite 1 campanha ATIVA por produto),
// então isso pega TODO o tráfego real da LP — independente do slug da turma ou
// dos utm_campaign. É o que a página de fato registra.
async function funnelByProduct(productSlug: string, from: Date) {
  const ev = await prisma.visitEvent.groupBy({
    by: ["eventName"],
    where: { productSlug, ts: { gte: from } },
    _count: { _all: true },
  });
  return reduceFunnel(ev);
}

// Nível da MÍDIA: a LP grava campaignSlug = utm_campaign (tráfego pago), então
// os leads de uma campanha de mídia casam pelo utm_campaign dela.
async function funnelBySlugs(slugs: string[], from: Date) {
  const clean = Array.from(new Set(slugs.filter(Boolean)));
  if (clean.length === 0) return { visits: 0, leads: 0, whats: 0 };
  const ev = await prisma.visitEvent.groupBy({
    by: ["eventName"],
    where: { campaignSlug: { in: clean }, ts: { gte: from } },
    _count: { _all: true },
  });
  return reduceFunnel(ev);
}

export async function collectPortfolioSnapshot(): Promise<PortfolioSnapshot> {
  const c7 = cutoff(6);
  const c14 = cutoff(13);
  const cYda = cutoff(1);
  const cToday = cutoff(0);

  // Campanhas da IRIS ATIVAS que têm campanhas de mídia vinculadas.
  const irisCampaigns = await prisma.campaign.findMany({
    where: { isActive: true, mediaCampaigns: { some: { active: true } } },
    select: {
      id: true,
      slug: true,
      name: true,
      productSlug: true,
      status: true,
      goalCpl: true,
      goalRoas: true,
      mediaCampaigns: {
        where: { active: true },
        select: { id: true, platform: true, externalId: true, label: true, utmCampaign: true },
      },
    },
    orderBy: { startDate: "desc" },
  });

  const notes: string[] = [];
  const blocks: IrisCampaignBlock[] = [];

  for (const ic of irisCampaigns) {
    const children: PlatformChild[] = [];

    for (const mc of ic.mediaCampaigns) {
      let rows: MetricRow[] = [];
      if (mc.externalId) {
        rows = await prisma.campaignMetricSample.findMany({
          where: { platform: mc.platform, externalId: mc.externalId, startsAt: { gte: c14 } },
          select: { metric: true, value: true, startsAt: true },
        });
      }
      const spend7d = sumMetric(rows, "spend", c7);
      const impressions7d = sumMetric(rows, "impressions", c7);
      const clicks7d = sumMetric(rows, "clicks", c7);
      const spendPrev7d = sumMetric(rows, "spend", c14, c7);
      const ctr7d = impressions7d > 0 ? (clicks7d / impressions7d) * 100 : 0;
      const cpc7d = clicks7d > 0 ? spend7d / clicks7d : 0;
      const spendTrendPct = spendPrev7d > 0 ? ((spend7d - spendPrev7d) / spendPrev7d) * 100 : 0;
      const daysWithData = new Set(
        rows.filter((r) => r.metric === "spend" && r.startsAt >= c7).map((r) => r.startsAt.getTime()),
      ).size;

      let childLeads: number | null = null;
      let childCpl: number | null = null;
      if (mc.utmCampaign) {
        const f = await funnelBySlugs([mc.utmCampaign], c7);
        childLeads = f.leads;
        childCpl = f.leads > 0 ? spend7d / f.leads : null;
      }

      if (mc.externalId && daysWithData === 0) {
        notes.push(`"${ic.name}" → mídia "${mc.label}" cadastrada mas sem dados ainda (rode a ingestão/cron).`);
      }
      if (!mc.externalId) {
        notes.push(`"${ic.name}" → mídia "${mc.label}" sem ID de campanha; rode a ingestão pra casar pelo nome.`);
      }

      children.push({
        trackedId: mc.id,
        platform: mc.platform as "META" | "GOOGLE",
        label: mc.label,
        externalId: mc.externalId,
        campaignName: null,
        utmCampaign: mc.utmCampaign,
        spend7d,
        impressions7d,
        clicks7d,
        ctr7d,
        cpc7d,
        spendPrev7d,
        spendTrendPct,
        daysWithData,
        leads7d: childLeads,
        cpl7d: childCpl,
      });
      void cYda;
      void cToday;
    }

    // Funil no nível da campanha IRIS: atribui por productSlug (todo o tráfego
    // real da LP do produto; 1 campanha ativa por produto garante a unicidade).
    const funnel = await funnelByProduct(ic.productSlug, c7);
    const spend7d = children.reduce((a, c) => a + c.spend7d, 0);
    const goalCpl = ic.goalCpl != null ? Number(ic.goalCpl) : null;
    const cpl7d = funnel.leads > 0 ? spend7d / funnel.leads : null;
    const cplVsGoalPct = cpl7d != null && goalCpl != null && goalCpl > 0 ? ((cpl7d - goalCpl) / goalCpl) * 100 : null;
    const convVisitLead = funnel.visits > 0 ? (funnel.leads / funnel.visits) * 100 : null;

    if (funnel.visits === 0 && funnel.leads === 0) {
      notes.push(`"${ic.name}" → 0 evento na LP para productSlug "${ic.productSlug}" nos últimos 7 dias. Confira se a LP envia esse product_slug.`);
    }

    blocks.push({
      campaignId: ic.id,
      slug: ic.slug,
      name: ic.name,
      productSlug: ic.productSlug,
      status: ic.status,
      goalCpl,
      goalRoas: ic.goalRoas != null ? Number(ic.goalRoas) : null,
      spend7d,
      visits7d: funnel.visits,
      leads7d: funnel.leads,
      whats7d: funnel.whats,
      cpl7d,
      cplVsGoalPct,
      convVisitLead,
      children,
    });
  }

  // Preenche nomes das campanhas de mídia (snapshot recente) numa tacada.
  const allIds = blocks.flatMap((b) => b.children.map((c) => c.externalId).filter(Boolean)) as string[];
  if (allIds.length > 0) {
    const names = await prisma.campaignMetricSample.findMany({
      where: { externalId: { in: allIds } },
      select: { externalId: true, campaignName: true },
      orderBy: { startsAt: "desc" },
    });
    const nameById = new Map<string, string>();
    for (const n of names) if (n.campaignName && !nameById.has(n.externalId)) nameById.set(n.externalId, n.campaignName);
    for (const b of blocks) for (const c of b.children) if (c.externalId) c.campaignName = nameById.get(c.externalId) ?? null;
  }

  const allChildren = blocks.flatMap((b) => b.children);
  const totalSpend = blocks.reduce((a, b) => a + b.spend7d, 0);
  const totalLeads = blocks.reduce((a, b) => a + b.leads7d, 0);

  // Contexto de keyword/termo de pesquisa do Google (Fase 3) — só campanhas
  // Google com id. Ao vivo; não bloqueia o snapshot se falhar.
  const googleCampaigns = allChildren
    .filter((c) => c.platform === "GOOGLE" && c.externalId)
    .map((c) => ({ externalId: c.externalId as string, label: c.label }));
  let googleKeywords: GoogleKwContext[] = [];
  try {
    googleKeywords = await collectGoogleKeywordContext(googleCampaigns, 7);
  } catch {
    googleKeywords = [];
  }

  return {
    analysisDate: spDate(0),
    generatedAt: new Date().toISOString(),
    totals: {
      irisCampaigns: blocks.length,
      platformCampaigns: allChildren.length,
      spend7d: totalSpend,
      leads7d: totalLeads,
      blendedCpl: totalLeads > 0 ? totalSpend / totalLeads : null,
      metaSpend7d: allChildren.filter((c) => c.platform === "META").reduce((a, c) => a + c.spend7d, 0),
      googleSpend7d: allChildren.filter((c) => c.platform === "GOOGLE").reduce((a, c) => a + c.spend7d, 0),
    },
    medians: {
      cplIris7d: median(blocks.map((b) => b.cpl7d).filter((x): x is number => x != null)),
      ctr7d: median(allChildren.filter((c) => c.impressions7d > 0).map((c) => c.ctr7d)),
      cpc7d: median(allChildren.filter((c) => c.clicks7d > 0).map((c) => c.cpc7d)),
    },
    campaigns: blocks,
    googleKeywords,
    notes: Array.from(new Set(notes)),
  };
}
