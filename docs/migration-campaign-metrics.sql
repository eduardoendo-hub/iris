-- ============================================================
-- Migração: CampaignMetricSample (Gestor de Tráfego — Fase 2, métrica por campanha)
-- ADITIVA — só cria 1 tabela nova, NÃO altera/apaga nada existente.
-- Aplicar via SSH + docker exec (mesmo caminho da Fase 1):
--   ssh -i ~/.ssh/socialengine_ed25519 root@159.69.240.1 \
--     'docker exec -i n5xbezj2s83xrq2h401rpnvw psql -U iris -d iris' < docs/migration-campaign-metrics.sql
-- (ou cole o conteúdo via heredoc EOSQL)
-- ============================================================

-- Campo de atribuição: liga gasto (campaign id) ↔ leads da LP (utm_campaign).
ALTER TABLE "TrackedCampaign" ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT;

CREATE TABLE IF NOT EXISTS "CampaignMetricSample" (
  "id"           TEXT NOT NULL,
  "platform"     TEXT NOT NULL,
  "accountId"    TEXT NOT NULL,
  "externalId"   TEXT NOT NULL,
  "campaignName" TEXT,
  "productSlug"  TEXT,
  "metric"       TEXT NOT NULL,
  "bucket"       TEXT NOT NULL DEFAULT 'DAY',
  "startsAt"     TIMESTAMP(3) NOT NULL,
  "value"        DECIMAL(15,2) NOT NULL,
  "unit"         TEXT,
  "meta"         JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignMetricSample_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignMetricSample_platform_externalId_metric_bucket_startsAt_key"
  ON "CampaignMetricSample" ("platform", "externalId", "metric", "bucket", "startsAt");
CREATE INDEX IF NOT EXISTS "CampaignMetricSample_platform_startsAt_idx"
  ON "CampaignMetricSample" ("platform", "startsAt");
CREATE INDEX IF NOT EXISTS "CampaignMetricSample_externalId_metric_startsAt_idx"
  ON "CampaignMetricSample" ("externalId", "metric", "startsAt");
