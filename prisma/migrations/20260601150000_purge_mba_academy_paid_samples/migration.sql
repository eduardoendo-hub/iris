-- Remove samples de midia paga (Meta/Google) gravados por engano no
-- mba-academy. Esse produto eh organico (sem metaCampaignFilter/
-- googleCampaignFilter), mas a ingestao caia em level=account e somava a
-- conta INTEIRA (multi-produto) atribuindo o total ao mba-academy.
--
-- A causa raiz foi corrigida em lib/ingest/{meta,google}-ads.ts (pula
-- produtos sem filtro de midia paga). Esta migracao limpa o lixo ja gravado.
-- Idempotente: re-rodar nao apaga mais nada.

DELETE FROM "MetricSample"
WHERE "productSlug" = 'mba-academy'
  AND "source" IN ('META_ADS', 'GOOGLE_ADS');
