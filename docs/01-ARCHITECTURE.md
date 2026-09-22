# 01 — Arquitetura

> **Estado:** documento de arquitetura escrito no início do projeto e revisado em
> 2026-08-31 contra o código. As linhas marcadas com _(não implementado)_ são
> planos que nunca saíram do papel — ficam registrados de propósito, para não
> serem reinventados sem decisão. O que roda hoje está em [`CLAUDE.md`](../CLAUDE.md).

## Stack
| Camada | Tecnologia | Motivo |
|---|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind | Mesmo padrão de `technow-social-engine` |
| Design System | Tokens importados de `technow-social-engine/design-system/tech_now_design_system` | Identidade TechNow consistente |
| Database | PostgreSQL via Prisma 6 | Mesmo padrão; Prisma pra type-safety |
| Auth | NextAuth (Google OAuth) | Restrito a domínios @impacta / @technowhub |
| AI | Anthropic SDK (Claude) | insight diário + gestor de tráfego (ver `lib/agent/`) |
| Cache | ~~Redis (Upstash)~~ _(não implementado)_ | Nunca foi necessário — as consultas batem direto no Postgres |
| Cron | Coolify scheduled tasks → `/api/cron/*` (header `X-Cron-Secret`) | Ingestão + agentes |
| Hosting | Coolify (servidor `159.69.240.1`) | Mesmo padrão das LPs |
| Domínio | `iris.technowhub.ai` | No ar |

## Fontes de dados
| Fonte | API | O que traz | Auth |
|---|---|---|---|
| GA4 | GA4 Data API v1 | sessions, events, conversions, UTMs | Service Account |
| Google Ads | REST **v23** via `lib/ingest/google-rest.ts` (fetch nativo — a lib `google-ads-api` quebra no container) | cost, clicks, impressions, CPC, search terms | Dev Token + OAuth (app publicado) |
| Meta Ads | Marketing API v19+ | cost, impressions, reach por campaign | System User Token |
| Sympla | ~~Sympla API v3~~ _(não implementado)_ | Existe só como valor de enum no schema | — |
| Search Console | ~~Search Console API~~ _(não implementado)_ | — | — |

Fontes que **existem e não estavam nesta tabela**: o webhook do Engaged
(`/api/webhook/engaged`, vendas), os eventos das próprias LPs (`/api/events`,
`VisitEvent`) e a reconciliação com a API da Impacta (`lib/ingest/impacta.ts`).

## Fluxo de dados
```
[GA4]  [Google Ads]  [Meta]  [Sympla]  [GSC]
  \         |           |       |       /
   \        v           v       v      /
    +------ Ingestion (cron 15min) ----+
                    |
                    v
              [PostgreSQL]
              (Snapshot table)
              /              \
       [Next.js UI]      [AI Insights cron 1h]
              \              /
               v            v
             [Operator]  [Push / Email]
```

## Endpoints principais (Next.js API)
| Rota | Método | O que faz | Trigger |
|---|---|---|---|
| `/api/cron/ingest-ga4` | GET | Pull GA4 → snapshots | Cron 15min |
| `/api/cron/ingest-ads` | GET | Pull Google Ads → snapshots | Cron 15min |
| `/api/cron/ingest-meta` | GET | Pull Meta Ads → snapshots | Cron 15min |
| `/api/cron/ai-insights` | GET | Roda Claude → grava insights | Cron 1h |
| `/api/products` | GET/POST | CRUD produtos | UI |
| `/api/dashboard/[slug]` | GET | Dados agregados pro cockpit | UI poll 60s |
| `/api/insights/[id]/ack` | POST | Marcar insight como visto | UI |
| `/api/push/subscribe` | POST | Salvar PushSubscription | UI |

## Performance
- UI consulta sempre o Postgres (rápido), nunca chama API externa direto
- Cache Redis no `/api/dashboard/[slug]` (TTL 60s) pra absorver pico de polling
- Postgres com índice em `(productId, startsAt, source)` no `Snapshot`

## Segurança
- Secrets via Coolify env vars (não em `.env` commitado)
- Auth obrigatório em todas as rotas exceto `/login`, `/api/health`
- Rate limit em `/api/*` (10 req/min/user)
- `/api/cron/*` protegido por `CRON_SECRET` no header

## Observabilidade
- Logs estruturados (pino) → Coolify logs
- Sentry pra erros (free tier)
- Health check em `/api/health` consultado pelo Coolify

## Não-decisões (deixadas pra depois)
- Multi-tenant (1 conta = 1 IRIS por enquanto)
- Audit log de quem viu o quê
- Versionamento de configuração de produto
- Webhook out (IRIS notificando outros sistemas)
