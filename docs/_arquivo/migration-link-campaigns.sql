-- ============================================================
-- Migração: vincular campanhas de mídia à Campaign da IRIS
-- ADITIVA — só adiciona 1 coluna + índice. Não altera/apaga nada.
-- Aplicar via SSH + docker exec (mesmo caminho das anteriores).
-- ============================================================

ALTER TABLE "TrackedCampaign" ADD COLUMN IF NOT EXISTS "campaignId" TEXT;
CREATE INDEX IF NOT EXISTS "TrackedCampaign_campaignId_idx" ON "TrackedCampaign" ("campaignId");
