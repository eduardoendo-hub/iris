/**
 * Catálogo de produtos monitorados pelo IRIS.
 *
 * Cada produto tem configs específicas que dizem ao IRIS:
 *   - como filtrar campanhas Meta/Google na Ad Account compartilhada da Impacta
 *   - URL da LP, slug, etc
 *
 * Permite multi-produto na MESMA Ad Account (Impacta Treinamentos roda
 * MBA, Programação, Claude Pro, etc — tudo na mesma conta) sem misturar
 * gastos de produtos diferentes no cockpit.
 *
 * Pra adicionar novo produto, basta adicionar uma entrada aqui e popular
 * Product no DB se for usar (opcional — IRIS lê do mapa por enquanto).
 */

export type ProductConfig = {
  slug: string;
  name: string;
  lpUrl: string;

  /**
   * Substring case-insensitive usada pra filtrar campanhas Meta
   * pela coluna `campaign.name`. As campanhas M1/M2/etc desse
   * produto DEVEM ter esse texto no nome.
   *
   * Ex: "CLAUDEPRO" matcha:
   *   M1-PROSP-CLAUDEPRO-MAI26 ✓
   *   M2-RMK-CLAUDEPRO-MAI26 ✓
   *   G2-PMAX-CLAUDEPRO-MAI26 ✓  (Google, mesmo padrão)
   *   MBA-DIRETOR-2026 ✗
   */
  metaCampaignFilter?: string;

  /** Mesmo padrão pro Google Ads (Fase 4). */
  googleCampaignFilter?: string;

  /** Tag/label de UTM esperada nas LPs desse produto. */
  campaignSlug?: string;

  /**
   * SharedIDs do checkout Engaged que pertencem a esse produto.
   * Engaged manda webhooks de TODOS os produtos da Impacta pra mesma URL —
   * sem filtro, viramos coletor de vendas alheias (MBA, Faculdade, etc).
   * O sharedId aparece em `checkout.sharedId` do payload.
   */
  engagedCheckoutSharedIds?: string[];

  /**
   * IDs do produto Engaged (`product._id` no payload) que pertencem a
   * esse produto. Alternativa/complemento ao sharedId pra filtrar.
   */
  engagedProductIds?: string[];
};

export const PRODUCTS: Record<string, ProductConfig> = {
  "claude-pro": {
    slug: "claude-pro",
    name: "Curso Claude Pro",
    lpUrl: "https://claude.impacta.com.br",
    metaCampaignFilter: "CLAUDEPRO",
    googleCampaignFilter: "CLAUDEPRO",
    campaignSlug: "claude-pro-maio-2026",
    engagedCheckoutSharedIds: ["x68jpj7w3k"],
    engagedProductIds: ["69fe28452501c7001ca77fe5"],
  },
  // Future products — descomentar quando entrarem:
  //
  // "direito5": {
  //   slug: "direito5",
  //   name: "Direito 5.0",
  //   lpUrl: "https://direito5.impacta.com.br",
  //   metaCampaignFilter: "DIREITO5",
  //   googleCampaignFilter: "DIREITO5",
  //   campaignSlug: "direito5-jun-2026",
  // },
  //
  // "peopleai": {
  //   slug: "peopleai",
  //   name: "People AI Lab",
  //   lpUrl: "https://peopleai.impacta.com.br",
  //   metaCampaignFilter: "PEOPLEAI",
  //   googleCampaignFilter: "PEOPLEAI",
  //   campaignSlug: "peopleai-jul-2026",
  // },
};

export function getProductConfig(slug: string): ProductConfig | null {
  return PRODUCTS[slug] ?? null;
}

/** Lista os products configurados — usado pelo cron orchestrator. */
export function listProductSlugs(): string[] {
  return Object.keys(PRODUCTS);
}
