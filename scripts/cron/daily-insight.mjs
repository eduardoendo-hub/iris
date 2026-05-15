#!/usr/bin/env node
/**
 * scripts/cron/daily-insight.mjs
 *
 * Chamado por Coolify Scheduled Task. Dispara o agente de analise
 * estrategica diaria via /api/admin/insight.
 *
 * Uso no Coolify:
 *   Command: node scripts/cron/daily-insight.mjs
 *   Frequency: 0 8 * * *   (08h UTC = 05h SP)
 *
 * Env vars necessarias no container:
 *   IRIS_WEBHOOK_SECRET
 *   IRIS_BASE_URL (default: https://iris.technowhub.ai)
 */
const BASE = process.env.IRIS_BASE_URL || "https://iris.technowhub.ai";
const SECRET = process.env.IRIS_WEBHOOK_SECRET;
if (!SECRET) {
  console.error("ERR: IRIS_WEBHOOK_SECRET nao definida");
  process.exit(1);
}

const url = `${BASE}/api/admin/insight?action=generate&product=claude-pro`;
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
