#!/usr/bin/env node
/**
 * scripts/cron/daily-insight.mjs
 *
 * Chamado por Coolify Scheduled Task. Dispara o agente de analise
 * estrategica diaria via /api/admin/insight.
 *
 * Uso no Coolify:
 *   Command: node scripts/cron/daily-insight.mjs
 *   Frequency: 0 8 * * *  (08h UTC = 05h SP)
 *
 * Env vars necessarias no container:
 *   IRIS_WEBHOOK_SECRET
 *   IRIS_BASE_URL (default: https://iris.technowhub.ai)
 *
 * Exit codes:
 *   0 = insight gerado/atualizado com sucesso
 *   1 = HTTP nao-2xx OU outcome=error/skipped no body
 */
const BASE = process.env.IRIS_BASE_URL || "https://iris.technowhub.ai";
const SECRET = process.env.IRIS_WEBHOOK_SECRET;
if (!SECRET) {
  console.error("ERR: IRIS_WEBHOOK_SECRET nao definida");
  process.exit(1);
}

const url = `${BASE}/api/admin/insight?action=generate&product=claude-pro`;
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
  console.error(`FAIL: HTTP ${r.status}`);
  process.exit(1);
}

// Parsear o body pra checar outcome — endpoint pode retornar 200 com
// outcome=error (ex: anthropic_api_error, empty_recommendations).
let body;
try {
  body = JSON.parse(text);
} catch {
  console.error("FAIL: resposta nao e JSON valido");
  process.exit(1);
}

const outcome = body.outcome;
const reason = body.reason;
console.log(`\noutcome=${outcome}`);
if (reason) console.log(`reason=${reason}`);
if (body.insightId) console.log(`insightId=${body.insightId}`);
if (body.tokensIn !== undefined) {
  console.log(`tokens: in=${body.tokensIn} out=${body.tokensOut} cached=${body.cachedTokensRead ?? 0}`);
}

if (outcome === "created" || outcome === "updated") {
  console.log("\nOK: insight salvo no DB");
  process.exit(0);
}

console.error(`\nFAIL: outcome=${outcome} (esperava created ou updated)`);
process.exit(1);
