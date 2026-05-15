-- CreateTable: Campaign
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "mediaBudget" DECIMAL(15,2),
    "productionCostLP" DECIMAL(15,2),
    "productionCostAds" DECIMAL(15,2),
    "productionCostOther" DECIMAL(15,2),
    "goalEnrollments" INTEGER,
    "goalRevenue" DECIMAL(15,2),
    "goalCac" DECIMAL(15,2),
    "goalRoas" DECIMAL(8,2),
    "goalCpl" DECIMAL(15,2),
    "marketingPlan" TEXT,
    "marketingPlanFilename" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_slug_key" ON "Campaign"("slug");
CREATE INDEX "Campaign_productSlug_isActive_idx" ON "Campaign"("productSlug", "isActive");
CREATE INDEX "Campaign_startDate_idx" ON "Campaign"("startDate");

-- Partial unique: garante apenas 1 campanha ATIVA por produto
CREATE UNIQUE INDEX "Campaign_one_active_per_product"
  ON "Campaign"("productSlug")
  WHERE "isActive" = true;

-- CreateTable: AllowedEmail
CREATE TABLE "AllowedEmail" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "note" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedByUserId" TEXT,
    CONSTRAINT "AllowedEmail_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AllowedEmail_email_key" ON "AllowedEmail"("email");

-- CreateTable: AllowedDomain
CREATE TABLE "AllowedDomain" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "note" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "addedByUserId" TEXT,
    CONSTRAINT "AllowedDomain_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AllowedDomain_domain_key" ON "AllowedDomain"("domain");

-- Seed inicial: importa do env vars atuais pra nao quebrar o login
-- (ALLOWED_EMAIL_DOMAINS=impacta.com.br,technowhub.ai e ALLOWED_EMAIL_ADDRESSES=eduardo.endo@gmail.com)
-- Inserts idempotentes via ON CONFLICT DO NOTHING.
INSERT INTO "AllowedDomain" ("id", "domain", "note", "addedAt")
VALUES
  ('seed_impacta', 'impacta.com.br', 'seed inicial do ALLOWED_EMAIL_DOMAINS', NOW()),
  ('seed_technow', 'technowhub.ai', 'seed inicial do ALLOWED_EMAIL_DOMAINS', NOW())
ON CONFLICT ("domain") DO NOTHING;

INSERT INTO "AllowedEmail" ("id", "email", "note", "addedAt")
VALUES
  ('seed_eduardo', 'eduardo.endo@gmail.com', 'seed inicial do ALLOWED_EMAIL_ADDRESSES', NOW())
ON CONFLICT ("email") DO NOTHING;
