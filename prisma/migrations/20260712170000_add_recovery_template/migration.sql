-- Config editável dos templates da cadência de recuperação (/admin/recovery).

CREATE TABLE IF NOT EXISTS "RecoveryTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "chatproTemplate" TEXT,
    "params" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fallbackText" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecoveryTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RecoveryTemplate_key_key" ON "RecoveryTemplate"("key");
