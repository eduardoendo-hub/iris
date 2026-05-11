/**
 * Meta Ads Insights API ingest — pull de spend/impressions/clicks por dia.
 *
 * Auth: long-lived System User Token (env META_ACCESS_TOKEN)
 * Conta: env META_AD_ACCOUNT_ID (formato "act_1234567890" ou só "1234567890")
 *
 * Doc: https://developers.facebook.com/docs/marketing-api/insights
 *
 * Estrategia: cada call do cron pega ULTIMOS N DIAS por dia (DAY bucket).
 * Re-roda eh idempotente — sobrescreve sample do mesmo (productSlug,
 * source=META_ADS, metric, bucket, startsAt) via upsert.
 *
 * Metricas armazenadas no MetricSample:
 *   spend       (BRL)   - investimento do dia
 *   impressions (count) - quantas vezes anuncios apareceram
 *   clicks      (count) - cliques nos anuncios
 *
 * NOTA: conversoes (lead/purchase) sao trackeadas via Pixel/CAPI direto
 * pelo IRIS (eventos /api/events da LP), entao nao precisamos puxar do
 * Meta tambem — evita double-count.
 */
import { prisma } from "@/lib/prisma";

const GRAPH_API_VERSION = "v21.0";

type DailyInsight = {
  date_start?: string; // YYYY-MM-DD
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
};

type GraphResponse = {
  data?: DailyInsight[];
  error?: { message: string; code: number; type: string };
};

function loadConfig(): { accessToken: string; adAccountId: string } {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const raw = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken) throw new Error("META_ACCESS_TOKEN nao configurada");
  if (!raw) throw new Error("META_AD_ACCOUNT_ID nao configurada");
  // Aceita "act_1234" ou "1234" (normaliza pra "act_1234")
  const adAccountId = raw.startsWith("act_") ? raw : `act_${raw}`;
  return { accessToken, adAccountId };
}

function pickDatePreset(days: number): string {
  // Meta API tem presets fixos — escolhemos o mais proximo
  if (days <= 7) return "last_7d";
  if (days <= 14) return "last_14d";
  if (days <= 28) return "last_28d";
  return "last_30d";
}

async function fetchInsights(days: number): Promise<DailyInsight[]> {
  const { accessToken, adAccountId } = loadConfig();
  const fields = ["spend", "impressions", "clicks", "reach", "cpc", "cpm", "ctr"].join(",");
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/insights`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("date_preset", pickDatePreset(days));
  url.searchParams.set("time_increment", "1"); // 1 = breakdown por dia
  url.searchParams.set("level", "account"); // agregado da conta inteira
  url.searchParams.set("access_token", accessToken);

  const r = await fetch(url.toString(), { method: "GET" });
  const json = (await r.json()) as GraphResponse;
  if (!r.ok || json.error) {
    const msg = json.error?.message || `HTTP ${r.status}`;
    throw new Error(`Meta Insights API: ${msg}`);
  }
  return json.data ?? [];
}

function ymdToBucketStart(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
}

export type MetaIngestResult = {
  productSlug: string;
  daysFetched: number;
  samplesUpserted: number;
  details: Array<{ date: string; spend: number; impressions: number; clicks: number }>;
};

/**
 * Roda o ingest pro product/slug informado.
 * Upserta MetricSample por (productSlug, META_ADS, metric, bucket=DAY, startsAt).
 */
export async function ingestMetaAds(opts: {
  productSlug: string;
  days?: number;
}): Promise<MetaIngestResult> {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 30);
  const { productSlug } = opts;

  const insights = await fetchInsights(days);

  let upserted = 0;
  const details: MetaIngestResult["details"] = [];

  for (const ins of insights) {
    if (!ins.date_start) continue;
    const startsAt = ymdToBucketStart(ins.date_start);
    const spend = Number(ins.spend ?? 0);
    const impressions = Number(ins.impressions ?? 0);
    const clicks = Number(ins.clicks ?? 0);

    const upserts: Array<{ metric: string; value: number; unit: string }> = [];
    if (spend >= 0) upserts.push({ metric: "spend", value: spend, unit: "BRL" });
    if (impressions >= 0) upserts.push({ metric: "impressions", value: impressions, unit: "count" });
    if (clicks >= 0) upserts.push({ metric: "clicks", value: clicks, unit: "count" });

    for (const u of upserts) {
      await prisma.metricSample.upsert({
        where: {
          productSlug_source_metric_bucket_startsAt: {
            productSlug,
            source: "META_ADS",
            metric: u.metric,
            bucket: "DAY",
            startsAt,
          },
        },
        create: {
          productSlug,
          source: "META_ADS",
          metric: u.metric,
          bucket: "DAY",
          startsAt,
          value: u.value,
          unit: u.unit,
        },
        update: { value: u.value },
      });
      upserted++;
    }

    details.push({ date: ins.date_start, spend, impressions, clicks });
  }

  return {
    productSlug,
    daysFetched: days,
    samplesUpserted: upserted,
    details,
  };
}
