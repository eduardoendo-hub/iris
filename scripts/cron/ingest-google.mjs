#!/usr/bin/env node
/**
 * scripts/cron/ingest-google.mjs
 *
 * Chamado por Coolify Scheduled Task. Faz ingest de gastos do Google Ads
 * via /api/admin/metrics?action=ingest-google-ads.
 *
 * Uso no Coolify:
 *   Command: node scripts/cron/ingest-google.mjs
 *   Frequency: */30 * * * *   (a cada 30 min)
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

const url = `${BASE}/api/admin/metrics?action=ingest-google-ads&days=${DAYS}`;
console.log(`POST ${url}`);
try {
  const r = await fetch(url, {
    method: "POST",
    headers: { "X-Admin-Secret": SECRET },
  });
  const text = await r.text();
  console.log(`HTTP ${r.status}`);
  console.log(text.slice(0, 2000));
  if (!r.ok) process.exit(1);
} catch (err) {
  console.error("ERR:", err.message);
  process.exit(1);
}
