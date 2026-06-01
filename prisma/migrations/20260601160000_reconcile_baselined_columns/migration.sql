-- Reconciliacao de schema: o banco de prod nunca teve _prisma_migrations e foi
-- baselined nesta sessao (migracoes historicas registradas SEM rodar SQL,
-- assumindo que o schema ja existia via db push). Mas o schema de prod tinha
-- DRIFTADO: varias colunas recentes de EngagedPurchase/Sale NUNCA foram criadas,
-- ainda que as migracoes que as adicionam tenham sido marcadas como aplicadas.
--
-- Sintoma: todo webhook de compra do Engaged caia em
--   "The column `campaignSlug` does not exist in the current database"
-- no prisma.engagedPurchase.upsert() -> nenhuma compra gravada -> atribuicao
-- (UTM) perdida em TODOS os produtos (advia, claude-pro, etc.).
--
-- Esta migracao adiciona idempotentemente (IF NOT EXISTS) as colunas/indices
-- que o Prisma client espera. Nao toca no que ja existe (ex.: Campaign.status,
-- que ja estava presente). Seguro re-rodar.

-- ── EngagedPurchase ────────────────────────────────────────────────────
ALTER TABLE "EngagedPurchase" ADD COLUMN IF NOT EXISTS "campaignSlug" TEXT;
ALTER TABLE "EngagedPurchase" ADD COLUMN IF NOT EXISTS "attribution" JSONB;
ALTER TABLE "EngagedPurchase" ADD COLUMN IF NOT EXISTS "rdDealId" TEXT;
ALTER TABLE "EngagedPurchase" ADD COLUMN IF NOT EXISTS "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "EngagedPurchase_campaignSlug_idx" ON "EngagedPurchase"("campaignSlug");
CREATE INDEX IF NOT EXISTS "EngagedPurchase_eventAt_idx" ON "EngagedPurchase"("eventAt");

-- ── Sale ───────────────────────────────────────────────────────────────
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "campaignSlug" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "attribution" JSONB;

CREATE INDEX IF NOT EXISTS "Sale_campaignSlug_idx" ON "Sale"("campaignSlug");
