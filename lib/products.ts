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

  /**
   * ALTERNATIVA ao metaCampaignFilter: substring case-insensitive no
   * `ad.name` (nome do anuncio). Use quando a campanha NAO segue a
   * convencao de naming e nao da pra renomear sem perder historico/cache.
   * Tem PRECEDENCIA sobre metaCampaignFilter (se setado, usa esse).
   *
   * Ex: anuncios `M1-REEL-PARE-PERGUNTAR-V1`, `M1-REEL-SO-CURSO-ROBO-V1`
   * → metaAdNameFilter: "M1-REEL-" matcha ambos.
   */
  metaAdNameFilter?: string;

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
    // Campanha real no Meta: "M1-PROSP-CLAUDEPRO-MAI26" → bate com CONTAIN "CLAUDEPRO"
    metaCampaignFilter: "CLAUDEPRO",
    googleCampaignFilter: "CLAUDEPRO",
    campaignSlug: "claude-pro-maio-2026",
    engagedCheckoutSharedIds: ["x68jpj7w3k"],
    engagedProductIds: ["69fe28452501c7001ca77fe5"],
  },
  "peopleai": {
    slug: "peopleai",
    name: "People AI Lab",
    lpUrl: "https://peopleai.impacta.com.br",
    // Convenção esperada nas campanhas Meta/Google: nome contendo "PEOPLEAI"
    // (ex.: "M1-PROSP-PEOPLEAI-JUL26", "G1-SEARCH-PEOPLEAI-JUL26").
    metaCampaignFilter: "PEOPLEAI",
    googleCampaignFilter: "PEOPLEAI",
    campaignSlug: "peopleai-julho-2026",
    // Engaged checkout SharedID — extraído de
    //   https://impacta.site.engaged.com.br/p/checkout/ligvw5t7yi
    // (o trecho após /p/checkout/ é o sharedId). Sem isso, os webhooks de
    // Purchase do Engaged não atribuem ao produto e caem fora do cockpit.
    engagedCheckoutSharedIds: ["ligvw5t7yi"],
  },
  "codigozero": {
    slug: "codigozero",
    name: "Código Zero",
    // LP servida em codigozero.technowhub.ai; codigozero.impacta.com.br redireciona pra cá.
    lpUrl: "https://codigozero.technowhub.ai",
    // Convenção esperada nas campanhas Meta/Google: nome contendo "CODIGOZERO"
    // (ex.: "M1-PROSP-CODIGOZERO-JUN26", "G1-SEARCH-CODIGOZERO-JUN26").
    metaCampaignFilter: "CODIGOZERO",
    googleCampaignFilter: "CODIGOZERO",
    campaignSlug: "codigozero-junho-2026",
    // Engaged checkout SharedID — trecho após /p/checkout/ na URL do checkout.
    // TODO: confirmar o sharedId real quando o link do Engaged for definido.
    engagedCheckoutSharedIds: ["codigo-zero"],
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
};

export function getProductConfig(slug: string): ProductConfig | null {
  return PRODUCTS[slug] ?? null;
}

/** Lista os products configurados — usado pelo cron orchestrator. */
export function listProductSlugs(): string[] {
  return Object.keys(PRODUCTS);
}
