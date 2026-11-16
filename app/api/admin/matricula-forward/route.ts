/**
 * /api/admin/matricula-forward — reenvia ao portal de documentos da matrícula
 * os avisos de pagamento da Taxa de Matrícula do MBA que o IRIS já tem
 * guardados no WebhookLog. Serve para carregar no portal quem pagou antes de
 * o repasse automático existir, ou depois de uma indisponibilidade do portal.
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * Query:
 *   ?since=ISO_DATE   (default: 60 dias atrás)
 *   ?dry_run=true     (preview: só conta, não envia)
 *   ?confirm=yes      (obrigatório para enviar)
 *
 * O portal é idempotente (guarda a compra pelo CPF e pelo e-mail). A resposta
 * traz só contagens, sem dados pessoais. Logs com rawBody cortado em 10 KB
 * não são JSON válido e ficam de fora (contados em "truncated").
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  forwardToMatriculaPortal,
  isMbaMatriculaPayload,
  matriculaPortalConfigured,
} from "@/lib/matricula-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-admin-secret") || "") === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "true";
  const confirm = url.searchParams.get("confirm") === "yes";
  if (!dryRun && !confirm) {
    return NextResponse.json(
      { error: "confirmation_required", message: "Use ?confirm=yes pra enviar, ou ?dry_run=true pra preview." },
      { status: 400 }
    );
  }
  if (!dryRun && !matriculaPortalConfigured()) {
    return NextResponse.json({ error: "portal_not_configured" }, { status: 400 });
  }
  const sinceRaw = url.searchParams.get("since");
  const sinceParsed = sinceRaw ? new Date(sinceRaw) : null;
  const since =
    sinceParsed && !isNaN(sinceParsed.getTime())
      ? sinceParsed
      : new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const logs = await prisma.webhookLog.findMany({
    where: {
      source: "engaged",
      receivedAt: { gte: since },
      rawBody: { contains: "purchase.paid" },
    },
    orderBy: { receivedAt: "asc" },
    select: { rawBody: true },
    take: 2000,
  });

  let matched = 0;
  let truncated = 0;
  let sent = 0;
  let failed = 0;
  const seen = new Set<string>();
  for (const log of logs) {
    let json: unknown;
    try {
      json = JSON.parse(log.rawBody);
    } catch {
      if (/matr[ií]cula\s+mba/i.test(log.rawBody)) truncated++;
      continue;
    }
    if (!isMbaMatriculaPayload(json)) continue;
    const id = String((json as { _id?: unknown })._id ?? "");
    if (id && seen.has(id)) continue; // mesmo evento recebido mais de uma vez
    if (id) seen.add(id);
    matched++;
    if (dryRun) continue;
    const r = await forwardToMatriculaPortal(log.rawBody);
    if (r.ok) sent++;
    else failed++;
  }

  return NextResponse.json({
    since: since.toISOString(),
    dryRun,
    scanned: logs.length,
    matched,
    truncated,
    sent,
    failed,
  });
}
