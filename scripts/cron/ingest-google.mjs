#!/usr/bin/env node
/**
 * scripts/cron/ingest-google.mjs
 *
 * Chamado por Coolify Scheduled Task. Faz ingest de gastos do Google Ads
 * via /api/admin/metrics?action=ingest-google-ads.
 *
 * Uso no Coolify:
 *   Command: node scripts/cron/ingest-google.mjs
 *   Frequency: a cada 30 min
 *
 * Env vars necessarias no container:
 *   IRIS_WEBHOOK_SECRET
 *   IRIS_BASE_URL (default: https://iris.technowhub.ai)
 *   IRIS_INGEST_DAYS (default: 2)
 */
const BASE = process.env.IRIS_BASE_URL || "https://iris.technowhub.ai";
const SECRET = process.env.IRIS_WEBHOOK_SECRET;
const DAYS = process.env.IRIS_INGEST_DAYS || "2";
if (!SECRET) {
  console.error("ERR: IRIS_WEBHOOK_SECRET nao definida");
  process.exit(1);
}

const url = `${BASE}/api/admin/metrics?action=ingest-google-ads&product=claude-pro&days=${DAYS}`;
console.log(`POST ${url}`);

let r;
let text;
try {
  r = await fetch(url, {
    method: "POST",
    headers: { "X-Admin-Secret": SECRET },
  });
  text = await r.text();
} catch (err) {
  console.error("ERR fetch:", err.message);
  process.exit(1);
}

console.log(`HTTP ${r.status}`);
console.log(text.slice(0, 4000));

if (!r.ok) {
  console.error(`\nFAIL: HTTP ${r.status}`);
  process.exit(1);
}

let body;
try {
  body = JSON.parse(text);
} catch {
  console.error("\nFAIL: resposta nao e JSON valido");
  process.exit(1);
}

if (body.error) {
  console.error(`\nFAIL: ${body.error} - ${body.message ?? "sem mensagem"}`);
  process.exit(1);
}

const result = body.result;
if (result) {
  console.log(`\nOK: ${result.daysFetched} dias buscados, ${result.samplesUpserted} samples upserted`);
  if (result.details && result.details.length) {
    console.log("Por dia:");
    for (const d of result.details) {
      console.log(`  ${d.date}: spend=R$${d.spend.toFixed(2)} clicks=${d.clicks} impr=${d.impressions}`);
    }
  } else {
    console.log("(zero dias com dado — verificar googleCampaignFilter em lib/products.ts)");
  }
}

process.exit(0);
