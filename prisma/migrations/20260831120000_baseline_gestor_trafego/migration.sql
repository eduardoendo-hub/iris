-- ============================================================
-- BASELINE — Gestor de Tráfego (TrackedCampaign, CampaignMetricSample,
-- AgentRecommendation) + vínculo TrackedCampaign → Campaign.
--
-- POR QUE ESTA MIGRATION EXISTE
-- Estas tabelas foram criadas em PRODUÇÃO à mão (ssh + docker exec psql),
-- com o SQL solto em docs/migration-*.sql, e nunca entraram no histórico de
-- migrations. Resultado: `prisma migrate deploy` num banco limpo NÃO criava
-- nada disso. Esta migration reconcilia o histórico com o schema.
--
-- SEM blocos DO $$: o /api/admin/migrate divide o SQL por ';' e quebraria o
-- bloco no meio (erro 42601 unterminated dollar-quoted string). Use só
-- IF EXISTS / IF NOT EXISTS / DROP+ADD pra idempotência.
--
-- É IDEMPOTENTE de propósito: em produção (onde tudo já existe) ela não
-- altera nada; num banco limpo, cria tudo.
--
-- Nota de drift benigno: em produção as colunas "updatedAt" foram criadas com
-- DEFAULT CURRENT_TIMESTAMP, que o Prisma não gera. É inofensivo (o client
-- sempre envia updatedAt) e NÃO é removido aqui — mexer nisso exigiria ALTER
-- em tabela viva sem ganho algum.
-- ============================================================

-- CreateTable
CREATE TABLE IF NOT EXISTS "TrackedCampaign" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT,
    "nameFilter" TEXT,
    "utmCampaign" TEXT,
    "productSlug" TEXT,
    "label" TEXT NOT NULL,
    "objective" TEXT,
    "targetCpl" DECIMAL(15,2),
    "targetRoas" DECIMAL(8,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "campaignId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedCampaign_pkey" PRIMARY KEY ("id")
);

-- Colunas adicionadas depois da criação original (docs/migration-campaign-metrics.sql
-- e docs/migration-link-campaigns.sql). No-op se a tabela nasceu completa acima.
ALTER TABLE "TrackedCampaign" ADD COLUMN IF NOT EXISTS "utmCampaign" TEXT;
ALTER TABLE "TrackedCampaign" ADD COLUMN IF NOT EXISTS "campaignId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CampaignMetricSample" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "campaignName" TEXT,
    "productSlug" TEXT,
    "metric" TEXT NOT NULL,
    "bucket" TEXT NOT NULL DEFAULT 'DAY',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(15,2) NOT NULL,
    "unit" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignMetricSample_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AgentRecommendation" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "platform" TEXT,
    "campaignRef" TEXT,
    "entityRef" TEXT,
    "priority" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "problem" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "expectedImpact" TEXT,
    "evidence" JSONB,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRecommendation_pkey" PRIMARY KEY ("id")
);

-- O SQL aplicado em produção pediu o índice único com um nome de 67 chars;
-- o Postgres trunca identificadores em 63 bytes, então lá ele ficou como
-- "..._metric_bucket_startsAt" — diferente do nome canônico que o Prisma
-- espera ("..._metric_bucket_star_key"). Renomeia o que existir antes de
-- criar, pra não acabar com DOIS índices iguais de nomes diferentes.
ALTER INDEX IF EXISTS "CampaignMetricSample_platform_externalId_metric_bucket_startsAt"
  RENAME TO "CampaignMetricSample_platform_externalId_metric_bucket_star_key";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "TrackedCampaign_active_idx" ON "TrackedCampaign"("active");
CREATE INDEX IF NOT EXISTS "TrackedCampaign_campaignId_idx" ON "TrackedCampaign"("campaignId");
CREATE UNIQUE INDEX IF NOT EXISTS "TrackedCampaign_platform_accountId_externalId_key" ON "TrackedCampaign"("platform", "accountId", "externalId");
CREATE INDEX IF NOT EXISTS "CampaignMetricSample_platform_startsAt_idx" ON "CampaignMetricSample"("platform", "startsAt");
CREATE INDEX IF NOT EXISTS "CampaignMetricSample_externalId_metric_startsAt_idx" ON "CampaignMetricSample"("externalId", "metric", "startsAt");
CREATE UNIQUE INDEX IF NOT EXISTS "CampaignMetricSample_platform_externalId_metric_bucket_star_key" ON "CampaignMetricSample"("platform", "externalId", "metric", "bucket", "startsAt");
CREATE INDEX IF NOT EXISTS "AgentRecommendation_date_priority_idx" ON "AgentRecommendation"("date", "priority");
CREATE INDEX IF NOT EXISTS "AgentRecommendation_status_idx" ON "AgentRecommendation"("status");

-- AddForeignKey — nunca foi aplicada em produção (o SQL solto só criou a
-- coluna "campaignId" e o índice, sem a constraint). Postgres não tem
-- "ADD CONSTRAINT IF NOT EXISTS" — DROP IF EXISTS + ADD dá a idempotência.
ALTER TABLE "TrackedCampaign" DROP CONSTRAINT IF EXISTS "TrackedCampaign_campaignId_fkey";
ALTER TABLE "TrackedCampaign"
  ADD CONSTRAINT "TrackedCampaign_campaignId_fkey"
  FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
