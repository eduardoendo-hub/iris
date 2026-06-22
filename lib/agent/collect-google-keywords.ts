/**
 * collect-google-keywords — contexto de keyword/termo de pesquisa do Google
 * pro Gestor de Tráfego (Fase 3). Pra cada campanha Google rastreada, puxa:
 *   1. Termos de pesquisa que mais gastaram nos últimos N dias (search_term_view)
 *   2. Negativas JÁ cadastradas — na campanha (campaign_criterion) + listas
 *      compartilhadas da conta (shared_criterion NEGATIVE_KEYWORDS)
 *
 * Assim o agente recomenda só negativas NOVAS (não repete o que já existe) e
 * aponta keywords/termos desperdiçando budget. Puxa ao vivo (não persiste) —
 * é contexto pro prompt, não série temporal.
 */
import { googleAdsSearch, googleConfigured } from "@/lib/ingest/google-rest";

function spDate(offsetDays: number): string {
  const d = new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type SearchTerm = { term: string; cost: number; clicks: number; conversions: number };
export type NegativeKw = { text: string; matchType: string; source: string };
export type GoogleKwContext = {
  campaignId: string;
  label: string;
  searchTerms: SearchTerm[];
  negatives: NegativeKw[];
  error?: string;
};

type STRow = {
  searchTermView?: { searchTerm?: string };
  metrics?: { costMicros?: string; clicks?: string; conversions?: number | string };
};
type CampNegRow = { campaignCriterion?: { keyword?: { text?: string; matchType?: string } } };
type SharedNegRow = { sharedCriterion?: { keyword?: { text?: string; matchType?: string } }; sharedSet?: { name?: string } };

/** Negativas das listas compartilhadas da conta (valem pra campanhas linkadas). */
async function fetchSharedNegatives(): Promise<NegativeKw[]> {
  try {
    const rows = (await googleAdsSearch(
      `SELECT shared_criterion.keyword.text, shared_criterion.keyword.match_type, shared_set.name FROM shared_criterion WHERE shared_set.type = 'NEGATIVE_KEYWORDS'`,
    )) as unknown as SharedNegRow[];
    return rows
      .map((r) => ({
        text: r.sharedCriterion?.keyword?.text ?? "",
        matchType: r.sharedCriterion?.keyword?.matchType ?? "",
        source: `lista: ${r.sharedSet?.name ?? "compartilhada"}`,
      }))
      .filter((n) => n.text);
  } catch {
    return [];
  }
}

async function fetchCampaignNegatives(campaignId: string): Promise<NegativeKw[]> {
  try {
    const rows = (await googleAdsSearch(
      `SELECT campaign_criterion.keyword.text, campaign_criterion.keyword.match_type FROM campaign_criterion WHERE campaign_criterion.negative = true AND campaign_criterion.type = 'KEYWORD' AND campaign.id = ${campaignId}`,
    )) as unknown as CampNegRow[];
    return rows
      .map((r) => ({
        text: r.campaignCriterion?.keyword?.text ?? "",
        matchType: r.campaignCriterion?.keyword?.matchType ?? "",
        source: "campanha",
      }))
      .filter((n) => n.text);
  } catch {
    return [];
  }
}

async function fetchSearchTerms(campaignId: string, days: number): Promise<SearchTerm[]> {
  const rows = (await googleAdsSearch(
    `SELECT search_term_view.search_term, metrics.cost_micros, metrics.clicks, metrics.conversions
     FROM search_term_view
     WHERE segments.date BETWEEN '${spDate(days - 1)}' AND '${spDate(0)}' AND campaign.id = ${campaignId}
     ORDER BY metrics.cost_micros DESC
     LIMIT 40`,
  )) as unknown as STRow[];
  return rows.map((r) => ({
    term: r.searchTermView?.searchTerm ?? "",
    cost: Number(r.metrics?.costMicros ?? 0) / 1_000_000,
    clicks: Number(r.metrics?.clicks ?? 0),
    conversions: Number(r.metrics?.conversions ?? 0),
  }));
}

/** Contexto de keyword pras campanhas Google informadas. Nunca lança. */
export async function collectGoogleKeywordContext(
  campaigns: Array<{ externalId: string; label: string }>,
  days = 7,
): Promise<GoogleKwContext[]> {
  if (!googleConfigured() || campaigns.length === 0) return [];
  const shared = await fetchSharedNegatives();
  const out: GoogleKwContext[] = [];
  for (const c of campaigns) {
    try {
      const [searchTerms, campNeg] = await Promise.all([
        fetchSearchTerms(c.externalId, days),
        fetchCampaignNegatives(c.externalId),
      ]);
      out.push({ campaignId: c.externalId, label: c.label, searchTerms, negatives: [...campNeg, ...shared] });
    } catch (err) {
      out.push({ campaignId: c.externalId, label: c.label, searchTerms: [], negatives: shared, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return out;
}
