-- AlterTable: adiciona eventAt (data real do evento no Engaged) + reindexa
-- Backfill: pra linhas existentes, usa lastUpdatedAt como fallback (vai ser
-- corrigido quando o user reprocessar webhooks com nova logica).
ALTER TABLE "EngagedPurchase"
  ADD COLUMN "eventAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Pra rows ja existentes, popular com lastUpdatedAt (melhor que NOW)
UPDATE "EngagedPurchase" SET "eventAt" = "lastUpdatedAt";

-- Index novo
CREATE INDEX "EngagedPurchase_eventAt_idx" ON "EngagedPurchase"("eventAt");

-- Index antigo (lastUpdatedAt) ja nao serve pra UI, mas mantemos pra debug
-- (nao dropamos pra nao quebrar query plans existentes)
