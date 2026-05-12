-- Shift bucket DAY de midnight UTC pra midnight SP (= UTC-3).
--
-- Antes: startsAt = "Day X 00:00 UTC". Display formata em SP → "Day X-1 21:00 SP"
--   → eventos do dia X SP aparecem no dia X-1 no grafico da view analitica.
--
-- Agora: startsAt = "Day X 03:00 UTC" = "Day X 00:00 SP". Display em SP → "Day X".
--
-- Esta migracao adiciona +3h em todas as linhas DAY existentes pra alinhar com
-- a nova convencao. So afeta bucket=DAY (HOUR ja eh granular).
--
-- Idempotencia: se rodar 2x, vai shiftar 6h (errado). Pra ser seguro,
-- ANTES de migrar checamos se a hora atual eh 00:00 UTC (criterio do antigo) —
-- se ja for 03:00, deixa.

UPDATE "MetricSample"
SET "startsAt" = "startsAt" + INTERVAL '3 hours'
WHERE "bucket" = 'DAY'
  AND EXTRACT(HOUR FROM "startsAt" AT TIME ZONE 'UTC') = 0;
