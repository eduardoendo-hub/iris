# 02 — Plano de Execução (3 dias)

Premissa: 1 dev (Eduardo + Claude) full-time. ~6-8h efetivas/dia.

---

## 🟦 Dia 1 — Scaffold + GA4 + Primeiro Produto no ar

### Manhã (3-4h)
- [ ] Criar repo `eduardoendo-hub/iris` no GitHub
- [ ] Scaffold Next.js 15 + TypeScript + Tailwind + Prisma 6
- [ ] Importar tokens do DS TechNow (cores, tipografia, espaçamentos)
- [ ] Setup Postgres local (Docker Compose) + schema inicial
  - Tabelas: `Product`, `Snapshot`, `Insight`, `User`, `PushSubscription`
- [ ] NextAuth com Google OAuth restrito por domínio
- [ ] Layout do cockpit: shell + sidebar + topbar (placeholder)
- [ ] Página `/login` mínima

### Tarde (3-4h)
- [ ] Habilitar GA4 Data API no Google Cloud Console
- [ ] Criar Service Account + JSON credentials
- [ ] Conector GA4 (`lib/ga4.ts`) — busca sessions/events por produto
- [ ] Cadastrar **Direito 5.0** (seed via prisma) com `propertyId`, `utmCampaignPrefix`
- [ ] Endpoint `/api/cron/ingest-ga4` rodando manual
- [ ] Cron Coolify (a cada 15min) chamando o endpoint
- [ ] Cards KPI no cockpit puxando do Postgres: Visitas, Cliques CTA, CTR
- [ ] Configurar domínio `iris.technowhub.ai` (GoDaddy + Coolify)
- [ ] Deploy inicial no Coolify

**✅ Saída do D1**: cockpit em `iris.technowhub.ai` mostrando dados reais do Direito 5.0 vindos do GA4.

---

## 🟨 Dia 2 — Custos + Multi-Produto + Real-Time

### Manhã (3-4h)
- [ ] Habilitar Google Ads API + obter Developer Token
- [ ] OAuth flow pra refresh token do Ads
- [ ] Conector Ads (`lib/google-ads.ts`) — cost, clicks, impressions, CPC por dia/campaign
- [ ] Lógica de matching Ads ↔ GA4 via `utm_campaign` (regras em [03-UTM-CONVENTION](03-UTM-CONVENTION.md))
- [ ] Cards KPI passam a mostrar Custo, CPC, CPL (cost / ctaClicks)

### Tarde (3-4h)
- [ ] Cadastrar **People AI Lab** como segundo produto
- [ ] Seletor de produto no topbar realmente filtra todo o cockpit
- [ ] `<ChannelTable>`: tabela "Por canal" (organic / google / meta / email) com custo, visitas, cliques
- [ ] `<CTAPositionTable>`: tabela "Por posição do botão" (header/hero/info/final/footer)
- [ ] Polling client-side no `/api/dashboard/[slug]` a cada 60s
- [ ] `<RealtimeBadge>` pulsando + timestamp da última atualização
- [ ] Gráfico de linha: sessões + custo (2 eixos Y) últimos 7d

**✅ Saída do D2**: 2 produtos no cockpit, custo do Google Ads aparecendo, atualização "ao vivo".

---

## 🟥 Dia 3 — IA Proativa + Alertas + Polish

### Manhã (3-4h)
- [ ] Endpoint `/api/cron/ai-insights` (cron 1h)
- [ ] Prompt do Claude em `prompts/insights.md` (system) + builder de contexto (`lib/ai/build-context.ts`)
- [ ] Resposta do Claude em JSON estruturado: `{insights: [{severity, category, title, body, recommendation}]}`
- [ ] Anti-duplicação: hash por `productId + title + dia` — se já existe, skip
- [ ] Tabela `Insight` populada
- [ ] Painel "Insights" no cockpit (timeline, mais novo no topo)
- [ ] Botão "Acked" em cada insight (marca `acknowledgedAt`)

### Tarde (3-4h)
- [ ] Web Push subscribe na primeira visita (após login)
- [ ] Quando insight `severity ≥ HIGH` é criado, dispara push pros `User.notifyByWebPush=true`
- [ ] Email transacional via Resend (free tier 100/dia) pros `notifyByEmail=true`
- [ ] [Stretch] Conector Meta Ads
- [ ] [Stretch] Conector Search Console (orgânico)
- [ ] Refinamento visual: dark mode default, micro-animações, responsivo mobile
- [ ] Documento `docs/HOW-TO-ADD-PRODUCT.md` — como cadastrar nova LP
- [ ] Smoke test end-to-end com Eduardo usando

**✅ Saída do D3**: IRIS no ar, 2 produtos com IA dando insights, push funcionando.

---

## 🚫 Fora do MVP (backlog priorizado)
| Prioridade | Item | Esforço |
|---|---|---|
| P1 | Sympla API (fechar funil de inscrição) | 1 dia |
| P1 | WhatsApp notifications via Z-API | 1 dia |
| P2 | UTM Builder UI (dropdowns gerando URL) | meio dia |
| P2 | Comparação multi-produto lado-a-lado | 1 dia |
| P3 | Forecast / predição (Prophet ou similar) | 2-3 dias |
| P3 | PDF executivo semanal automatizado | 1 dia |
| P3 | Audit log + histórico de mudanças | 1 dia |
| P4 | Multi-tenant | 1 semana |

---

## Riscos e mitigações
| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Google Ads API leva dias pra liberar dev token | Alta | Alto (D2 fica vazio) | Pedir token agora, antes de começar |
| GA4 Data API tem rate limit | Média | Médio | Cache Redis 60s + bucket de 15min |
| Coolify não suporta cron nativo | Baixa | Baixo | Usar Vercel Cron (free) ou GitHub Actions |
| Push notifications não funcionam em Safari iOS | Média | Médio | Email fallback obrigatório |
| Meta Ads token expira sem aviso | Alta | Médio | Refresh automático + alerta no próprio IRIS |
