-- CreateEnum
CREATE TYPE "MetricSource" AS ENUM ('GA4', 'META_ADS', 'GOOGLE_ADS', 'ENGAGED', 'RD_CRM', 'MANUAL');

-- CreateTable
CREATE TABLE "MetricSample" (
    "id" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "source" "MetricSource" NOT NULL,
    "metric" TEXT NOT NULL,
    "bucket" "Bucket" NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "value" DECIMAL(15,2) NOT NULL,
    "unit" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetricSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetricSample_productSlug_source_metric_bucket_startsAt_key" ON "MetricSample"("productSlug", "source", "metric", "bucket", "startsAt");

-- CreateIndex
CREATE INDEX "MetricSample_productSlug_metric_startsAt_idx" ON "MetricSample"("productSlug", "metric", "startsAt");

-- CreateIndex
CREATE INDEX "MetricSample_source_startsAt_idx" ON "MetricSample"("source", "startsAt");
