-- ============================================================
-- Migração: ChannelGroup (agrupamento de canais do cockpit)
-- ADITIVA — cria 1 tabela + semeia os grupos default. Idempotente.
-- Aplicar via SSH + docker exec (mesmo caminho das anteriores).
-- ============================================================

CREATE TABLE IF NOT EXISTS "ChannelGroup" (
  "id"               TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "ordem"            INTEGER NOT NULL DEFAULT 0,
  "color"            TEXT,
  "sources"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "mediums"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "matchEmptySource" BOOLEAN NOT NULL DEFAULT false,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChannelGroup_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ChannelGroup_name_key" ON "ChannelGroup"("name");
CREATE INDEX IF NOT EXISTS "ChannelGroup_ordem_idx" ON "ChannelGroup"("ordem");

INSERT INTO "ChannelGroup" ("id","name","ordem","color","sources","mediums","matchEmptySource") VALUES
  ('cg_organico','Orgânico',0,'#9CA3AF', ARRAY['direct','(direct)','none'],                ARRAY['organic','referral','none'], true),
  ('cg_mailing', 'Mailing', 1,'#F59E0B', ARRAY['rdstation','rd','mailchimp'],              ARRAY['email'],                     false),
  ('cg_meta',    'Meta',    2,'#1877F2', ARRAY['meta','facebook','fb','instagram','ig'],   ARRAY[]::TEXT[],                    false),
  ('cg_google',  'Google',  3,'#34A853', ARRAY['google','google-ads','googleads','gads'],  ARRAY[]::TEXT[],                    false),
  ('cg_portal',  'Portal',  4,'#A855F7', ARRAY['olhar-digital','olhardigital','portal'],   ARRAY[]::TEXT[],                    false)
ON CONFLICT ("name") DO NOTHING;
