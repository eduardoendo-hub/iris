# Arquivo histórico

Documentos que descrevem um estado **passado** do projeto. Não use como
referência do que vale hoje — estão aqui para preservar contexto de decisões.

## `02-PLANO-3-DIAS.md`

Plano de implantação dos 3 primeiros dias (maio/2026). Cumprido — a IRIS está
em produção desde então.

## `07-CAMPANHA-CLAUDE-PRO.md`

Planejamento da primeira campanha do Curso Claude Pro (turma de maio/2026).
Turma vigente hoje vive no banco (`Campaign` ACTIVE), não em markdown.

## `migration-*.sql`

SQL aplicado **à mão em produção** (`ssh` + `docker exec psql`) entre junho e
julho de 2026, quando as tabelas do Gestor de Tráfego e do ChannelGroup foram
criadas fora do controle de migrations.

Esse débito foi fechado em 2026-08-31: o conteúdo virou migrations versionadas
e idempotentes em `prisma/migrations/`:

- `20260831120000_baseline_gestor_trafego` — TrackedCampaign, CampaignMetricSample,
  AgentRecommendation, coluna `campaignId` + a FK para `Campaign` que o SQL manual
  nunca criou.
- `20260831121000_baseline_channel_groups` — ChannelGroup + seed dos 5 grupos default.

**Não rode estes `.sql` manualmente.** Use `prisma migrate deploy` (ou o endpoint
`/api/admin/migrate`); as migrations acima cobrem tudo e são seguras de re-rodar.
