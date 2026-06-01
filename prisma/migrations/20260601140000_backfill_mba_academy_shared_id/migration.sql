-- Backfill engagedCheckoutSharedIds na campanha do MBA Academy AI Master
-- (Experience Labs). A LP em mbaacademy.technowhub.ai usa o checkout Engaged
--   https://impacta.site.engaged.com.br/p/checkout/w4uz6kh4cj
-- O webhook do Engaged resolve sharedId -> campanha via
-- engagedCheckoutSharedIds; sem o sharedId na linha da campanha, as compras
-- nao recebem campaignSlug e caem fora do cockpit.
--
-- So toca a linha onde o array ainda esta vazio (idempotente; nao sobrescreve
-- valor ja cadastrado manualmente via /admin).

UPDATE "Campaign"
SET "engagedCheckoutSharedIds" = ARRAY['w4uz6kh4cj']::TEXT[]
WHERE "slug" = 'mba-academy-ai-master'
  AND cardinality("engagedCheckoutSharedIds") = 0;
