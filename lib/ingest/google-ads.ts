/**
 * Google Ads ingest — pull de spend/impressions/clicks via GAQL (Google
 * Ads Query Language) por dia.
 *
 * Auth: OAuth com refresh_token de longa duração + Developer Token + Customer ID.
 * Filter: por campaign name usando lib/products.ts (mesmo padrão do Meta).
 *
 * Métricas armazenadas em MetricSample:
 *   spend       (BRL)   - investimento do dia (cost_micros / 1_000_000)
 *   impressions (count) - quantas vezes anuncios apareceram
 *   clicks      (count) - cliques nos anuncios
 *
 * Variáveis de ambiente:
 *   GOOGLE_ADS_DEVELOPER_TOKEN     - dev token aprovado pelo Google
 *   GOOGLE_ADS_CLIENT_ID           - OAuth client (developers.google.com)
 *   GOOGLE_ADS_CLIENT_SECRET       - OAuth client secret
 *   GOOGLE_ADS_REFRESH_TOKEN       - refresh token gerado pelo CLI
 *   GOOGLE_ADS_CUSTOMER_ID         - ID da conta Google Ads (formato "1234567890", sem hifens)
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID   - (opcional) MCC ID se usar manager account
 */
import { GoogleAdsApi, type Customer } from "google-ads-api";
import { prisma } from "@/lib/prisma";
import { getProductConfig } from "@/lib/products";
import { spDayBucketFromYMD } from "@/lib/time-buckets";
import { getIngestGate, isYMDInWindow } from "@/lib/campaigns";

function loadConfig(productSlug: string) {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "").trim();
  const loginCustomerId =
    (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/-/g, "").trim() || undefined;

  if (!developerToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN nao configurada");
  if (!clientId) throw new Error("GOOGLE_ADS_CLIENT_ID nao configurada");
  if (!clientSecret) throw new Error("GOOGLE_ADS_CLIENT_SECRET nao configurada");
  if (!refreshToken) throw new Error("GOOGLE_ADS_REFRESH_TOKEN nao configurada");
  if (!customerId) throw new Error("GOOGLE_ADS_CUSTOMER_ID nao configurada");

  const product = getProductConfig(productSlug);
  if (!product) {
    throw new Error(
      `Produto '${productSlug}' nao configurado em lib/products.ts. Adiciona com googleCampaignFilter.`
    );
  }
  const campaignFilter = product.googleCampaignFilter || null;

  return {
    developerToken,
    clientId,
    clientSecret,
    refreshToken,
    customerId,
    loginCustomerId,
    campaignFilter,
  };
}

let _client: GoogleAdsApi | null = null;
function getClient(developerToken: string, clientId: string, clientSecret: string): GoogleAdsApi {
  if (_client) return _client;
  _client = new GoogleAdsApi({ developer_token: developerToken, client_id: clientId, client_secret: clientSecret });
  return _client;
}

function getCustomer(productSlug: string): Customer {
  const cfg = loadConfig(productSlug);
  const client = getClient(cfg.developerToken, cfg.clientId, cfg.clientSecret);
  return client.Customer({
    customer_id: cfg.customerId,
    refresh_token: cfg.refreshToken,
    ...(cfg.loginCustomerId ? { login_customer_id: cfg.loginCustomerId } : {}),
  });
}

// Bucket DAY em SP (= UTC-3). Antes: midnight UTC quebrava view analitica.

export type GoogleAdsIngestResult = {
  productSlug: string;
  daysFetched: number;
  samplesUpserted: number;
  details: Array<{ date: string; spend: number; impressions: number; clicks: number }>;
  skipped?: boolean;
  skipReason?: string;
};

type GaqlRow = {
  segments?: { date?: string };
  campaign?: { name?: string };
  metrics?: { cost_micros?: number | string; impressions?: number | string; clicks?: number | string };
};

/**
 * Roda o ingest pra ULTIMOS N DIAS do produto informado, agregando spend/
 * impressions/clicks por dia (somando campanhas que matcham o filter).
 */
export async function ingestGoogleAds(opts: {
  productSlug: string;
  days?: number;
  force?: boolean;
}): Promise<GoogleAdsIngestResult> {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 30);
  const { productSlug } = opts;

  // Portao de ingestao (Feature A): igual ao Meta — sem campanha ATIVA na
  // janela, pula. Encerrar a campanha congela os dados.
  const gate = await getIngestGate(productSlug);
  if (!opts.force && !gate.ingest) {
    return {
      productSlug,
      daysFetched: 0,
      samplesUpserted: 0,
      details: [],
      skipped: true,
      skipReason: gate.reason,
    };
  }

  const cfg = loadConfig(productSlug);

  // Date range explicito BETWEEN (UNLIKE Meta, LAST_N_DAYS no GAQL NAO
  // inclui hoje — bug pegado em smoke test). Calcula start/end em SP
  // timezone pra alinhar com o resto do cockpit.
  const customer = getCustomer(productSlug);

  const spDate = (offsetDays: number): string => {
    const d = new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  };
  const endDate = spDate(0); // hoje
  const startDate = spDate(days - 1); // N-1 dias atras (BETWEEN inclusivo)

  // GAQL: campanhas agregadas por dia
  // (Google Ads usa cost_micros — divide por 1.000.000 pra ter R$/USD)
  const filterClause = cfg.campaignFilter
    ? `AND campaign.name LIKE '%${cfg.campaignFilter}%'`
    : "";
  const query = `
    SELECT
      segments.date,
      campaign.name,
      metrics.cost_micros,
      metrics.impressions,
      metrics.clicks
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      ${filterClause}
    ORDER BY segments.date DESC
  `;

  let rows: GaqlRow[] = [];
  try {
    rows = (await customer.query(query)) as GaqlRow[];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Google Ads API: ${msg}`);
  }

  // Agrega por dia somando campanhas
  const byDay = new Map<string, { spend: number; impressions: number; clicks: number }>();
  for (const r of rows) {
    const date = r.segments?.date;
    if (!date) continue;
    const spend = Number(r.metrics?.cost_micros ?? 0) / 1_000_000;
    const impressions = Number(r.metrics?.impressions ?? 0);
    const clicks = Number(r.metrics?.clicks ?? 0);
    const cur = byDay.get(date) ?? { spend: 0, impressions: 0, clicks: 0 };
    cur.spend += spend;
    cur.impressions += impressions;
    cur.clicks += clicks;
    byDay.set(date, cur);
  }

  let upserted = 0;
  const details: GoogleAdsIngestResult["details"] = [];

  for (const [date, agg] of byDay.entries()) {
    // Clampa buckets fora da janela da campanha ativa.
    if (!opts.force && gate.window && !isYMDInWindow(date, gate.window)) continue;
    const startsAt = spDayBucketFromYMD(date);
    const metrics = [
      { metric: "spend", value: agg.spend, unit: "BRL" },
      { metric: "impressions", value: agg.impressions, unit: "count" },
      { metric: "clicks", value: agg.clicks, unit: "count" },
    ];
    for (const m of metrics) {
      await prisma.metricSample.upsert({
        where: {
          productSlug_source_metric_bucket_startsAt: {
            productSlug,
            source: "GOOGLE_ADS",
            metric: m.metric,
            bucket: "DAY",
            startsAt,
          },
        },
        create: {
          productSlug,
          source: "GOOGLE_ADS",
          metric: m.metric,
          bucket: "DAY",
          startsAt,
          value: m.value,
          unit: m.unit,
        },
        update: { value: m.value },
      });
      upserted++;
    }
    details.push({ date, spend: agg.spend, impressions: agg.impressions, clicks: agg.clicks });
  }

  details.sort((a, b) => a.date.localeCompare(b.date));

  return { productSlug, daysFetched: days, samplesUpserted: upserted, details };
}
