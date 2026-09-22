@AGENTS.md

# IRIS — cockpit de campanhas do TechNow Hub

Next.js 15 (App Router) + Prisma + Postgres + Anthropic. Roda em
`iris.technowhub.ai` (Coolify, servidor `159.69.240.1`). Repo `eduardoendo-hub/iris`.

Centraliza GA4, Google Ads, Meta Ads, eventos das LPs e vendas do Engaged numa
tela por produto, com camada de IA que gera insights diários e recomendações de
mídia paga.

**Antes de mexer em operação de campanha, leia [docs/OPERACAO-CAMPANHA.md](docs/OPERACAO-CAMPANHA.md).**
É lá que está o checklist de virada de turma e o mapa produto → LP → checkout.

## Os 3 conceitos que explicam o resto

**1. Produto é o eixo de tudo.** `lib/products.ts` é a fonte da verdade (tipada,
versionada) de cada produto: LP, filtros de campanha Meta/Google, sharedIds do
Engaged. Toda métrica, filtro e atribuição passa por `product_slug`. Espelho
legível em [docs/PRODUCTS.md](docs/PRODUCTS.md) — mude o `.ts` primeiro.

**2. Uma campanha ACTIVE por produto, e a janela dela é o escopo canônico.**
`Campaign` = uma turma/lançamento. A janela `[startDate, effectiveEnd]` (onde
`effectiveEnd = endedAt ?? endDate`) delimita **tudo** que o cockpit soma — por
isso números de turmas antigas não vazam para a atual. Ver `lib/campaigns.ts`.

**3. Gate de ingestão.** `getIngestGate(productSlug)` (`lib/campaigns.ts:255`)
decide se crons e `/api/events` gravam. Sem campanha ACTIVE cobrindo hoje, o
portão fecha e os KPIs congelam — `VisitEvent` granular continua gravando, mas
nada entra nos números. **Sintoma clássico de "o dashboard parou": não é bug, é
campanha ENDED ou fora da janela.**

## Autenticação (quem chama o quê)

| Header / modo | Env | Usado por |
|---|---|---|
| `X-Admin-Secret` | `IRIS_WEBHOOK_SECRET` | endpoints `/api/admin/*` via cURL/automação |
| Sessão NextAuth `role=ADMIN` | — | uso humano na UI |
| `X-Cron-Secret` | `CRON_SECRET` | todas as rotas `/api/cron/*` |
| `X-Engaged-Signature` (HMAC-SHA256) | `ENGAGED_WEBHOOK_SECRET` | webhook do Engaged |

Helper: `lib/admin-auth.ts` (`checkAdminAuth`) aceita os dois primeiros modos.

## Deploy e migrations

**Migrations NÃO rodam sozinhas no deploy** — o build standalone do Next não traz
o Prisma CLI. Fluxo:

```bash
curl -X POST https://iris.technowhub.ai/api/admin/migrate -H "X-Cron-Secret: $CRON_SECRET"
```

Depois redeploy no Coolify. `GET` no mesmo endpoint faz dry-run (lista aplicadas
vs pendentes). O endpoint aplica cada migration pendente numa transação e
registra em `_prisma_migrations` com checksum compatível com o CLI.

⚠️ **Migration aplicada por este endpoint NÃO pode usar `DO $$ ... $$`.** O
`splitStatements` divide o SQL por `;` e quebra o bloco no meio — o Postgres
responde `42601 unterminated dollar-quoted string` e a migration inteira aborta
(aconteceu em 2026-09-22). Para idempotência use só `IF NOT EXISTS`,
`ALTER INDEX IF EXISTS ... RENAME TO`, e `DROP CONSTRAINT IF EXISTS` seguido de
`ADD CONSTRAINT`.

Convenção do repo: **migration nova é idempotente**. O banco de produção foi baselined e já divergiu do histórico no
passado — ver `prisma/migrations/20260601160000_reconcile_baselined_columns` e
as duas `*_baseline_*` de 2026-08-31. Nunca aplique SQL à mão no Postgres de
produção; escreva a migration.

## Atribuição — como uma venda vira número

`app/api/webhook/engaged/route.ts` recebe a compra do Engaged e resolve:

1. **Turma** — `checkout.sharedId` → `getTurmaBySharedId` (produtos multi-turma,
   ex. `logica` presencial + online) ou `getCampaignBySharedId` → carimba
   `campaignSlug`/`turmaKey` em `EngagedPurchase` e `Sale`.
2. **Produto** — `matchProduct` (`lib/products.ts`) por sharedId/productId, com
   fallback `getProductConfig(campaign.productSlug)` quando a turma é clone novo.
3. **Gate** — campanha `status=ENDED` faz o webhook ignorar novas compras
   daquele sharedId.

Idempotência por `externalId`; só status pago (`paid/approved/completed/...`)
vira `Sale`.

## Eventos das LPs

`POST /api/events` aceita **exatamente** estes `event_name`
(`VALID_EVENTS` em `app/api/events/route.ts:73`):

```
lp_view · click_compra · click_consultor · click_whats · lead_form
```

Qualquer outro nome é rejeitado (422). A origem da LP precisa estar em
`ALLOWED_ORIGINS` no mesmo arquivo — **sem isso o preflight bloqueia e nenhum
evento chega** (falha silenciosa do ponto de vista da LP).

## Camada de IA

- **Insight diário por produto** — `lib/agent/{collect-daily-data,generate-insight}.ts`,
  cron `/api/cron/daily-insight`. Itera produtos e pula quem não tem campanha
  ACTIVE. O cron do Coolify deve chamar **sem** `?product=` para processar todos.
- **Gestor de Tráfego** — `lib/agent/{collect-portfolio-data,generate-portfolio-recs}.ts`,
  orquestrado por `run-gestor-trafego.ts`, tela `/admin/gestor-trafego`. Analisa
  as campanhas de mídia vinculadas e aplica ações em 1 clique (negativas no
  Google). Ver [docs/gestor-trafego-agente.md](docs/gestor-trafego-agente.md).
- **Knowledge base** — `lib/agent/knowledge/<produto>-product.md` é **evergreen**:
  estratégia, personas, benchmarks. **Nunca** preço, datas, sharedId ou metas de
  turma — isso vem do banco (campanha ACTIVE + `Campaign.marketingPlan`). Virar
  turma não deve editar markdown nenhum.

## Google Ads — não use a lib oficial

`google-ads-api` **falha no container do Coolify** ("Invalid response body /
Premature close" no OAuth); o fetch nativo funciona. Todo acesso passa por
`lib/ingest/google-rest.ts` (fetch nativo + REST v23: `searchStream` + `mutate`).
A dependência foi removida do `package.json` em 2026-08-31 — não a reintroduza.

O app OAuth está **publicado** no Google Cloud (projeto 184293899030), então o
refresh token não expira mais.

## Onde as coisas ficam

```
app/admin/         telas de operação (campaigns, gestor-trafego, recovery, ...)
app/api/cron/      ga4, meta-ads, google-ads, daily-insight, gestor-trafego, abandoned-checkout
app/api/webhook/   engaged
lib/campaigns.ts   janela, gate de ingestão, resolvers de turma  ← núcleo
lib/products.ts    registry de produtos                          ← fonte da verdade
lib/ingest/        ga4, meta-ads, google-rest, impacta, portfolio
lib/agent/         insight diário + gestor de tráfego + knowledge/
scripts/cron/      wrappers .mjs chamados pelo scheduler
docs/_arquivo/     documentos históricos — não são referência do estado atual
```
