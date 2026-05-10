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
