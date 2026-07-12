-- Conciliação de matrículas via API interna da Impacta.

-- Novo valor de origem de venda (importada da API de matrículas).
-- Postgres exige ADD VALUE fora de transação; Prisma migrate lida com isso.
ALTER TYPE "SaleSource" ADD VALUE IF NOT EXISTS 'SISTEMA';

-- Número da turma no sistema interno da Impacta (chave da API de matrículas).
ALTER TABLE "Campaign" ADD COLUMN IF NOT EXISTS "impactaTurmaId" TEXT;

-- CPF do cliente (preenchido nas vendas importadas da API).
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "customerDocument" TEXT;
