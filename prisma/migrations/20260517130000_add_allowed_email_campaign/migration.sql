-- CreateTable: AllowedEmailCampaign (juncao many-to-many AllowedEmail x Campaign)
CREATE TABLE "AllowedEmailCampaign" (
    "id" TEXT NOT NULL,
    "allowedEmailId" TEXT NOT NULL,
    "campaignSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AllowedEmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unicidade (1 email nao pode duplicar a mesma campanha)
CREATE UNIQUE INDEX "AllowedEmailCampaign_allowedEmailId_campaignSlug_key"
    ON "AllowedEmailCampaign"("allowedEmailId", "campaignSlug");

-- CreateIndex: queries por email (mais comum: "que campanhas esse usuario ve?")
CREATE INDEX "AllowedEmailCampaign_allowedEmailId_idx"
    ON "AllowedEmailCampaign"("allowedEmailId");

-- CreateIndex: queries por campanha (admin: "quem ve essa campanha?")
CREATE INDEX "AllowedEmailCampaign_campaignSlug_idx"
    ON "AllowedEmailCampaign"("campaignSlug");

-- AddForeignKey: cascata quando AllowedEmail eh removido
ALTER TABLE "AllowedEmailCampaign"
    ADD CONSTRAINT "AllowedEmailCampaign_allowedEmailId_fkey"
    FOREIGN KEY ("allowedEmailId") REFERENCES "AllowedEmail"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: cascata quando Campaign eh removida (referencia pelo slug,
-- que tem UNIQUE constraint na tabela Campaign)
ALTER TABLE "AllowedEmailCampaign"
    ADD CONSTRAINT "AllowedEmailCampaign_campaignSlug_fkey"
    FOREIGN KEY ("campaignSlug") REFERENCES "Campaign"("slug")
    ON DELETE CASCADE ON UPDATE CASCADE;
