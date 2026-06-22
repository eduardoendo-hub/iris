/**
 * Portfolio ingest — métrica de mídia POR CAMPANHA (Meta + Google), guiada
 * pelo registro TrackedCampaign (tela /admin/tracked-campaigns).
 *
 * Diferente de lib/ingest/meta-ads.ts / google-ads.ts (que somam tudo num
 * número por produto), aqui cada campanha rastreada vira linhas próprias em
 * CampaignMetricSample — é o que o Gestor de Tráfego precisa pra dar ordens
 * por campanha ("pausa a X, escala a Y").
 *
 * Matching: cada row da API (que já traz o campaign id real) é casada com uma
 * TrackedCampaign ATIVA por:
 *   1. externalId === campaign.id  (preciso)
 *   2. nameFilter ⊂ campaign.name  (substring, fallback)
 * Só campanhas casadas são gravadas. Quando casa por nome e a TrackedCampaign
 * não tinha externalId, fazemos backfill do id real (precisão no próximo run).
 *
 * Auth reaproveita os MESMOS envs dos ingests existentes (META_ACCESS_TOKEN,
 * META_AD_ACCOUNT_ID, GOOGLE_ADS_*). Assume 1 conta Meta + 1 customer Google.
 */
import { prisma } from "@/lib/prisma";
import { spDayBucketFromYMD } from "@/lib/time-buckets";
import { googleAdsSearch, googleConfigured } from "./google-rest";

const GRAPH_API_VERSION = "v21.0";

type TrackedLite = {
  id: string;
  platform: string;
  accountId: string;
  externalId: string | null;
  nameFilter: string | null;
  productSlug: string | null;
  label: string;
};

export type PortfolioIngestResult = {
  platform: "META" | "GOOGLE";
  campaignsMatched: number;
  samplesUpserted: number;
  skipped?: boolean;
  skipReason?: string;
  details: Array<{ externalId: string; name: string; days: number }>;
};

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

async function loadActiveTracked(platform: "META" | "GOOGLE"): Promise<TrackedLite[]> {
  return prisma.trackedCampaign.findMany({
    where: { active: true, platform },
    select: { id: true, platform: true, accountId: true, externalId: true, nameFilter: true, productSlug: true, label: true },
  });
}

/** Casa uma campanha (id+nome) com a TrackedCampaign certa, ou null. */
function matchTracked(
  tracked: TrackedLite[],
  campaignId: string,
  campaignName: string,
): TrackedLite | null {
  // 1. externalId exato
  const byId = tracked.find((t) => t.externalId && t.externalId === campaignId);
  if (byId) return byId;
  // 2. nameFilter substring (case-insensitive)
  const nameLc = campaignName.toLowerCase();
  const byName = tracked.find((t) => t.nameFilter && nameLc.includes(t.nameFilter.toLowerCase()));
  return byName ?? null;
}

async function upsertSample(args: {
  platform: "META" | "GOOGLE";
  accountId: string;
  externalId: string;
  campaignName: string;
  productSlug: string | null;
  metric: "spend" | "impressions" | "clicks";
  unit: "BRL" | "count";
  startsAt: Date;
  value: number;
}): Promise<void> {
  await prisma.campaignMetricSample.upsert({
    where: {
      platform_externalId_metric_bucket_startsAt: {
        platform: args.platform,
        externalId: args.externalId,
        metric: args.metric,
        bucket: "DAY",
        startsAt: args.startsAt,
      },
    },
    create: {
      platform: args.platform,
      accountId: args.accountId,
      externalId: args.externalId,
      campaignName: args.campaignName,
      productSlug: args.productSlug,
      metric: args.metric,
      bucket: "DAY",
      startsAt: args.startsAt,
      value: args.value,
      unit: args.unit,
    },
    update: { value: args.value, campaignName: args.campaignName, productSlug: args.productSlug },
  });
}

/** Backfill do externalId real na TrackedCampaign quando casou só por nome. */
async function backfillExternalId(trackedId: string, externalId: string): Promise<void> {
  try {
    await prisma.trackedCampaign.update({
      where: { id: trackedId },
      data: { externalId },
    });
  } catch {
    /* unique pode colidir se já existir — ignora, não é crítico */
  }
}

// ─────────────────────────── META ───────────────────────────

type MetaRow = {
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
};

export async function ingestMetaPortfolio(opts: { days?: number }): Promise<PortfolioIngestResult> {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 31);
  const tracked = await loadActiveTracked("META");
  if (tracked.length === 0) {
    return { platform: "META", campaignsMatched: 0, samplesUpserted: 0, skipped: true, skipReason: "no_active_tracked", details: [] };
  }
  const accessToken = process.env.META_ACCESS_TOKEN;
  const raw = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !raw) {
    return { platform: "META", campaignsMatched: 0, samplesUpserted: 0, skipped: true, skipReason: "missing_meta_env", details: [] };
  }
  const adAccountId = raw.startsWith("act_") ? raw : `act_${raw}`;

  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/insights`);
  url.searchParams.set("fields", "campaign_id,campaign_name,spend,impressions,clicks");
  url.searchParams.set("level", "campaign");
  url.searchParams.set("time_range", JSON.stringify({ since: spDate(days - 1), until: spDate(0) }));
  url.searchParams.set("time_increment", "1");
  url.searchParams.set("limit", "500");
  url.searchParams.set("access_token", accessToken);

  const r = await fetch(url.toString());
  const json = (await r.json()) as { data?: MetaRow[]; error?: { message: string } };
  if (!r.ok || json.error) {
    throw new Error(`Meta Insights API (portfolio): ${json.error?.message || `HTTP ${r.status}`}`);
  }

  const matchedSet = new Set<string>();
  const backfilled = new Set<string>();
  const dayCount = new Map<string, number>();
  let upserted = 0;

  for (const row of json.data ?? []) {
    const cid = row.campaign_id;
    const cname = row.campaign_name ?? "";
    const date = row.date_start;
    if (!cid || !date) continue;
    const t = matchTracked(tracked, cid, cname);
    if (!t) continue;
    matchedSet.add(cid);
    dayCount.set(cid, (dayCount.get(cid) ?? 0) + 1);

    // Backfill do id real quando casou por nome (1x por campanha)
    if (!t.externalId && !backfilled.has(t.id)) {
      backfilled.add(t.id);
      await backfillExternalId(t.id, cid);
    }

    const startsAt = spDayBucketFromYMD(date);
    const metrics: Array<{ metric: "spend" | "impressions" | "clicks"; value: number; unit: "BRL" | "count" }> = [
      { metric: "spend", value: Number(row.spend ?? 0), unit: "BRL" },
      { metric: "impressions", value: Number(row.impressions ?? 0), unit: "count" },
      { metric: "clicks", value: Number(row.clicks ?? 0), unit: "count" },
    ];
    for (const m of metrics) {
      await upsertSample({
        platform: "META",
        accountId: raw,
        externalId: cid,
        campaignName: cname,
        productSlug: t.productSlug,
        metric: m.metric,
        unit: m.unit,
        startsAt,
        value: m.value,
      });
      upserted++;
    }
  }

  const details = Array.from(matchedSet).map((cid) => ({
    externalId: cid,
    name: (json.data ?? []).find((d) => d.campaign_id === cid)?.campaign_name ?? "",
    days: dayCount.get(cid) ?? 0,
  }));
  return { platform: "META", campaignsMatched: matchedSet.size, samplesUpserted: upserted, details };
}

// ────────────────────────── GOOGLE (REST nativo) ──────────────────────────
// Usa lib/ingest/google-rest.ts (fetch nativo + searchStream) — a lib
// google-ads-api falha com 'Premature close' no container. Campos da resposta
// REST são camelCase (costMicros) e status vem por nome ("ENABLED"/"PAUSED").

/** Lista campanhas da conta Google (pro picker da tela). Não lança. */
export async function listGoogleCampaigns(): Promise<{
  accountId: string;
  campaigns: Array<{ id: string; name: string; status: string }>;
  error?: string;
}> {
  const accountId = (process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "").trim();
  if (!googleConfigured()) return { accountId, campaigns: [], error: "missing_google_env" };
  try {
    const rows = await googleAdsSearch(
      `SELECT campaign.id, campaign.name, campaign.status FROM campaign WHERE campaign.status IN ('ENABLED','PAUSED') ORDER BY campaign.name`,
    );
    const campaigns = rows.map((r) => ({
      id: r.campaign?.id ?? "",
      name: r.campaign?.name ?? "",
      status: r.campaign?.status ?? "",
    }));
    return { accountId, campaigns };
  } catch (err) {
    return { accountId, campaigns: [], error: err instanceof Error ? err.message : String(err) };
  }
}

/** Lista campanhas da conta Meta (pro picker da tela). Não lança. */
export async function listMetaCampaignsForPicker(): Promise<{
  accountId: string;
  campaigns: Array<{ id: string; name: string; status: string }>;
  error?: string;
}> {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const raw = process.env.META_AD_ACCOUNT_ID;
  const accountId = raw || "";
  if (!accessToken || !raw) return { accountId, campaigns: [], error: "missing_meta_env" };
  const adAccountId = raw.startsWith("act_") ? raw : `act_${raw}`;
  try {
    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${adAccountId}/campaigns`);
    url.searchParams.set("fields", "id,name,status,objective");
    url.searchParams.set("limit", "200");
    url.searchParams.set("access_token", accessToken);
    const r = await fetch(url.toString());
    const json = (await r.json()) as { data?: Array<{ id: string; name: string; status: string }>; error?: { message: string } };
    if (!r.ok || json.error) return { accountId, campaigns: [], error: json.error?.message || `HTTP ${r.status}` };
    return { accountId, campaigns: (json.data ?? []).map((c) => ({ id: c.id, name: c.name, status: c.status })) };
  } catch (err) {
    return { accountId, campaigns: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function ingestGooglePortfolio(opts: { days?: number }): Promise<PortfolioIngestResult> {
  const days = Math.min(Math.max(opts.days ?? 7, 1), 31);
  const tracked = await loadActiveTracked("GOOGLE");
  if (tracked.length === 0) {
    return { platform: "GOOGLE", campaignsMatched: 0, samplesUpserted: 0, skipped: true, skipReason: "no_active_tracked", details: [] };
  }
  if (!googleConfigured()) {
    return { platform: "GOOGLE", campaignsMatched: 0, samplesUpserted: 0, skipped: true, skipReason: "missing_google_env", details: [] };
  }
  const accountId = (process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "").trim();

  const query = `
    SELECT segments.date, campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks
    FROM campaign
    WHERE segments.date BETWEEN '${spDate(days - 1)}' AND '${spDate(0)}'
    ORDER BY segments.date DESC
  `;
  let rows;
  try {
    rows = await googleAdsSearch(query);
  } catch (err) {
    throw new Error(`Google Ads API (portfolio): ${err instanceof Error ? err.message : String(err)}`);
  }

  const matchedSet = new Set<string>();
  const backfilled = new Set<string>();
  const dayCount = new Map<string, number>();
  const nameById = new Map<string, string>();
  let upserted = 0;

  for (const row of rows) {
    const cid = row.campaign?.id ?? undefined;
    const cname = row.campaign?.name ?? "";
    const date = row.segments?.date;
    if (!cid || !date) continue;
    const t = matchTracked(tracked, cid, cname);
    if (!t) continue;
    matchedSet.add(cid);
    nameById.set(cid, cname);
    dayCount.set(cid, (dayCount.get(cid) ?? 0) + 1);

    if (!t.externalId && !backfilled.has(t.id)) {
      backfilled.add(t.id);
      await backfillExternalId(t.id, cid);
    }

    const startsAt = spDayBucketFromYMD(date);
    const metrics: Array<{ metric: "spend" | "impressions" | "clicks"; value: number; unit: "BRL" | "count" }> = [
      { metric: "spend", value: Number(row.metrics?.costMicros ?? 0) / 1_000_000, unit: "BRL" },
      { metric: "impressions", value: Number(row.metrics?.impressions ?? 0), unit: "count" },
      { metric: "clicks", value: Number(row.metrics?.clicks ?? 0), unit: "count" },
    ];
    for (const m of metrics) {
      await upsertSample({
        platform: "GOOGLE",
        accountId,
        externalId: cid,
        campaignName: cname,
        productSlug: t.productSlug,
        metric: m.metric,
        unit: m.unit,
        startsAt,
        value: m.value,
      });
      upserted++;
    }
  }

  const details = Array.from(matchedSet).map((cid) => ({
    externalId: cid,
    name: nameById.get(cid) ?? "",
    days: dayCount.get(cid) ?? 0,
  }));
  return { platform: "GOOGLE", campaignsMatched: matchedSet.size, samplesUpserted: upserted, details };
}

/** Roda os dois lados; nunca lança — devolve resultado por plataforma. */
export async function ingestPortfolio(opts: { days?: number } = {}): Promise<{
  meta: PortfolioIngestResult | { platform: "META"; error: string };
  google: PortfolioIngestResult | { platform: "GOOGLE"; error: string };
}> {
  const [meta, google] = await Promise.all([
    ingestMetaPortfolio(opts).catch((e) => ({ platform: "META" as const, error: e instanceof Error ? e.message : String(e) })),
    ingestGooglePortfolio(opts).catch((e) => ({ platform: "GOOGLE" as const, error: e instanceof Error ? e.message : String(e) })),
  ]);
  return { meta, google };
}
