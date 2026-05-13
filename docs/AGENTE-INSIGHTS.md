# IRIS — Agente de Análise Estratégica Diária

Agente autônomo que roda **05:00 SP todos os dias**, analisa os dados do dia anterior
(captação + mídia + vendas), compara com targets do plano de marketing + insights
anteriores, e gera um card no painel "Insights → Análise estratégica diária" com:

- Headline (1 linha)
- Severity (INFO / WARN / HIGH / CRITICAL)
- Summary narrativo (3-6 linhas)
- 3-5 recomendações priorizadas e quantificadas

## Arquitetura

```
┌─ Cron 05:00 SP ─────────┐
│ /api/cron/daily-insight │
└──────────┬──────────────┘
           │ POST X-Cron-Secret
           ▼
┌─ collectDailySnapshot ──────────────────┐
│  - VisitEvent agregado por canal/anúncio │
│  - MetricSample spend (Meta + Google)    │
│  - Sale (dia + acumulado campanha)       │
│  - DailyInsight últimos 7d (memória)     │
└──────────┬──────────────────────────────┘
           ▼
┌─ generateInsight ───────────────────────┐
│  Claude Opus 4.7                         │
│  - System: persona + 4 markdowns         │
│    (knowledge base com prompt cache 1h) │
│  - User: snapshot estruturado            │
│  - Adaptive thinking ligado              │
│  - Output: JSON validado por schema      │
└──────────┬──────────────────────────────┘
           ▼
┌─ DailyInsight (Prisma) ────────┐
│  upsert por (productSlug,       │
│  campaignSlug, analysisDate)    │
└──────────┬──────────────────────┘
           ▼
   Cockpit IRIS — seção Insights
```

## Knowledge base do agente

Em `lib/agent/knowledge/`:

| Arquivo | Conteúdo |
|---|---|
| `impacta-context.md` | Quem é a Impacta, posicionamento, tom de marca |
| `claude-pro-product.md` | Produto, oferta, currículo, objeções, CTAs |
| `campaign-plan.md` | Meta 30 matrículas, R$ 9k budget, CAC R$ 300, ROAS 5x, marcos, red flags |
| `traffic-best-practices.md` | Best practices Meta + Google Ads, diagnóstico por padrão, heurísticas |

Esses 4 arquivos vão pro prompt cache (TTL 1h). Cada análise consome ~$0.10
em tokens (mas com cache, backfills sequenciais ficam ~10x mais baratos).

## Setup

### 1. Env vars no Coolify

| Variável | Onde pegar | Obrigatório |
|---|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → Settings → API Keys | ✅ Sim |
| `CRON_SECRET` | Gerar (pode ser UUID ou hex64) | ✅ Sim (compartilhado com outros crons) |
| `IRIS_WEBHOOK_SECRET` | Já existe | ✅ Sim (pra trigger manual) |

### 2. Aplicar migration

```bash
curl -X POST -H "X-Admin-Secret: $IRIS_WEBHOOK_SECRET" \
  https://iris.technowhub.ai/api/admin/migrate
```

### 3. Validar setup (sem chamar LLM)

```bash
curl -X POST -H "X-Cron-Secret: $CRON_SECRET" \
  'https://iris.technowhub.ai/api/cron/daily-insight?dry_run=true' | jq
```

Deve retornar `outcome: "dry_run"` + tamanho do prompt.

### 4. Configurar cron no Coolify

**Scheduled Task** no app `iris`:
- Name: `cron-daily-insight`
- Command:
  ```
  curl -X POST -H "X-Cron-Secret: $CRON_SECRET" http://localhost:3000/api/cron/daily-insight
  ```
- Schedule: `0 8 * * *` (08:00 UTC = 05:00 SP)

### 5. Trigger manual / backfill

Gerar insight pra ontem (igual o cron faria):
```bash
curl -X POST -H "X-Admin-Secret: $IRIS_WEBHOOK_SECRET" \
  'https://iris.technowhub.ai/api/admin/insight?action=generate&product=claude-pro' | jq
```

Backfill pra data específica:
```bash
curl -X POST -H "X-Admin-Secret: $IRIS_WEBHOOK_SECRET" \
  'https://iris.technowhub.ai/api/admin/insight?action=generate&product=claude-pro&date=2026-05-11' | jq
```

Listar insights recentes:
```bash
curl -H "X-Admin-Secret: $IRIS_WEBHOOK_SECRET" \
  'https://iris.technowhub.ai/api/admin/insight?product=claude-pro&days=14' | jq
```

## Manutenção

### Atualizar knowledge base

Os 4 arquivos `.md` em `lib/agent/knowledge/` vão pro git. Pra atualizar:
1. Edita o arquivo
2. Bump `PROMPT_VERSION` em `lib/agent/generate-insight.ts` (`v1` → `v2`)
3. Commit + redeploy
4. **Regenera insights antigos**: `POST /api/admin/insight?action=generate&date=YYYY-MM-DD`
   pra cada dia que você quer atualizar com o novo contexto.

### Trocar modelo

Em `lib/agent/generate-insight.ts`:
```ts
const MODEL = "claude-opus-4-7";  // ou "claude-sonnet-4-6" pra reduzir custo
```

### Adicionar novo produto

1. Adiciona o produto em `lib/products.ts` (já feito por `docs/PRODUCTS.md`)
2. **Opcional**: cria/atualiza knowledge base se for produto muito diferente do Claude Pro
3. Cron já roda pra todos os produtos do registry (loop em `listProductSlugs()`)

## Custo estimado

| Item | Valor |
|---|---|
| Tokens in (system + user) | ~6.000 tokens/análise |
| Tokens out (JSON estruturado) | ~1.500 tokens/análise |
| Cache read em backfills | -90% no system prompt |
| Custo por análise (Opus 4.7) | ~$0.08 (sem cache) / ~$0.02 (com cache) |
| Custo mensal (1 produto, 1x/dia) | ~$2.40 |

Múltiplos produtos / múltiplas campanhas escalam linearmente.

## Observabilidade

Cada `DailyInsight` salva:
- `tokensIn` / `tokensOut` / `cachedTokensRead` — pra trackar custo
- `model` / `promptVersion` — pra invalidar se mudar prompt
- `metricsSnapshot` (JSON) — todos os dados que alimentaram a análise (auditoria)

Pra debug:
```bash
# Última análise gerada
curl -H "X-Admin-Secret: $IRIS_WEBHOOK_SECRET" \
  'https://iris.technowhub.ai/api/admin/insight?days=1' | jq '.insights[0]'
```
