-- ============================================================
-- BASELINE — ChannelGroup (agrupamento de canais do cockpit)
--
-- Mesma história da migration anterior: a tabela foi criada direto em
-- produção (docs/migration-channel-groups.sql) e nunca entrou no histórico.
-- Idempotente: no-op em produção, cria tudo num banco limpo.
--
-- O seed dos 5 grupos default vai junto de propósito — sem eles a tabela
-- "Por fonte (UTM)" do cockpit nasce sem nenhuma classificação de canal.
-- ============================================================

-- CreateTable
CREATE TABLE IF NOT EXISTS "ChannelGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "mediums" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "matchEmptySource" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ChannelGroup_name_key" ON "ChannelGroup"("name");
CREATE INDEX IF NOT EXISTS "ChannelGroup_ordem_idx" ON "ChannelGroup"("ordem");

-- Seed dos grupos default (ordem = ordem de avaliação E de exibição).
INSERT INTO "ChannelGroup" ("id","name","ordem","color","sources","mediums","matchEmptySource","updatedAt") VALUES
  ('cg_organico','Orgânico',0,'#9CA3AF', ARRAY['direct','(direct)','none'],               ARRAY['organic','referral','none'], true,  CURRENT_TIMESTAMP),
  ('cg_mailing', 'Mailing', 1,'#F59E0B', ARRAY['rdstation','rd','mailchimp'],             ARRAY['email'],                     false, CURRENT_TIMESTAMP),
  ('cg_meta',    'Meta',    2,'#1877F2', ARRAY['meta','facebook','fb','instagram','ig'],  ARRAY[]::TEXT[],                    false, CURRENT_TIMESTAMP),
  ('cg_google',  'Google',  3,'#34A853', ARRAY['google','google-ads','googleads','gads'], ARRAY[]::TEXT[],                    false, CURRENT_TIMESTAMP),
  ('cg_portal',  'Portal',  4,'#A855F7', ARRAY['olhar-digital','olhardigital','portal'],  ARRAY[]::TEXT[],                    false, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
