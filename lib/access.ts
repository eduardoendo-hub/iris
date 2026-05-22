/**
 * lib/access.ts — controle de acesso por campanha.
 *
 * Regras:
 *   1. Email cadastrado em AllowedEmail SEM campanhas linkadas → acesso total
 *      (backward compat: emails que existiam antes do feature continuam vendo tudo).
 *   2. Email cadastrado em AllowedEmail COM 1+ campanhas linkadas → ve apenas
 *      as campanhas listadas.
 *   3. Email cujo dominio bate em AllowedDomain → acesso total.
 *   4. Email fora de ambos → nao consegue logar (auth.ts ja barra na callback signIn).
 *
 * Retorno de `getAllowedCampaignSlugs(email)`:
 *   - `null` → acesso TOTAL (admin/full). Cockpit mostra todas as campanhas.
 *   - `string[]` (possivelmente vazio) → acesso restrito. Cockpit mostra so essas.
 *
 * Importante: array VAZIO retornado significa "email com restricao mas sem
 * campanhas liberadas" — situacao patologica (admin esqueceu de linkar alguma).
 * O cockpit deve tratar como "nada visivel" + mostrar mensagem de erro pro user
 * entrar em contato com o admin.
 */
import { prisma } from "@/lib/prisma";

export type AccessScope =
  | { scope: "all" }                       // ve tudo
  | { scope: "restricted"; campaigns: string[] };  // ve apenas essas

/**
 * Retorna o escopo de acesso do email no cockpit.
 *
 * @param email email do usuario logado (case-insensitive — normalizado pra lowercase)
 * @returns AccessScope
 */
export async function getAccessScope(email: string | null | undefined): Promise<AccessScope> {
  if (!email) return { scope: "restricted", campaigns: [] };
  const normalized = email.trim().toLowerCase();
  if (!normalized) return { scope: "restricted", campaigns: [] };
  const domain = normalized.split("@")[1] || "";

  // 1. Dominio inteiro liberado → acesso total
  if (domain) {
    const dbDomain = await prisma.allowedDomain.findUnique({ where: { domain } });
    if (dbDomain) return { scope: "all" };
    // Fallback env (ALLOWED_EMAIL_DOMAINS) — mantem compat com setup inicial
    const envDomains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
      .split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
    if (envDomains.includes(domain)) return { scope: "all" };
  }

  // 2. Email individual no DB
  const allowedEmail = await prisma.allowedEmail.findUnique({
    where: { email: normalized },
    include: { allowedCampaigns: { select: { campaignSlug: true } } },
  });
  if (allowedEmail) {
    if (allowedEmail.allowedCampaigns.length === 0) {
      // Sem campanhas linkadas → acesso total (backward compat)
      return { scope: "all" };
    }
    return {
      scope: "restricted",
      campaigns: allowedEmail.allowedCampaigns.map((c) => c.campaignSlug),
    };
  }

  // 3. Fallback env ALLOWED_EMAIL_ADDRESSES — sempre acesso total
  // (nao da pra restringir email controlado por env)
  const envEmails = (process.env.ALLOWED_EMAIL_ADDRESSES ?? "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (envEmails.includes(normalized)) return { scope: "all" };

  // 4. Sem match — sem acesso
  return { scope: "restricted", campaigns: [] };
}

/**
 * Conveniencia: dado o escopo, retorna se o usuario pode ver uma campanha
 * especifica (pelo slug).
 */
export function canSeeCampaign(scope: AccessScope, campaignSlug: string): boolean {
  if (scope.scope === "all") return true;
  return scope.campaigns.includes(campaignSlug);
}

/**
 * Conveniencia: filtra uma lista de campanhas pelo escopo do usuario.
 * Mantem a ordem original.
 */
export function filterCampaignsByScope<T extends { slug: string }>(
  campaigns: T[],
  scope: AccessScope,
): T[] {
  if (scope.scope === "all") return campaigns;
  const allowed = new Set(scope.campaigns);
  return campaigns.filter((c) => allowed.has(c.slug));
}
