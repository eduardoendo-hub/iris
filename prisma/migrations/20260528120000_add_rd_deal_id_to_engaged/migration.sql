-- Adiciona rdDealId em EngagedPurchase: guarda o ID da oportunidade criada
-- no RD CRM quando o lead se cadastrou no Engaged (DRAFT) mas ainda nao
-- comprou. Usado pra REMOVER essa oportunidade quando o cliente paga.

ALTER TABLE "EngagedPurchase" ADD COLUMN "rdDealId" TEXT;
