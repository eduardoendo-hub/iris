# IRIS — Catálogo de Produtos

Documento central que mapeia **cada produto** monitorado pelo IRIS aos seus
identificadores em **todas as fontes de dados** (LP, Meta Ads, Google Ads,
Engaged checkout). Atualize sempre que adicionar um novo produto.

## Fonte da verdade

`lib/products.ts` — registro tipado em código (versionado em git). Esse arquivo
é lido por toda lógica de filtro, ingest e match. **Mude lá primeiro**, depois
atualize esta tabela.

Pra ver o registry rodando em produção:
```bash
curl -s -H "X-Admin-Secret: <secret>" https://iris.technowhub.ai/api/admin/products | jq
```

---

## Produtos configurados

### `claude-pro` — Curso Claude Pro

| Fonte | Identificador | Onde no payload/UI |
|---|---|---|
| **IRIS slug** | `claude-pro` | URL `?product=claude-pro`, FK em tabelas |
| **LP URL (canônico)** | `https://claude.impacta.com.br` | LP push events |
| **LP URL (alias)** | `https://claude.technowhub.ai` | mesmo host físico |
| **UTM campaign** | `claude-pro-maio-2026` | querystring da LP |
| **Meta Ads filter** | `CLAUDEPRO` (substring) | `campaign.name` na ad account |
| **Google Ads filter** | `CLAUDEPRO` (substring) | `campaign.name` no MCC 1894926188 → conta 7290341035 |
| **Engaged sharedId** | `x68jpj7w3k` | `checkout.sharedId` no payload |
| **Engaged productId** | `69fe28452501c7001ca77fe5` | `checkout.invoiceItems[].product._id` |
| **Engaged checkout URL** | `https://impacta.site.engaged.com.br/p/checkout/x68jpj7w3k` | redirect do CTA "Garantir vaga" |
| **Pixel Meta** | `2233020050842609` | LP `inject-tracking.js` |
| **GA4 measurement ID** | `G-JHEJ5ENF8R` | LP `inject-tracking.js` |
| **Campanha início** | `2026-05-11` | M1/M2/G1/G2 |
| **Campanha fim** | `2026-06-08` | data limite ads + matrículas |
| **Ticket** | `R$ 1.499,00` | preço da matrícula |

### Próximos produtos (descomentar em `lib/products.ts` quando entrarem)

#### `direito5` — Direito 5.0
- Status: planejado, sem campanha ativa ainda
- Quando ativar, preencher tabela acima

#### `peopleai` — People AI Lab
- Status: planejado
- Quando ativar, preencher

---

## Como adicionar um NOVO produto (playbook)

### 1. Coletar identificadores das 5 fontes

Antes de mexer em código, junte:

| Item | Onde achar |
|---|---|
| **slug interno** | escolha (ex: `direito5`) — usado em URLs do IRIS |
| **LP URL canônico** | domínio principal da LP |
| **Engaged sharedId** | abre o checkout do produto no Engaged → URL `https://impacta.site.engaged.com.br/p/checkout/{sharedId}` |
| **Engaged productId** | painel Engaged → produto → ID interno do produto (ou pega no `product._id` de um webhook real) |
| **Convenção de nome de campanha Meta** | sugestão: `M1-PROSP-{PRODUTOSLUG}-{MES}{ANO}` |
| **Convenção de nome de campanha Google** | sugestão: `G1-SEARCH-{PRODUTOSLUG}-{MES}{ANO}` |

### 2. Atualizar `lib/products.ts`

Adicione entrada nova no objeto `PRODUCTS`:

```ts
"direito5": {
  slug: "direito5",
  name: "Direito 5.0",
  lpUrl: "https://direito5.impacta.com.br",
  metaCampaignFilter: "DIREITO5",
  googleCampaignFilter: "DIREITO5",
  campaignSlug: "direito5-junho-2026",
  engagedCheckoutSharedIds: ["abc123xyz"],
  engagedProductIds: ["69fe28452501c7001ca77fe5"],
},
```

### 3. Atualizar `app/api/events/route.ts`

Adicione o novo domínio LP ao `ALLOWED_ORIGINS`:

```ts
const ALLOWED_ORIGINS = new Set([
  "https://claude.impacta.com.br",
  "https://direito5.impacta.com.br",  // ← NOVO
  ...
]);
```

### 4. Atualizar essa documentação

Adicione uma seção pro novo produto na tabela acima.

### 5. Commit + push + Redeploy iris

```bash
git add lib/products.ts app/api/events/route.ts docs/PRODUCTS.md
git commit -m "feat(products): adiciona Direito 5.0 ao registro"
git push
# Coolify Redeploy
```

### 6. Validar end-to-end

```bash
# Confirma que /api/admin/products lista o novo produto
curl -s -H "X-Admin-Secret: ..." https://iris.technowhub.ai/api/admin/products | jq

# Cockpit acessa via URL com slug
open https://iris.technowhub.ai/?product=direito5
```

### 7. Configurar lado externo (não-IRIS)

| Onde | O quê |
|---|---|
| **LP** (claude-lp repo) | criar/atualizar LP com `tracking-config.json` apontando pro Engaged checkout do novo produto |
| **Engaged** | criar produto + checkout + cupons |
| **Engaged webhook** | já está configurado pra `/api/webhook/engaged` — IRIS detecta automático pelo sharedId |
| **Meta Ads** | criar campanha **com slug do produto no nome** (ex: M1-PROSP-DIREITO5-JUN26) |
| **Google Ads** | idem (ex: G1-SEARCH-DIREITO5-JUN26) |
| **Pixel/GA4** | normalmente reusa os IDs da Impacta — adicionar se for conta separada |
| **DNS / Coolify** | apontar `{produto}.impacta.com.br` pro container da LP no Coolify |

---

## Princípios de design do registro

### Por que a config fica em código (não DB)?

1. **Versionado em git** — auditoria de quem mudou o quê, quando, por quê
2. **Type-safe** — TypeScript valida os campos
3. **Atômico com deploy** — config nova sai junto com código que lê ela
4. **Sem painel admin extra** — menos UI pra manter

Trade-off: pra adicionar produto novo precisa de PR + deploy (não 1 clique no UI). Aceitável porque adicionar produto é evento raro (semanal/mensal, não diário).

### Por que múltiplos identifiers por fonte?

Engaged manda webhooks de TODOS produtos pra mesma URL. Sem filtro **multi-eixo** (sharedId OR productId), vazaríamos vendas de outros cursos no cockpit do Claude Pro.

`sharedId` é mais robusto (1 checkout = 1 produto), `productId` é fallback caso plataforma do checkout mude.

### Por que filtros de campanha são substring (não exact match)?

Convenção de naming evolve: `M1-PROSP-CLAUDEPRO-MAI26` hoje, `M1-PROSP-CLAUDEPRO-JUN26` no próximo lote. Substring `CLAUDEPRO` cobre ambos sem precisar atualizar config.

---

## Checklist anti-vazamento

Quando adicionar produto novo, validar:

- [ ] `lib/products.ts` tem entrada
- [ ] `engagedCheckoutSharedIds` preenchido (pelo menos 1)
- [ ] `engagedProductIds` preenchido (pelo menos 1, idealmente todos os SKUs)
- [ ] `metaCampaignFilter` e `googleCampaignFilter` definidos com convenção única (não conflita com outro produto — ex: "AI" muito genérico vs "CLAUDEPRO" único)
- [ ] LP URL no `ALLOWED_ORIGINS` do `/api/events`
- [ ] Esta documentação atualizada
- [ ] Smoke test:
  ```bash
  # Cockpit do produto carrega
  curl -s https://iris.technowhub.ai/?product=novo-slug -o /dev/null -w "%{http_code}\n"
  ```
- [ ] Após primeira venda real: confirmar que `/api/debug/webhooks` mostra outcome=created e Sale aparece com slug correto.
