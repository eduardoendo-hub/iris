#!/usr/bin/env node
/**
 * scripts/cron/replay-engaged.mjs
 *
 * Chamado por Coolify Scheduled Task. Reprocessa webhooks Engaged que ficaram
 * em outcome=validation_failed ou tracked (que sao processos parciais antes
 * de fix no parser). Faz loop em varios outcomes pra cobrir todos os casos.
 *
 * Uso no Coolify:
 *   Command: node scripts/cron/replay-engaged.mjs
 *   Frequency: a cada 15 min
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

const OUTCOMES = ["validation_failed", "tracked"];
let exitCode = 0;

for (const outcome of OUTCOMES) {
  const url = `${BASE}/api/admin/replay-webhooks?source=engaged&outcome=${outcome}&confirm=yes`;
  console.log(`\nPOST ${url}`);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "X-Admin-Secret": SECRET },
    });
    const text = await r.text();
    console.log(`HTTP ${r.status}`);
    console.log(text.slice(0, 2000));
    if (!r.ok) exitCode = 1;
  } catch (err) {
    console.error("ERR:", err.message);
    exitCode = 1;
  }
}

process.exit(exitCode);
