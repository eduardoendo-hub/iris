-- CreateTable
CREATE TABLE "EngagedPurchase" (
    "id" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastEventType" TEXT NOT NULL,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "amount" DECIMAL(15,2),
    "currency" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUpdatedAt" TIMESTAMP(3) NOT NULL,
    "saleId" TEXT,
    CONSTRAINT "EngagedPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EngagedPurchase_productSlug_externalId_key"
  ON "EngagedPurchase"("productSlug", "externalId");

-- CreateIndex
CREATE INDEX "EngagedPurchase_productSlug_status_idx"
  ON "EngagedPurchase"("productSlug", "status");

-- CreateIndex
CREATE INDEX "EngagedPurchase_lastUpdatedAt_idx"
  ON "EngagedPurchase"("lastUpdatedAt");
