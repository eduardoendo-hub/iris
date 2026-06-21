/**
 * /api/admin/gestor-trafego/run — roda o ciclo do Gestor de Tráfego on-demand
 * (botão "Atualizar análise" na tela ADM). Auth: sessão ADMIN ou X-Admin-Secret.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { runGestorTrafego } from "@/lib/agent/run-gestor-trafego";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const days = Number(url.searchParams.get("days") || "7") || 7;
  try {
    const result = await runGestorTrafego({ days, dryRun });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
