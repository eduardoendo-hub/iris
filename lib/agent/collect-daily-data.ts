/**
 * collect-daily-data — agrega tudo que o agente analista precisa pra escrever
 * um insight estratégico do dia anterior.
 *
 * Roda 1x por dia (cron 05:00 SP) e retorna um snapshot estruturado:
 *
 *   1. Captação (lp_view / cliques) — VisitEvent agregado por canal/anúncio
 *   2. Gastos de mídia — MetricSample (META_ADS, GOOGLE_ADS)
 *   3. Vendas — Sale do dia + acumulado da campanha
 *   4. Comparação com média 7d e ontem
 *   5. Targets do plano de marketing (vindos do contexto, não daqui)
 *   6. Insights anteriores (últimos 7 dias) — pro modelo ter memória
 *
 * Saída é JSON serializável — vai direto pro prompt da LLM.
 */
import { prisma } from "@/lib/prisma";
import type { InsightCampaignGoals } from "@/lib/campaigns";

/** Bucket startsAt do dia analisado em SP (= dia 03:00 UTC) */
export function spDayBucketUTC(date: Date): Date {
  const sp = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate(), 3, 0, 0));
}

/** YYYY-MM-DD em SP (pra labels) */
export function spDateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export type DailySnapshot = {
  productSlug: string;
  campaignSlug: string; // "" se for produto-wide
  campaignName: string; // nome da campanha (pro prompt) — "" se desconhecido
  analysisDate: string; // YYYY-MM-DD SP
  campaignDay: number | null; // dia N desde início da campanha (1 = primeiro dia)
  daysToFinalEnrollment: number | null;
  // Metas/alvos da campanha ATIVA — alimentam o prompt do agente (antes eram
  // hardcoded da turma de maio). Zeros se a campanha nao tem metas cadastradas.
  goals: InsightCampaignGoals;
  // Plano de marketing cadastrado NESTA campanha (DB). "" se nao preenchido.
  // Quando presente, e a fonte autoritativa da realidade da turma vigente.
  campaignPlan: string;

  captacao: {
    visitas: number;
    clickCompra: number;
    clickConsultor: number;
    clickWhats: number;
    leadForm: number;
    convVisitaParaCompra: number; // %
    visitasPorFonte: Array<{
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      utmContent: string | null;
      visitas: number;
      clickCompra: number;
      conv: number;
    }>;
  };

  midia: {
    spendDia: number;
    spendDiaMeta: number;
    spendDiaGoogle: number;
    impressionsDia: number;
    clicksAdsDia: number;
    ctrAdsDia: number;
    cpcMedioAds: number;
    spendAcumuladoMes: number;
    spendVs7dMedia: number; // diff %
  };

  vendas: {
    novasDia: number;
    receitaDia: number;
    cacDia: number | null;
    roasDia: number | null;
    acumuladoMatriculas: number;
    acumuladoReceita: number;
    progressoMeta: number; // %
  };

  comparacao: {
    visitasOntem: number;
    visitasMedia7d: number;
    clickCompraOntem: number;
    clickCompraMedia7d: number;
    spendOntem: number;
    spendMedia7d: number;
    vendasMedia7d: number;
  };

  insightsAnteriores: Array<{
    date: string;
    headline: string;
    severity: string;
    keyRecommendations: string[];
  }>;
};

export async function collectDailySnapshot(opts: {
  productSlug: string;
  campaignSlug?: string | null;
  campaignName?: string | null;
  campaignPlan?: string | null;
  analysisDateUTC: Date; // bucket SP day em UTC (03:00 UTC)
  campaignStartISO?: string; // ex: "2026-05-11"
  campaignEnrollmentEndISO?: string; // ex: "2026-06-07"
  campaignGoals?: Partial<InsightCampaignGoals>;
}): Promise<DailySnapshot> {
  const { productSlug, analysisDateUTC } = opts;
  const campaignSlug: string = opts.campaignSlug ?? "";
  const goals: InsightCampaignGoals = {
    matriculas: opts.campaignGoals?.matriculas ?? 0,
    receita: opts.campaignGoals?.receita ?? 0,
    cacMax: opts.campaignGoals?.cacMax ?? 0,
    roasAlvo: opts.campaignGoals?.roasAlvo ?? 0,
    cplAlvo: opts.campaignGoals?.cplAlvo ?? 0,
    budgetTotal: opts.campaignGoals?.budgetTotal ?? 0,
  };
  const dayEndUTC = new Date(analysisDateUTC.getTime() + 24 * 60 * 60 * 1000);
  const sevenDaysAgoUTC = new Date(analysisDateUTC.getTime() - 7 * 24 * 60 * 60 * 1000);
  const dayBeforeUTC = new Date(analysisDateUTC.getTime() - 24 * 60 * 60 * 1000);

  // ─── Captação — VisitEvent agregado por evento ──────────────────────────
  const veGrouped = await prisma.visitEvent.groupBy({
    by: ["eventName"],
    where: { productSlug, ts: { gte: analysisDateUTC, lt: dayEndUTC } },
    _count: { _all: true },
  });
  const eventCount = (name: string) =>
    veGrouped.find((g) => g.eventName === name)?._count._all ?? 0;
  const visitas = eventCount("lp_view");
  const clickCompra = eventCount("click_compra");

  // ─── Captação por fonte (top 10 por visitas) ────────────────────────────
  const veByChannel = await prisma.visitEvent.groupBy({
    by: ["utmSource", "utmMedium", "utmCampaign", "utmContent", "eventName"],
    where: { productSlug, ts: { gte: analysisDateUTC, lt: dayEndUTC } },
    _count: { _all: true },
  });
  const channelMap = new Map<
    string,
    { utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null; visitas: number; clickCompra: number }
  >();
  for (const r of veByChannel) {
    const k = `${r.utmSource ?? ""}|${r.utmMedium ?? ""}|${r.utmCampaign ?? ""}|${r.utmContent ?? ""}`;
    let cur = channelMap.get(k);
    if (!cur) {
      cur = {
        utmSource: r.utmSource,
        utmMedium: r.utmMedium,
        utmCampaign: r.utmCampaign,
        utmContent: r.utmContent,
        visitas: 0,
        clickCompra: 0,
      };
      channelMap.set(k, cur);
    }
    if (r.eventName === "lp_view") cur.visitas += r._count._all;
    else if (r.eventName === "click_compra") cur.clickCompra += r._count._all;
  }
  const visitasPorFonte = Array.from(channelMap.values())
    .map((c) => ({ ...c, conv: c.visitas > 0 ? (c.clickCompra / c.visitas) * 100 : 0 }))
    .sort((a, b) => b.visitas - a.visitas)
    .slice(0, 10);

  // ─── Mídia — spend hoje (Meta + Google) e acumulado mês ─────────────────
  const spendDiaRows = await prisma.metricSample.findMany({
    where: {
      productSlug,
      bucket: "DAY",
      startsAt: analysisDateUTC,
      source: { in: ["META_ADS", "GOOGLE_ADS"] },
    },
  });
  const findMetric = (rows: typeof spendDiaRows, source: string, metric: string) =>
    Number(rows.find((r) => r.source === source && r.metric === metric)?.value ?? 0);

  const spendDiaMeta = findMetric(spendDiaRows, "META_ADS", "spend");
  const spendDiaGoogle = findMetric(spendDiaRows, "GOOGLE_ADS", "spend");
  const spendDia = spendDiaMeta + spendDiaGoogle;
  const impressionsDia =
    findMetric(spendDiaRows, "META_ADS", "impressions") +
    findMetric(spendDiaRows, "GOOGLE_ADS", "impressions");
  const clicksAdsDia =
    findMetric(spendDiaRows, "META_ADS", "clicks") +
    findMetric(spendDiaRows, "GOOGLE_ADS", "clicks");

  // Mes corrente (dia 1 SP até dia analisado)
  const spNow = new Date(analysisDateUTC.getTime() - 3 * 60 * 60 * 1000);
  const monthStartUTC = new Date(
    Date.UTC(spNow.getUTCFullYear(), spNow.getUTCMonth(), 1, 3, 0, 0)
  );
  const spendMesAgg = await prisma.metricSample.aggregate({
    where: {
      productSlug,
      bucket: "DAY",
      metric: "spend",
      startsAt: { gte: monthStartUTC, lte: analysisDateUTC },
      source: { in: ["META_ADS", "GOOGLE_ADS"] },
    },
    _sum: { value: true },
  });
  const spendAcumuladoMes = Number(spendMesAgg._sum.value ?? 0);

  // Média 7d (excluindo o dia analisado)
  const sevenAgo = new Date(analysisDateUTC.getTime() - 7 * 24 * 60 * 60 * 1000);
  const spend7dAgg = await prisma.metricSample.aggregate({
    where: {
      productSlug,
      bucket: "DAY",
      metric: "spend",
      startsAt: { gte: sevenAgo, lt: analysisDateUTC },
      source: { in: ["META_ADS", "GOOGLE_ADS"] },
    },
    _sum: { value: true },
  });
  const spendMedia7d = Number(spend7dAgg._sum.value ?? 0) / 7;
  const spendVs7dMedia = spendMedia7d > 0 ? ((spendDia - spendMedia7d) / spendMedia7d) * 100 : 0;

  // ─── Vendas — do dia e acumulado da campanha ────────────────────────────
  const vendasDiaAgg = await prisma.sale.aggregate({
    where: { productSlug, saleDate: { gte: analysisDateUTC, lt: dayEndUTC } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const novasDia = vendasDiaAgg._count._all;
  const receitaDia = Number(vendasDiaAgg._sum.amount ?? 0);
  const cacDia = novasDia > 0 ? spendDia / novasDia : null;
  const roasDia = spendDia > 0 ? receitaDia / spendDia : null;

  // Acumulado da CAMPANHA vigente — escopado à janela [campaignStart, dia+1).
  // Sem isso, contava TODAS as vendas do produto (somando turmas anteriores —
  // ex: turma de maio inflava "47/30" da turma de julho).
  const campaignStartUTC = opts.campaignStartISO
    ? new Date(opts.campaignStartISO + "T03:00:00.000Z")
    : null;
  const vendasTotalAgg = await prisma.sale.aggregate({
    where: {
      productSlug,
      ...(campaignStartUTC ? { saleDate: { gte: campaignStartUTC, lt: dayEndUTC } } : {}),
    },
    _sum: { amount: true },
    _count: { _all: true },
  });
  const acumuladoMatriculas = vendasTotalAgg._count._all;
  const acumuladoReceita = Number(vendasTotalAgg._sum.amount ?? 0);
  const progressoMeta = goals.matriculas
    ? (acumuladoMatriculas / goals.matriculas) * 100
    : 0;

  // ─── Comparações ────────────────────────────────────────────────────────
  const ontemBucketUTC = new Date(analysisDateUTC.getTime() - 24 * 60 * 60 * 1000);
  const visitasOntem = await prisma.visitEvent.count({
    where: {
      productSlug,
      eventName: "lp_view",
      ts: { gte: ontemBucketUTC, lt: analysisDateUTC },
    },
  });
  const clickCompraOntem = await prisma.visitEvent.count({
    where: {
      productSlug,
      eventName: "click_compra",
      ts: { gte: ontemBucketUTC, lt: analysisDateUTC },
    },
  });
  const visitas7dCount = await prisma.visitEvent.count({
    where: {
      productSlug,
      eventName: "lp_view",
      ts: { gte: sevenAgo, lt: analysisDateUTC },
    },
  });
  const visitasMedia7d = visitas7dCount / 7;
  const clickCompra7dCount = await prisma.visitEvent.count({
    where: {
      productSlug,
      eventName: "click_compra",
      ts: { gte: sevenAgo, lt: analysisDateUTC },
    },
  });
  const clickCompraMedia7d = clickCompra7dCount / 7;
  const spendOntem = await prisma.metricSample
    .aggregate({
      where: {
        productSlug,
        bucket: "DAY",
        metric: "spend",
        startsAt: ontemBucketUTC,
        source: { in: ["META_ADS", "GOOGLE_ADS"] },
      },
      _sum: { value: true },
    })
    .then((a) => Number(a._sum.value ?? 0));
  const vendas7dAgg = await prisma.sale.count({
    where: { productSlug, saleDate: { gte: sevenDaysAgoUTC, lt: analysisDateUTC } },
  });
  const vendasMedia7d = vendas7dAgg / 7;

  // ─── Insights anteriores (últimos 7 dias) ───────────────────────────────
  const insightsAnt = await prisma.dailyInsight.findMany({
    where: {
      productSlug,
      campaignSlug,
      analysisDate: { gte: sevenDaysAgoUTC, lt: analysisDateUTC },
    },
    orderBy: { analysisDate: "desc" },
    select: { analysisDate: true, headline: true, severity: true, recommendations: true },
  });
  const insightsAnteriores = insightsAnt.map((i) => ({
    date: spDateLabel(i.analysisDate),
    headline: i.headline,
    severity: i.severity,
    keyRecommendations: Array.isArray(i.recommendations)
      ? (i.recommendations as Array<{ action?: string }>)
          .slice(0, 3)
          .map((r) => r.action ?? "")
          .filter(Boolean)
      : [],
  }));

  // ─── Cronologia da campanha ─────────────────────────────────────────────
  const campaignDay = opts.campaignStartISO
    ? Math.floor(
        (analysisDateUTC.getTime() - new Date(opts.campaignStartISO + "T03:00:00.000Z").getTime()) /
          (24 * 60 * 60 * 1000)
      ) + 1
    : null;
  const daysToFinalEnrollment = opts.campaignEnrollmentEndISO
    ? Math.floor(
        (new Date(opts.campaignEnrollmentEndISO + "T03:00:00.000Z").getTime() -
          analysisDateUTC.getTime()) /
          (24 * 60 * 60 * 1000)
      )
    : null;

  return {
    productSlug,
    campaignSlug,
    campaignName: opts.campaignName ?? "",
    analysisDate: spDateLabel(analysisDateUTC),
    campaignDay,
    daysToFinalEnrollment,
    goals,
    campaignPlan: opts.campaignPlan?.trim() ? opts.campaignPlan.trim() : "",
    captacao: {
      visitas,
      clickCompra,
      clickConsultor: eventCount("click_consultor"),
      clickWhats: eventCount("click_whats"),
      leadForm: eventCount("lead_form"),
      convVisitaParaCompra: visitas > 0 ? (clickCompra / visitas) * 100 : 0,
      visitasPorFonte,
    },
    midia: {
      spendDia,
      spendDiaMeta,
      spendDiaGoogle,
      impressionsDia,
      clicksAdsDia,
      ctrAdsDia: impressionsDia > 0 ? (clicksAdsDia / impressionsDia) * 100 : 0,
      cpcMedioAds: clicksAdsDia > 0 ? spendDia / clicksAdsDia : 0,
      spendAcumuladoMes,
      spendVs7dMedia,
    },
    vendas: {
      novasDia,
      receitaDia,
      cacDia,
      roasDia,
      acumuladoMatriculas,
      acumuladoReceita,
      progressoMeta,
    },
    comparacao: {
      visitasOntem,
      visitasMedia7d,
      clickCompraOntem,
      clickCompraMedia7d,
      spendOntem,
      spendMedia7d,
      vendasMedia7d,
    },
    insightsAnteriores,
  };
}
