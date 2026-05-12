-- CreateTable
CREATE TABLE "WebhookLog" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "headers" JSONB NOT NULL,
    "rawBody" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "resultJson" JSONB,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "saleId" TEXT,
    "externalId" TEXT,
    CONSTRAINT "WebhookLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookLog_source_receivedAt_idx" ON "WebhookLog"("source", "receivedAt");

-- CreateIndex
CREATE INDEX "WebhookLog_outcome_idx" ON "WebhookLog"("outcome");

-- CreateIndex
CREATE INDEX "WebhookLog_externalId_idx" ON "WebhookLog"("externalId");
