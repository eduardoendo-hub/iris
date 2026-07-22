-- Turmas paralelas por campanha (LP que vende N turmas: presencial + online).
-- Faturamento/investimento seguem consolidados na Campaign; a turma carrega
-- checkout Engaged, ID Simpac e o rótulo visual. Sale/EngagedPurchase ganham
-- o carimbo turmaKey pra marcar de qual turma é cada compra/lead.

CREATE TABLE IF NOT EXISTS "CampaignTurma" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT,
    "engagedSharedIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "engagedProductIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "impactaTurmaId" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignTurma_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CampaignTurma_campaignId_key_key"
    ON "CampaignTurma"("campaignId", "key");

CREATE INDEX IF NOT EXISTS "CampaignTurma_impactaTurmaId_idx"
    ON "CampaignTurma"("impactaTurmaId");

ALTER TABLE "CampaignTurma"
    ADD CONSTRAINT "CampaignTurma_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Carimbo de turma nas compras/vendas (null = campanha simples/legado).
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "turmaKey" TEXT;
ALTER TABLE "EngagedPurchase" ADD COLUMN IF NOT EXISTS "turmaKey" TEXT;
