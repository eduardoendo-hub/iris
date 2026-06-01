/**
 * Helpers de query pra view analitica do IRIS.
 *
 * Agrupa MetricSample (eventos GA4) e Sale (vendas) por dia
 * em America/Sao_Paulo, retornando series temporais prontas
 * pra alimentar Recharts.
 */
import { prisma } from "@/lib/prisma";

export type DailyEventPoint = {
  date: string; // ISO YYYY-MM-DD (SP)
  lp_view: number;
  click_compra: number;
  click_consultor: number;
  click_whats: number;
  lead_form: number;
};

export type DailySalesPoint = {
  date: string;             // ISO YYYY-MM-DD (SP)
  count: number;            // qtd de vendas no dia
  revenue: number;          // soma R$ do dia
  cumulativeRevenue: number;// soma corrente desde o inicio do periodo
  cumulativeCount: number;  // contagem corrente
};

export type DailyInvestmentPoint = {
  date: string;            // ISO YYYY-MM-DD (SP)
  spendMeta: number;       // investido em Meta Ads no dia (R$)
  spendGoogle: number;     // investido em Google Ads no dia (R$)
  spend: number;           // total do dia (Meta + Google + legado manual)
  cumulativeSpend: number; // soma corrente do total desde o inicio do periodo
};

export type CampaignResults = {
  salesCount: number;       // Vendas Totais (janela da campanha)
  revenue: number;          // Receita (R$)
  mediaInvestment: number;  // Investimento Midia total (Meta + Google + manual)
  mediaMeta: number;        // parte Meta Ads
  mediaGoogle: number;      // parte Google Ads
  totalInvestment: number;  // Investimento Total (midia + custos de producao)
  roas: number;             // Receita / Investimento Total
  campaignStart: string | null; // YYYY-MM-DD (data de ativacao)
  campaignEnd: string | null;   // YYYY-MM-DD (data de desativacao prevista)
};

/** Fontes de spend que somam como investimento de midia. */
const MEDIA_SPEND_SOURCES = ["META_ADS", "GOOGLE_ADS", "MANUAL"] as const;

/** Retorna array de YYYY-MM-DD (SP) cobrindo o periodo, sem buracos. */
function spDateRange(days: number): string[] {
  const dates: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    dates.push(spDateString(d));
  }
  return dates;
}

/** Date -> "YYYY-MM-DD" no fuso America/Sao_Paulo. */
function spDateString(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Pega samples de MetricSample dos ultimos `days` dias e empacota
 * num array com 1 ponto por dia. Buracos viram zero.
 */
export async function getDailyEvents(opts: {
  productSlug: string;
  days: number;
}): Promise<DailyEventPoint[]> {
  const { productSlug } = opts;
  const days = Math.min(Math.max(opts.days, 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  let samples: Array<{ metric: string; startsAt: Date; value: unknown }> = [];
  try {
    samples = await prisma.metricSample.findMany({
      where: {
        productSlug,
        bucket: "DAY",
        startsAt: { gte: since },
      },
      orderBy: { startsAt: "asc" },
      select: { metric: true, startsAt: true, value: true },
    });
  } catch {
    // Tabela nao existe ainda
    samples = [];
  }

  const dateRange = spDateRange(days);
  const map = new Map<string, DailyEventPoint>();
  for (const dt of dateRange) {
    map.set(dt, {
      date: dt,
      lp_view: 0,
      click_compra: 0,
      click_consultor: 0,
      click_whats: 0,
      lead_form: 0,
    });
  }
  for (const s of samples) {
    const dt = spDateString(s.startsAt);
    const point = map.get(dt);
    if (!point) continue;
    const v = Number(s.value);
    if (s.metric in point) {
      (point as unknown as Record<string, number>)[s.metric] = v;
    } else if (s.metric === "sessions") {
      // sessions vinha do ingest GA4 antigo — mapeia pra lp_view
      point.lp_view = Math.max(point.lp_view, v);
    }
  }
  return Array.from(map.values());
}

/**
 * Pega vendas dos ultimos `days` dias agrupadas por dia (SP).
 * Calcula tambem cumulative revenue/count.
 */
export async function getDailySales(opts: {
  productSlug: string;
  days: number;
}): Promise<DailySalesPoint[]> {
  const { productSlug } = opts;
  const days = Math.min(Math.max(opts.days, 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  let sales: Array<{ amount: unknown; saleDate: Date }> = [];
  try {
    sales = await prisma.sale.findMany({
      where: { productSlug, saleDate: { gte: since } },
      orderBy: { saleDate: "asc" },
      select: { amount: true, saleDate: true },
    });
  } catch {
    sales = [];
  }

  const dateRange = spDateRange(days);
  const map = new Map<string, { count: number; revenue: number }>();
  for (const dt of dateRange) map.set(dt, { count: 0, revenue: 0 });
  for (const s of sales) {
    const dt = spDateString(s.saleDate);
    const slot = map.get(dt);
    if (!slot) continue;
    slot.count += 1;
    slot.revenue += Number(s.amount);
  }

  let cumRev = 0;
  let cumCount = 0;
  const out: DailySalesPoint[] = [];
  for (const dt of dateRange) {
    const slot = map.get(dt)!;
    cumRev += slot.revenue;
    cumCount += slot.count;
    out.push({
      date: dt,
      count: slot.count,
      revenue: slot.revenue,
      cumulativeRevenue: cumRev,
      cumulativeCount: cumCount,
    });
  }
  return out;
}

/**
 * Investimento de midia por dia (SP) nos ultimos `days` dias.
 * Soma spend de Meta + Google (ingerido) + lancamentos MANUAL.
 * Retorna diario + acumulado, mesmo formato de getDailySales.
 */
export async function getDailyInvestments(opts: {
  productSlug: string;
  days: number;
}): Promise<DailyInvestmentPoint[]> {
  const { productSlug } = opts;
  const days = Math.min(Math.max(opts.days, 1), 90);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  let samples: Array<{ startsAt: Date; value: unknown; source: string }> = [];
  try {
    samples = await prisma.metricSample.findMany({
      where: {
        productSlug,
        bucket: "DAY",
        metric: "spend",
        source: { in: [...MEDIA_SPEND_SOURCES] },
        startsAt: { gte: since },
      },
      orderBy: { startsAt: "asc" },
      select: { startsAt: true, value: true, source: true },
    });
  } catch {
    samples = [];
  }

  const dateRange = spDateRange(days);
  const map = new Map<string, { meta: number; google: number; other: number }>();
  for (const dt of dateRange) map.set(dt, { meta: 0, google: 0, other: 0 });
  for (const s of samples) {
    const dt = spDateString(s.startsAt);
    const slot = map.get(dt);
    if (!slot) continue;
    const v = Number(s.value);
    if (s.source === "META_ADS") slot.meta += v;
    else if (s.source === "GOOGLE_ADS") slot.google += v;
    else slot.other += v; // MANUAL legado
  }

  let cum = 0;
  const out: DailyInvestmentPoint[] = [];
  for (const dt of dateRange) {
    const slot = map.get(dt) ?? { meta: 0, google: 0, other: 0 };
    const spend = slot.meta + slot.google + slot.other;
    cum += spend;
    out.push({
      date: dt,
      spendMeta: slot.meta,
      spendGoogle: slot.google,
      spend,
      cumulativeSpend: cum,
    });
  }
  return out;
}

/**
 * Sumario "Resultados" da campanha: Vendas Totais, Receita, Investimento
 * (midia e total) e ROAS. Tudo escopado a janela da campanha selecionada
 * (de startDate em diante); sem campanha cai pra all-time.
 */
export async function getCampaignResults(opts: {
  productSlug: string;
  campaignSlug?: string | null;
}): Promise<CampaignResults> {
  const { productSlug } = opts;

  const select = {
    startDate: true,
    endDate: true,
    endedAt: true,
    status: true,
    frozenResults: true,
    productionCostLP: true,
    productionCostAds: true,
    productionCostOther: true,
  } as const;

  let campaign:
    | {
        startDate: Date;
        endDate: Date;
        endedAt: Date | null;
        status: "DRAFT" | "ACTIVE" | "ENDED";
        frozenResults: unknown;
        productionCostLP: unknown;
        productionCostAds: unknown;
        productionCostOther: unknown;
      }
    | null = null;
  try {
    campaign = opts.campaignSlug
      ? await prisma.campaign.findUnique({ where: { slug: opts.campaignSlug }, select })
      : await prisma.campaign.findFirst({
          where: { productSlug, status: "ACTIVE" },
          select,
        });
  } catch {
    campaign = null;
  }

  // CONGELADA: campanha encerrada com snapshot gravado -> retorna ele direto.
  // Imutavel, barato, imune a mudancas futuras de dados/logica.
  if (
    campaign &&
    campaign.status === "ENDED" &&
    campaign.frozenResults &&
    typeof campaign.frozenResults === "object" &&
    !Array.isArray(campaign.frozenResults)
  ) {
    return campaign.frozenResults as unknown as CampaignResults;
  }

  // Datas em YYYY-MM-DD (SP) — usa o date-part cru, igual o cockpit faz.
  // Fim efetivo = endedAt (encerramento real) ?? endDate (planejado).
  const campaignStart = campaign ? campaign.startDate.toISOString().slice(0, 10) : null;
  const effectiveEnd = campaign ? (campaign.endedAt ?? campaign.endDate) : null;
  const campaignEnd = campaign ? campaign.endDate.toISOString().slice(0, 10) : null;
  // Instante UTC da meia-noite SP do dia 1, pra filtrar vendas/spend.
  const since = campaignStart ? new Date(`${campaignStart}T03:00:00.000Z`) : null;
  // Limite SUPERIOR exclusivo: meia-noite SP do dia SEGUINTE ao fim efetivo
  // (assim o bucket DAY do ultimo dia entra inteiro). Faltava antes -> campanha
  // encerrada continuava somando dados novos.
  const until = effectiveEnd
    ? new Date(
        new Date(`${effectiveEnd.toISOString().slice(0, 10)}T03:00:00.000Z`).getTime() +
          24 * 60 * 60 * 1000
      )
    : null;

  const saleDateFilter =
    since || until
      ? { saleDate: { ...(since ? { gte: since } : {}), ...(until ? { lt: until } : {}) } }
      : {};
  const startsAtFilter =
    since || until
      ? { startsAt: { ...(since ? { gte: since } : {}), ...(until ? { lt: until } : {}) } }
      : {};

  let salesCount = 0;
  let revenue = 0;
  try {
    const agg = await prisma.sale.aggregate({
      where: { productSlug, ...saleDateFilter },
      _sum: { amount: true },
      _count: { _all: true },
    });
    salesCount = agg._count._all;
    revenue = Number(agg._sum.amount ?? 0);
  } catch {
    /* tabela inexistente */
  }

  let mediaInvestment = 0;
  let mediaMeta = 0;
  let mediaGoogle = 0;
  try {
    const agg = await prisma.metricSample.groupBy({
      by: ["source"],
      where: {
        productSlug,
        bucket: "DAY",
        metric: "spend",
        source: { in: [...MEDIA_SPEND_SOURCES] },
        ...startsAtFilter,
      },
      _sum: { value: true },
    });
    for (const row of agg) {
      const v = Number(row._sum.value ?? 0);
      mediaInvestment += v;
      if (row.source === "META_ADS") mediaMeta += v;
      else if (row.source === "GOOGLE_ADS") mediaGoogle += v;
      // MANUAL legado entra só no total de mídia
    }
  } catch {
    /* tabela inexistente */
  }

  const productionCosts =
    Number(campaign?.productionCostLP ?? 0) +
    Number(campaign?.productionCostAds ?? 0) +
    Number(campaign?.productionCostOther ?? 0);
  const totalInvestment = mediaInvestment + productionCosts;
  const roas = totalInvestment > 0 ? revenue / totalInvestment : 0;

  return {
    salesCount,
    revenue,
    mediaInvestment,
    mediaMeta,
    mediaGoogle,
    totalInvestment,
    roas,
    campaignStart,
    campaignEnd,
  };
}
