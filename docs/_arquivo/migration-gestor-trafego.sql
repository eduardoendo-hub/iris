-- ============================================================
-- Migração: Gestor de Tráfego (TrackedCampaign + AgentRecommendation)
-- ADITIVA — só cria 2 tabelas novas, NÃO altera/apaga nada existente.
-- Aplicar com backup antes. Recomendado: `npx prisma db push` (mais simples,
-- additivo) OU rodar este SQL direto no Postgres.
-- ============================================================

CREATE TABLE "TrackedCampaign" (
  "id"          TEXT NOT NULL,
  "platform"    TEXT NOT NULL,
  "accountId"   TEXT NOT NULL,
  "externalId"  TEXT,
  "nameFilter"  TEXT,
  "productSlug" TEXT,
  "label"       TEXT NOT NULL,
  "objective"   TEXT,
  "targetCpl"   DECIMAL(15,2),
  "targetRoas"  DECIMAL(8,2),
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TrackedCampaign_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TrackedCampaign_platform_accountId_externalId_key"
  ON "TrackedCampaign" ("platform", "accountId", "externalId");
CREATE INDEX "TrackedCampaign_active_idx" ON "TrackedCampaign" ("active");

CREATE TABLE "AgentRecommendation" (
  "id"             TEXT NOT NULL,
  "date"           TIMESTAMP(3) NOT NULL,
  "scope"          TEXT NOT NULL,
  "platform"       TEXT,
  "campaignRef"    TEXT,
  "entityRef"      TEXT,
  "priority"       TEXT NOT NULL,
  "category"       TEXT NOT NULL,
  "problem"        TEXT NOT NULL,
  "action"         TEXT NOT NULL,
  "expectedImpact" TEXT,
  "evidence"       JSONB,
  "status"         TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentRecommendation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AgentRecommendation_date_priority_idx" ON "AgentRecommendation" ("date", "priority");
CREATE INDEX "AgentRecommendation_status_idx" ON "AgentRecommendation" ("status");
