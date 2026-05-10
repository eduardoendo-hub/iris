-- AlterEnum: adiciona DIRETA e CONSULTOR ao SaleSource
-- (ALTER TYPE ADD VALUE roda fora de transacao; o migrate runner aplica
--  statement-por-statement com $executeRawUnsafe, entao funciona.)
ALTER TYPE "SaleSource" ADD VALUE IF NOT EXISTS 'DIRETA';
ALTER TYPE "SaleSource" ADD VALUE IF NOT EXISTS 'CONSULTOR';

-- AlterTable: muda default da coluna source pra DIRETA (precisa ser depois
-- do ALTER TYPE ter sido committed)
ALTER TABLE "Sale" ALTER COLUMN "source" SET DEFAULT 'DIRETA';
