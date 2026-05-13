-- CreateTable
CREATE TABLE "DailyInsight" (
    "id" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "campaignSlug" TEXT NOT NULL DEFAULT '',
    "analysisDate" TIMESTAMP(3) NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "recommendations" JSONB NOT NULL,
    "severity" TEXT NOT NULL,
    "metricsSnapshot" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "cachedTokensRead" INTEGER,
    "promptVersion" TEXT NOT NULL,
    CONSTRAINT "DailyInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyInsight_productSlug_campaignSlug_analysisDate_key"
  ON "DailyInsight"("productSlug", "campaignSlug", "analysisDate");

-- CreateIndex
CREATE INDEX "DailyInsight_productSlug_analysisDate_idx"
  ON "DailyInsight"("productSlug", "analysisDate");

-- CreateIndex
CREATE INDEX "DailyInsight_generatedAt_idx" ON "DailyInsight"("generatedAt");
