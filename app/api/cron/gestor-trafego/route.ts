/**
 * /api/cron/gestor-trafego — ciclo diário do Gestor de Tráfego.
 * Chamado pelo cron Coolify (ex: 06:00 SP, após as ingestões existentes).
 * Auth: header X-Cron-Secret = process.env.CRON_SECRET
 * Query: ?dry_run=true (não chama LLM) · ?days=N (janela, default 7)
 */
import { NextRequest, NextResponse } from "next/server";
import { runGestorTrafego } from "@/lib/agent/run-gestor-trafego";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-cron-secret") || "") === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const days = Number(url.searchParams.get("days") || "31") || 31;
  try {
    const result = await runGestorTrafego({ days, dryRun });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
