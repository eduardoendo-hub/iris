-- CreateTable
CREATE TABLE "VisitEvent" (
    "id" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "campaignSlug" TEXT,
    "pageUrl" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "referrer" TEXT,
    "value" DECIMAL(15,2),
    "currency" TEXT,
    "ts" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VisitEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitEvent_productSlug_eventName_ts_idx" ON "VisitEvent"("productSlug", "eventName", "ts");

-- CreateIndex
CREATE INDEX "VisitEvent_productSlug_utmSource_utmMedium_ts_idx" ON "VisitEvent"("productSlug", "utmSource", "utmMedium", "ts");

-- CreateIndex
CREATE INDEX "VisitEvent_productSlug_ts_idx" ON "VisitEvent"("productSlug", "ts");
