// Mock data — usado enquanto o conector GA4 + Ads não está plugado.
// Removido em D1.h quando dados reais começam a popular o Postgres.

export const MOCK_PRODUCTS = [
  // Por enquanto só o Curso Claude Pro está sendo monitorado em produção.
  // Direito 5.0 e People AI Lab vão entrar quando os conectores GA4 + Ads
  // forem configurados pra esses produtos também.
  { slug: "claude-pro", name: "Curso Claude Pro", url: "https://claude.technowhub.ai" },
];

export const MOCK_KPIS = {
  direito5: {
    sessions: 3847, sessionsDelta: 12.4,
    ctaClicks: 291,  ctaClicksDelta: 8.1,
    ctr: 7.56,       ctrDelta: -3.2,
    cost: 1240,      costDelta: 4.8,
  },
  peopleai: {
    sessions: 2104, sessionsDelta: -2.1,
    ctaClicks: 168,  ctaClicksDelta: 5.5,
    ctr: 7.99,       ctrDelta: 7.8,
    cost: 920,       costDelta: -1.5,
  },
  // Curso Claude Pro — campanha 11/05 → 08/06/2026
  // Valores iniciais zerados; dashboard receberá dados reais via:
  //   1. Webhooks de integracao-rd → /api/webhook/rd (Lead criado, Click WhatsApp)
  //   2. Cron de ingestão Meta Ads + Google Ads + GA4 (a partir de 11/05)
  // Meta da campanha: 30 matrículas, R$ 9.000 mídia, CAC máx R$ 300, ROAS 5x.
  "claude-pro": {
    // Captação (bloco superior)
    visitsLP:        0,
    clicksCompra:    0, // botao Engaged
    clicksWhats:     0,
    clicksConsultor: 0,
    mediaInvestment: 0, // soma Meta + Google
    // Legado / compat com KPIs antigos
    sessions: 0,      sessionsDelta: null,
    ctaClicks: 0,     ctaClicksDelta: null,
    ctr: 0,           ctrDelta: null,
    cost: 0,          costDelta: null,
  },
  // Código Zero — campanha junho/2026. Mesma estrutura do claude-pro: tudo
  // zerado, dashboard preenche com dado real do MetricSample (ingestão Meta
  // + Google Ads via /api/cron/* a cada 15min). Sem essa entrada o fallback
  // ia em claude-pro e o card de Investimento dava R$0 quando o spend de
  // HOJE era 0 (mesmo tendo R$465+ acumulado). Reported 27/05/2026.
  "codigozero": {
    visitsLP:        0,
    clicksCompra:    0,
    clicksWhats:     0,
    clicksConsultor: 0,
    mediaInvestment: 0,
    sessions: 0,      sessionsDelta: null,
    ctaClicks: 0,     ctaClicksDelta: null,
    ctr: 0,           ctrDelta: null,
    cost: 0,          costDelta: null,
  },
} as const;

export const MOCK_CHANNELS = {
  direito5: [
    { channel: "google / cpc",   cost: 800, sessions: 1840, ctaClicks: 142, cpc: 5.63 },
    { channel: "meta / cpc",     cost: 440, sessions: 1230, ctaClicks: 98,  cpc: 4.49 },
    { channel: "(direct) / (none)", cost: null, sessions: 530, ctaClicks: 38, cpc: null },
    { channel: "google / organic", cost: null, sessions: 247, ctaClicks: 13, cpc: null },
  ],
  peopleai: [
    { channel: "meta / cpc",     cost: 540, sessions: 1100, ctaClicks: 91, cpc: 5.93 },
    { channel: "linkedin / cpc", cost: 380, sessions: 620,  ctaClicks: 51, cpc: 7.45 },
    { channel: "(direct) / (none)", cost: null, sessions: 230, ctaClicks: 18, cpc: null },
    { channel: "google / organic", cost: null, sessions: 154, ctaClicks: 8,  cpc: null },
  ],
  "claude-pro": [
    // Aguardando primeiros dados reais a partir de 11/05/2026.
    { channel: "google / cpc",        cost: 0, sessions: 0, ctaClicks: 0, cpc: null },
    { channel: "meta / cpc",          cost: 0, sessions: 0, ctaClicks: 0, cpc: null },
    { channel: "(direct) / (none)",   cost: null, sessions: 0, ctaClicks: 0, cpc: null },
    { channel: "google / organic",    cost: null, sessions: 0, ctaClicks: 0, cpc: null },
  ],
  "codigozero": [
    // Aguardando dado real — cockpit já substitui via MetricSample.
    { channel: "google / cpc",        cost: 0, sessions: 0, ctaClicks: 0, cpc: null },
    { channel: "meta / cpc",          cost: 0, sessions: 0, ctaClicks: 0, cpc: null },
    { channel: "(direct) / (none)",   cost: null, sessions: 0, ctaClicks: 0, cpc: null },
    { channel: "google / organic",    cost: null, sessions: 0, ctaClicks: 0, cpc: null },
  ],
} as const;

export const MOCK_CTA_POSITION = {
  direito5: [
    { position: "hero",   clicks: 142 },
    { position: "final",  clicks: 71  },
    { position: "header", clicks: 48  },
    { position: "info",   clicks: 21  },
    { position: "footer", clicks: 9   },
  ],
  peopleai: [
    { position: "hero",   clicks: 78 },
    { position: "final",  clicks: 51 },
    { position: "header", clicks: 27 },
    { position: "info",   clicks: 9  },
    { position: "footer", clicks: 3  },
  ],
  "claude-pro": [
    { position: "hero",   clicks: 0 },
    { position: "final",  clicks: 0 },
    { position: "header", clicks: 0 },
    { position: "info",   clicks: 0 },
    { position: "footer", clicks: 0 },
  ],
  "codigozero": [
    { position: "hero",   clicks: 0 },
    { position: "final",  clicks: 0 },
    { position: "header", clicks: 0 },
    { position: "info",   clicks: 0 },
    { position: "footer", clicks: 0 },
  ],
} as const;

export const MOCK_INSIGHTS = [
  {
    id: "1",
    severity: "HIGH" as const,
    category: "ANOMALY" as const,
    title: "CPC do Google Ads subiu 23% nas últimas 24h",
    body: "CPC médio passou de R$ 4.58 → R$ 5.63. Coincide com aumento de impressões (+18%) sem ganho proporcional de cliques.",
    recommendation: "Revisar palavras-chave de baixo CTR e ajustar lances no Google Ads.",
    generatedAt: new Date(Date.now() - 35 * 60 * 1000),
  },
  {
    id: "2",
    severity: "INFO" as const,
    category: "OPPORTUNITY" as const,
    title: "CTA hero converte 3x melhor que footer",
    body: "Hero: 142 cliques · Footer: 9 cliques na última semana. Gap consistente em 3 dos 7 dias avaliados.",
    recommendation: "Considerar reduzir o footer ou replicar o estilo do hero em outros pontos da página.",
    generatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: "3",
    severity: "INFO" as const,
    category: "SUMMARY" as const,
    title: "Resumo do dia: Direito 5.0",
    body: "554 visitas, 41 cliques no Sympla (CTR 7.4%), R$ 178 investidos. Tráfego pago do Google é 65% das visitas hoje.",
    recommendation: null,
    generatedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
  },
];
