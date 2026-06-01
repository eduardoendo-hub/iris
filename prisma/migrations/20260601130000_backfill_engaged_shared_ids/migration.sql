-- Backfill engagedCheckoutSharedIds nas campanhas ATIVAS a partir do mapa
-- estatico de lib/products.ts. Cada produto tinha o sharedId do checkout
-- Engaged hardcoded no produto; com a arquitetura por-turma ele passa a viver
-- na campanha (muda a cada turma). Aqui semeamos a turma ATUAL (ACTIVE) de
-- cada produto pra que o webhook do Engaged continue resolvendo sharedId ->
-- campanha sem interrupcao.
--
-- So toca linhas onde o array ainda esta vazio (idempotente; nao sobrescreve
-- valores ja cadastrados manualmente via /admin).

UPDATE "Campaign"
SET "engagedCheckoutSharedIds" = ARRAY['x68jpj7w3k']::TEXT[]
WHERE "productSlug" = 'claude-pro'
  AND "status" = 'ACTIVE'
  AND cardinality("engagedCheckoutSharedIds") = 0;

UPDATE "Campaign"
SET "engagedCheckoutSharedIds" = ARRAY['ligvw5t7yi']::TEXT[]
WHERE "productSlug" = 'peopleai'
  AND "status" = 'ACTIVE'
  AND cardinality("engagedCheckoutSharedIds") = 0;

UPDATE "Campaign"
SET "engagedCheckoutSharedIds" = ARRAY['wpjw515nvn']::TEXT[]
WHERE "productSlug" = 'codigozero'
  AND "status" = 'ACTIVE'
  AND cardinality("engagedCheckoutSharedIds") = 0;

UPDATE "Campaign"
SET "engagedCheckoutSharedIds" = ARRAY['4jtt6rr7ti']::TEXT[]
WHERE "productSlug" = 'advia'
  AND "status" = 'ACTIVE'
  AND cardinality("engagedCheckoutSharedIds") = 0;
