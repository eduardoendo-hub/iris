/**
 * GA4 Data API ingest — pull de metricas e eventos pra alimentar o IRIS.
 *
 * - Auth: Service Account (JSON em base64 na env GA4_SERVICE_ACCOUNT_JSON)
 * - Property: GA4_PROPERTY_ID (formato "123456789", sem prefixo "properties/")
 *
 * Estrategia: cada call do cron pega os ULTIMOS 7 DIAS por dia (DAY bucket).
 * Re-roda eh idempotente — sobrescreve o sample do mesmo (productSlug,
 * source, metric, bucket, startsAt) via upsert.
 *
 * Eventos rastreados (devem bater com setupGA4Events na LP):
 *   sessions, lp_view, click_compra, click_consultor, click_whats, lead_form
 */
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { prisma } from "@/lib/prisma";

const GA4_EVENTS = [
  "lp_view",
  "click_compra",
  "click_consultor",
  "click_whats",
  "lead_form",
] as const;

function loadCredentials(): Record<string, unknown> {
  const raw = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GA4_SERVICE_ACCOUNT_JSON nao configurada");
  // Aceita tanto JSON cru quanto base64
  try {
    if (raw.trim().startsWith("{")) return JSON.parse(raw);
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(decoded);
  } catch (err) {
    throw new Error(
      "GA4_SERVICE_ACCOUNT_JSON invalida (nao eh JSON valido nem base64 de JSON): " +
        (err instanceof Error ? err.message : String(err))
    );
  }
}

let _client: BetaAnalyticsDataClient | null = null;
function getClient(): BetaAnalyticsDataClient {
  if (_client) return _client;
  const creds = loadCredentials();
  _client = new BetaAnalyticsDataClient({ credentials: creds as never });
  return _client;
}

function propertyPath(): string {
  const id = process.env.GA4_PROPERTY_ID;
  if (!id) throw new Error("GA4_PROPERTY_ID nao configurada");
  return `properties/${id}`;
}

export type GA4IngestResult = {
  productSlug: string;
  daysFetched: number;
  samplesUpserted: number;
  details: Array<{ metric: string; days: number; total: number }>;
};

/**
 * Pega sessoes (visitas LP) por dia nos ultimos N dias.
 */
async function fetchSessions(days: number): Promise<Array<{ date: string; value: number }>> {
  const [response] = await getClient().runReport({
    property: propertyPath(),
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }],
  });
  return (response.rows ?? []).map((r) => ({
    date: r.dimensionValues?.[0]?.value ?? "",
    value: Number(r.metricValues?.[0]?.value ?? 0),
  }));
}

/**
 * Pega contagem de eventos custom por dia nos ultimos N dias.
 * Filtra apenas eventos do array GA4_EVENTS.
 */
async function fetchCustomEvents(days: number): Promise<
  Array<{ date: string; eventName: string; value: number }>
> {
  const [response] = await getClient().runReport({
    property: propertyPath(),
    dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
    dimensions: [{ name: "date" }, { name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: { values: GA4_EVENTS as unknown as string[] },
      },
    },
  });
  return (response.rows ?? []).map((r) => ({
    date: r.dimensionValues?.[0]?.value ?? "",
    eventName: r.dimensionValues?.[1]?.value ?? "",
    value: Number(r.metricValues?.[0]?.value ?? 0),
  }));
}

/**
 * GA4 retorna date como "YYYYMMDD" string. Convertemos pra UTC midnight do dia
 * (GA4 usa timezone da property, mas pra DAY bucket nao precisa exato).
 */
function ga4DateToBucketStart(date: string): Date {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(4, 6));
  const d = Number(date.slice(6, 8));
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

/**
 * Roda o ingest completo pro product/slug informado.
 * Upserta MetricSample por (productSlug, source=GA4, metric, bucket=DAY, startsAt).
 */
export async function ingestGA4(opts: {
  productSlug: string;
  days?: number;
}): Promise<GA4IngestResult> {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 30);
  const productSlug = opts.productSlug;

  const [sessions, customEvents] = await Promise.all([
    fetchSessions(days),
    fetchCustomEvents(days),
  ]);

  const all: Array<{ metric: string; date: string; value: number }> = [
    ...sessions.map((s) => ({ metric: "sessions", date: s.date, value: s.value })),
    ...customEvents.map((e) => ({ metric: e.eventName, date: e.date, value: e.value })),
  ];

  // Upsert em paralelo (max 10 simultaneos pra nao matar conexao Postgres)
  const chunks: typeof all[] = [];
  const CHUNK = 10;
  for (let i = 0; i < all.length; i += CHUNK) chunks.push(all.slice(i, i + CHUNK));

  let total = 0;
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (s) => {
        if (!s.date || !s.metric) return;
        const startsAt = ga4DateToBucketStart(s.date);
        await prisma.metricSample.upsert({
          where: {
            productSlug_source_metric_bucket_startsAt: {
              productSlug,
              source: "GA4",
              metric: s.metric,
              bucket: "DAY",
              startsAt,
            },
          },
          create: {
            productSlug,
            source: "GA4",
            metric: s.metric,
            bucket: "DAY",
            startsAt,
            value: s.value,
            unit: "count",
          },
          update: {
            value: s.value,
          },
        });
        total++;
      })
    );
  }

  // Resumo por metrica
  const byMetric = new Map<string, number>();
  for (const s of all) {
    byMetric.set(s.metric, (byMetric.get(s.metric) ?? 0) + s.value);
  }
  const details = Array.from(byMetric.entries()).map(([metric, totalVal]) => ({
    metric,
    days: all.filter((s) => s.metric === metric).length,
    total: totalVal,
  }));

  return {
    productSlug,
    daysFetched: days,
    samplesUpserted: total,
    details,
  };
}
