# 01 — Arquitetura

## Stack
| Camada | Tecnologia | Motivo |
|---|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript + Tailwind | Mesmo padrão de `technow-social-engine` |
| Design System | Tokens importados de `technow-social-engine/design-system/tech_now_design_system` | Identidade TechNow consistente |
| Database | PostgreSQL via Prisma 6 | Mesmo padrão; Prisma pra type-safety |
| Auth | NextAuth (Google OAuth) | Restrito a domínios @impacta / @technowhub |
| AI | Anthropic SDK (Claude) | `claude-sonnet-4-6` default; `claude-opus-4-7` pra análises pesadas |
| Cache | Redis (Upstash free tier) | TTL curto pros dados de API |
| Cron | Vercel Cron OU Coolify scheduled tasks | Ingestão a cada 15min |
| Hosting | Coolify (servidor `159.69.240.1`) | Mesmo padrão das LPs |
| Domínio | `iris.technowhub.ai` | A criar no GoDaddy + Coolify |

## Fontes de dados
| Fonte | API | O que traz | Auth |
|---|---|---|---|
| GA4 | GA4 Data API v1 | sessions, events, conversions, UTMs | Service Account |
| Google Ads | Google Ads API v17+ | cost, clicks, impressions, CPC, search terms | Dev Token + OAuth |
| Meta Ads | Marketing API v19+ | cost, impressions, reach por campaign | System User Token |
| Sympla | Sympla API v3 | inscrições efetivadas | API Key |
| Search Console | Search Console API | queries, posições, CTR orgânico | Service Account |

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
