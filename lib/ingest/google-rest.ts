/**
 * google-rest — cliente mínimo da Google Ads API via fetch NATIVO + REST.
 *
 * Por quê: a lib `google-ads-api` falha no container com
 * "Invalid response body ... Premature close" ao bater no OAuth (cliente HTTP
 * interno engasga). O fetch nativo do Node funciona normalmente (testado:
 * OK http 400). Então fazemos OAuth + searchStream na mão.
 *
 * Mesma versão da API que a lib usa (v23) pra casar com o developer token.
 */
const API_VERSION = "v23";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** Re-tenta erros de rede transitórios. */
async function retryNet<T>(fn: () => Promise<T>, attempts = 3, delayMs = 500): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      const transient = /premature close|econnreset|etimedout|socket hang up|eai_again|fetch failed|network|enotfound|und_err/i.test(msg);
      if (!transient || i === attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

let _token: { value: string; exp: number } | null = null;

export async function getGoogleAccessToken(): Promise<string> {
  if (_token && _token.exp > Date.now() + 60_000) return _token.value;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) throw new Error("missing_google_oauth_env");
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const json = await retryNet(async () => {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const j = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !j.access_token) {
      throw new Error(`google_token_error: ${j.error || res.status} ${j.error_description || ""}`.trim());
    }
    return j;
  });
  _token = { value: json.access_token!, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return _token.value;
}

// A resposta REST usa camelCase: campaign.id, campaign.name, campaign.status
// (enum por NOME: "ENABLED"/"PAUSED"), metrics.costMicros, segments.date.
export type GoogleAdsRow = {
  campaign?: { id?: string; name?: string; status?: string };
  metrics?: { costMicros?: string; impressions?: string; clicks?: string };
  segments?: { date?: string };
};

/** Roda uma GAQL via REST searchStream. Retorna as linhas (flatten dos batches). */
export async function googleAdsSearch(query: string): Promise<GoogleAdsRow[]> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "").trim();
  const loginCustomerId = (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || "").replace(/-/g, "").trim();
  if (!devToken) throw new Error("missing GOOGLE_ADS_DEVELOPER_TOKEN");
  if (!customerId) throw new Error("missing GOOGLE_ADS_CUSTOMER_ID");
  const token = await getGoogleAccessToken();
  const url = `https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:searchStream`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "developer-token": devToken,
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

  return retryNet(async () => {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify({ query }) });
    const text = await res.text();
    if (!res.ok) throw new Error(`google_ads_api ${res.status}: ${text.slice(0, 400)}`);
    let batches: Array<{ results?: GoogleAdsRow[] }>;
    try {
      batches = JSON.parse(text);
    } catch {
      throw new Error(`google_ads_parse: ${text.slice(0, 200)}`);
    }
    return batches.flatMap((b) => b.results ?? []);
  });
}

/** Disponível se as credenciais mínimas estão configuradas. */
export function googleConfigured(): boolean {
  return !!(
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID
  );
}
