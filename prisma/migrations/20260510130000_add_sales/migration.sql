-- CreateEnum
CREATE TYPE "SaleSource" AS ENUM ('ENGAGED', 'MANUAL', 'OTHER');

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "source" "SaleSource" NOT NULL DEFAULT 'MANUAL',
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "externalId" TEXT,
    "externalRef" TEXT,
    "notes" TEXT,
    "saleDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sale_productSlug_saleDate_idx" ON "Sale"("productSlug", "saleDate");

-- CreateIndex
CREATE INDEX "Sale_source_idx" ON "Sale"("source");
