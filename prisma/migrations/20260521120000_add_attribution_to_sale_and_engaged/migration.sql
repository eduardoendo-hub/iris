-- Adiciona coluna attribution (JSONB) em Sale e EngagedPurchase pra
-- armazenar UTMs/queryParams da URL no momento do checkout.

ALTER TABLE "Sale" ADD COLUMN "attribution" JSONB;
ALTER TABLE "EngagedPurchase" ADD COLUMN "attribution" JSONB;
