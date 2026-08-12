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
    // Turma vigente = Setembro/2026 (Turma 4, 14–18/09). campaignSlug e' usado no push de
    // lead DRAFT do Engaged pro RD CRM — tem que apontar pra turma ativa.
    campaignSlug: "claude-pro-setembro-2026",
    // sharedId: setembro (qnwmjm487q) primeiro; agosto (72rspa5wc8) e maio
    // (x68jpj7w3k) mantidos p/ nao regredir webhooks em transito de turmas
    // anteriores (a campanha ENDED ja barra no gate do webhook).
    // engagedProductId da Turma 4: preencher com product._id do primeiro
    // webhook Purchase do checkout qnwmjm487q; ate la, os antigos servem
    // de fallback de atribuicao.
    engagedCheckoutSharedIds: ["qnwmjm487q", "72rspa5wc8", "x68jpj7w3k"],
    engagedProductIds: ["6a208a4cccd3d6001cbf58dd", "69fe28452501c7001ca77fe5"],
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
    // Turma remarcada de novo: início 28/09/2026 (antes 03/08, antes 29/06).
    campaignSlug: "codigozero-setembro-2026",
    // Engaged checkout SharedIDs — extraídos de
    //   https://impacta.site.engaged.com.br/p/checkout/qeuqyr0d3y  (turma 28/09, vigente)
    //   https://impacta.site.engaged.com.br/p/checkout/wpjw515nvn  (turmas anteriores; mantido
    //     para não perder atribuição de compras em voo do link antigo)
    engagedCheckoutSharedIds: ["qeuqyr0d3y", "wpjw515nvn"],
  },
  "advia": {
    slug: "advia",
    name: "ADV-IA",
    // LP servida em advia.technowhub.ai; advia.impacta.com.br redireciona pra cá.
    lpUrl: "https://advia.technowhub.ai",
    // Convenção esperada nas campanhas Meta/Google: nome contendo "ADVIA"
    // (ex.: "M1-PROSP-ADVIA-JUN26", "G1-SEARCH-ADVIA-JUN26").
    metaCampaignFilter: "ADVIA",
    googleCampaignFilter: "ADVIA",
    campaignSlug: "advia-junho-2026",
    // Engaged checkout SharedID — extraído de
    //   https://impacta.site.engaged.com.br/p/checkout/4jtt6rr7ti
    engagedCheckoutSharedIds: ["4jtt6rr7ti"],
  },

  "mba-academy": {
    slug: "mba-academy",
    name: "MBA Academy AI Master",
    // LP servida em mbaacademy.technowhub.ai. Oferta interna: aluno do MBA
    // compra o Impacta Academy AI Master e abona as 64h de Experience Labs.
    lpUrl: "https://mbaacademy.technowhub.ai",
    // SEM midia paga (Meta/Google) — distribuicao organica/secretaria. Por isso
    // nao tem metaCampaignFilter/googleCampaignFilter (nada de spend pra atribuir).
    campaignSlug: "mba-academy-ai-master",
    // Engaged checkout SharedID — extraido do BUY_URL da LP:
    //   https://impacta.site.engaged.com.br/p/checkout/w4uz6kh4cj
    engagedCheckoutSharedIds: ["w4uz6kh4cj"],
  },

  "qa-next": {
    slug: "qa-next",
    name: "QA Next",
    // LP servida em qanext.technowhub.ai (Coolify, nginx). Imersao QA +
    // automacao (Playwright) + IA, turma agosto/2026. Repo: eduardoendo-hub/qa-next.
    lpUrl: "https://qanext.technowhub.ai",
    // Convencao esperada nas campanhas Meta/Google: nome contendo "QANEXT"
    // (ex.: "M1-PROSP-QANEXT-AGO26", "G1-SEARCH-QANEXT-AGO26").
    metaCampaignFilter: "QANEXT",
    googleCampaignFilter: "QANEXT",
    campaignSlug: "qa-next-agosto-2026",
    // Engaged checkout SharedID — extraido do BUY_URL da LP:
    //   https://impacta.site.engaged.com.br/p/checkout/tm8cdtdrbf
    engagedCheckoutSharedIds: ["tm8cdtdrbf"],
    // engagedProductIds: preencher com product._id de um webhook real do Engaged
    // (ou painel Engaged) apos a primeira venda — fallback de atribuicao.
  },

  "logica": {
    slug: "logica",
    name: "Lógica de Programação",
    // LP servida em impacta.com.br/cursos/logica/ (dominio publico da Impacta,
    // ja na whitelist de CORS do /api/events). Curso de 40h ao vivo, Python,
    // do zero — parceria Olhar Digital. PRIMEIRA LP MULTI-TURMA: a mesma
    // pagina vende Presencial (inicio 14/09/2026) e Online ao vivo (01/09/2026),
    // cada uma com seu checkout. O de-para sharedId->turma vive na
    // CampaignTurma da campanha; aqui vao TODOS os sharedIds (filtro de
    // produto do webhook).
    lpUrl: "https://impacta.com.br/cursos/logica/",
    // Convencao esperada nas campanhas Meta/Google: nome contendo "LOGICA"
    // (ex.: "M1-PROSP-LOGICA-SET26", "G1-SEARCH-LOGICA-SET26").
    metaCampaignFilter: "LOGICA",
    googleCampaignFilter: "LOGICA",
    campaignSlug: "logica-setembro-2026",
    // Engaged checkout SharedIDs — presencial + online:
    //   https://impacta.site.engaged.com.br/p/checkout/se22shhnov  (Presencial)
    //   https://impacta.site.engaged.com.br/p/checkout/3je9srypg3  (Online ao vivo)
    engagedCheckoutSharedIds: ["se22shhnov", "3je9srypg3"],
  },

  "corporativo": {
    slug: "corporativo",
    name: "Corporativo",
    // Produto UNICO que agrega o hub institucional + a pagina de IA.
    // Ambas as LPs reportam product_slug='corporativo' (ver /api/events).
    // Hub: corporate.technowhub.ai · IA: ia-corporate.technowhub.ai
    lpUrl: "https://corporate.technowhub.ai",
    // Convencao pra futuras campanhas Meta/Google: nome contendo "CORPORATIVO".
    metaCampaignFilter: "CORPORATIVO",
    googleCampaignFilter: "CORPORATIVO",
    campaignSlug: "corporativo",
    // Sem Engaged: corporate gera LEADS (form -> RD Station), nao vendas Engaged.
  },

  "mysql": {
    slug: "mysql",
    name: "Formação MySQL Profissional",
    // LP servida em mysql.technowhub.ai (Coolify, nginx). Curso EAD de banco de
    // dados: SQL, modelagem, MySQL, procedures/triggers/functions. Em parceria
    // com o Olhar Digital. Repo: eduardoendo-hub/mysql-lp.
    lpUrl: "https://mysql.technowhub.ai",
    // Convencao esperada nas campanhas Meta/Google: nome contendo "MYSQL"
    // (ex.: "M1-PROSP-MYSQL-JUL26", "G1-SEARCH-MYSQL-JUL26").
    metaCampaignFilter: "MYSQL",
    googleCampaignFilter: "MYSQL",
    campaignSlug: "mysql-lancamento",
    // Engaged checkout SharedID — extraido do BUY_URL da LP:
    //   https://impacta.site.engaged.com.br/p/checkout/nu3qkxhw84
    engagedCheckoutSharedIds: ["nu3qkxhw84"],
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
