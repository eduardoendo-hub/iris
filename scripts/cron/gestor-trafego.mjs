#!/usr/bin/env node
/**
 * scripts/cron/gestor-trafego.mjs
 *
 * Chamado por Coolify Scheduled Task. Roda o ciclo do Gestor de Tráfego
 * (ingestão por campanha 31d → coleta da carteira → análise Claude →
 * grava AgentRecommendation) via /api/admin/gestor-trafego/run.
 *
 * Uso no Coolify (Scheduled Task no recurso do IRIS):
 *   Command:   node scripts/cron/gestor-trafego.mjs
 *   Frequency: 0 9 * * *   (09h UTC = 06h SP — depois das ingestões de Meta/Google)
 *
 * Env vars necessárias no container:
 *   IRIS_WEBHOOK_SECRET  (= X-Admin-Secret)
 *   IRIS_BASE_URL        (default: https://iris.technowhub.ai)
 *
 * Exit codes: 0 = ok · 1 = HTTP não-2xx ou erro.
 */
const BASE = process.env.IRIS_BASE_URL || "https://iris.technowhub.ai";
const SECRET = process.env.IRIS_WEBHOOK_SECRET;
if (!SECRET) {
  console.error("ERR: IRIS_WEBHOOK_SECRET nao definida");
  process.exit(1);
}

const url = `${BASE}/api/admin/gestor-trafego/run`;
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
console.log(text.slice(0, 2000));

let ok = r.ok;
try {
  const body = JSON.parse(text);
  if (body.ok === false || body.recs?.outcome === "error") ok = false;
} catch {
  /* corpo não-JSON: confia no status HTTP */
}
process.exit(ok ? 0 : 1);
