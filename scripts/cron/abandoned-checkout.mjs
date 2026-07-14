#!/usr/bin/env node
/**
 * scripts/cron/abandoned-checkout.mjs
 *
 * Chamado por Coolify Scheduled Task. Roda a cadência de recuperação de
 * checkout abandonado (WhatsApp via ChatPro) em /api/admin/recovery-run.
 *
 * Uso no Coolify:
 *   Command: node scripts/cron/abandoned-checkout.mjs
 *   Frequency: a cada 15 min  (*\/15 * * * *)
 *
 * Env vars necessarias no container:
 *   IRIS_WEBHOOK_SECRET
 *   IRIS_BASE_URL (default: https://iris.technowhub.ai)
 *
 * O envio REAL depende de RECOVERY_SEND=1 no app (senao roda em dry-run e
 * apenas loga o preview — seguro deixar agendado antes de armar).
 */
const BASE = process.env.IRIS_BASE_URL || "https://iris.technowhub.ai";
const SECRET = process.env.IRIS_WEBHOOK_SECRET;
if (!SECRET) {
  console.error("ERR: IRIS_WEBHOOK_SECRET nao definida");
  process.exit(1);
}

const url = `${BASE}/api/admin/recovery-run`;
console.log(`GET ${url}`);

let r;
try {
  r = await fetch(url, {
    headers: { "X-Admin-Secret": SECRET },
    signal: AbortSignal.timeout(110_000),
  });
} catch (err) {
  console.error("ERR fetch:", err.message);
  process.exit(1);
}
const text = await r.text();
console.log(`HTTP ${r.status}`);
console.log(text.slice(0, 2000));
if (!r.ok) process.exit(1);
