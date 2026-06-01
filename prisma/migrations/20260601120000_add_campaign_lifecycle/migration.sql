-- Campaign lifecycle: status (DRAFT|ACTIVE|ENDED), encerramento real, freeze,
-- sharedIds Engaged por turma e proveniencia (clone). Mais carimbo de
-- campaignSlug em Sale/EngagedPurchase.

-- ── Enum de ciclo de vida ──────────────────────────────────────────────
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED');

-- ── Campaign: novos campos ─────────────────────────────────────────────
ALTER TABLE "Campaign" ADD COLUMN "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "Campaign" ADD COLUMN "endedAt" TIMESTAMP(3);
ALTER TABLE "Campaign" ADD COLUMN "frozenResults" JSONB;
ALTER TABLE "Campaign" ADD COLUMN "engagedCheckoutSharedIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Campaign" ADD COLUMN "clonedFromSlug" TEXT;

CREATE INDEX "Campaign_productSlug_status_idx" ON "Campaign"("productSlug", "status");

-- Backfill status a partir do estado atual:
--   isActive=true              -> ACTIVE
--   isActive=false & endDate<hoje -> ENDED (campanha que ja passou)
--   resto                      -> DRAFT
UPDATE "Campaign" SET "status" = 'ACTIVE' WHERE "isActive" = true;
UPDATE "Campaign"
  SET "status" = 'ENDED', "endedAt" = "endDate"
  WHERE "isActive" = false AND "endDate" < NOW();

-- ── Sale: carimbo de campanha ──────────────────────────────────────────
ALTER TABLE "Sale" ADD COLUMN "campaignSlug" TEXT;
CREATE INDEX "Sale_campaignSlug_idx" ON "Sale"("campaignSlug");

-- ── EngagedPurchase: carimbo de campanha ───────────────────────────────
ALTER TABLE "EngagedPurchase" ADD COLUMN "campaignSlug" TEXT;
CREATE INDEX "EngagedPurchase_campaignSlug_idx" ON "EngagedPurchase"("campaignSlug");
