-- Merge MetricSample DAY de midnight UTC pra midnight SP (+3h).
--
-- A migration anterior (20260512150000) era um UPDATE simples que falhava com
-- duplicate key quando ja existia uma linha no horario destino (codigo novo
-- pos-deploy criou linhas as 03:00 UTC; codigo velho criou as 00:00 UTC).
--
-- Esta migracao faz 3 passos:
-- 1. Onde colide: soma value da linha midnight-UTC na linha +3h existente.
-- 2. Apaga linhas midnight-UTC que ja foram mescladas.
-- 3. Shifta as restantes (sem colisao) com UPDATE simples.

-- Step 1: merge values when target row exists
UPDATE "MetricSample" target
SET "value" = target."value" + src."value"
FROM "MetricSample" src
WHERE src."bucket" = 'DAY'
  AND EXTRACT(HOUR FROM src."startsAt" AT TIME ZONE 'UTC') = 0
  AND target."productSlug" = src."productSlug"
  AND target."source" = src."source"
  AND target."metric" = src."metric"
  AND target."bucket" = src."bucket"
  AND target."startsAt" = src."startsAt" + INTERVAL '3 hours'
  AND target."id" != src."id";

-- Step 2: delete the now-merged midnight-UTC rows
DELETE FROM "MetricSample" src
USING "MetricSample" target
WHERE src."bucket" = 'DAY'
  AND EXTRACT(HOUR FROM src."startsAt" AT TIME ZONE 'UTC') = 0
  AND target."productSlug" = src."productSlug"
  AND target."source" = src."source"
  AND target."metric" = src."metric"
  AND target."bucket" = src."bucket"
  AND target."startsAt" = src."startsAt" + INTERVAL '3 hours'
  AND target."id" != src."id";

-- Step 3: shift remaining midnight-UTC rows (no conflict)
UPDATE "MetricSample"
SET "startsAt" = "startsAt" + INTERVAL '3 hours'
WHERE "bucket" = 'DAY'
  AND EXTRACT(HOUR FROM "startsAt" AT TIME ZONE 'UTC') = 0;
