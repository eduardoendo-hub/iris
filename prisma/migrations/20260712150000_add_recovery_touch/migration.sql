-- Toques de recuperação de checkout abandonado (WhatsApp via ChatPro).

CREATE TABLE IF NOT EXISTS "RecoveryTouch" (
    "id" TEXT NOT NULL,
    "engagedPurchaseId" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "campaignSlug" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "step" INTEGER NOT NULL,
    "templateKey" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "phone" TEXT,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryTouch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RecoveryTouch_engagedPurchaseId_step_key" ON "RecoveryTouch"("engagedPurchaseId", "step");
CREATE INDEX IF NOT EXISTS "RecoveryTouch_engagedPurchaseId_idx" ON "RecoveryTouch"("engagedPurchaseId");
CREATE INDEX IF NOT EXISTS "RecoveryTouch_productSlug_sentAt_idx" ON "RecoveryTouch"("productSlug", "sentAt");
