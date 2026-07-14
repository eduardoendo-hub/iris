/**
 * /api/admin/recovery-run — dispara a cadência de recuperação de checkout.
 *
 * Delegado 1:1 pro handler de /api/cron/abandoned-checkout (que já aceita
 * X-Admin-Secret além de X-Cron-Secret). Existe porque o middleware
 * (proxy.ts) barra /api/cron/* sem CRON_SECRET, e o padrão dos Scheduled
 * Tasks do Coolify neste projeto é chamar /api/admin/* com X-Admin-Secret
 * (ver scripts/cron/*.mjs).
 *
 * GET ?send=0 → força dry-run (preview sem enviar).
 */
import { NextRequest } from "next/server";
import { GET as runRecovery } from "@/app/api/cron/abandoned-checkout/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  return runRecovery(req);
}
