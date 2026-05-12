/**
 * /api/debug/webhooks — lista os webhooks recebidos pelo IRIS pra debug.
 *
 * Útil quando integracao Engaged/RD/outros parece nao estar funcionando:
 *   - Confirma se webhook chegou
 *   - Mostra headers (mascarando secrets)
 *   - Mostra body raw e resposta enviada
 *   - Mostra outcome (created/updated/ignored/auth_failed/error)
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * Query params:
 *   ?source=engaged       — filtra por fonte
 *   ?outcome=ignored      — filtra por outcome
 *   ?limit=50             — quantos retornar (default 50, max 200)
 *   ?since=ISO_DATE       — só após essa data
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-admin-secret") || "") === secret;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const source = url.searchParams.get("source");
  const outcome = url.searchParams.get("outcome");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
  const sinceRaw = url.searchParams.get("since");
  const since = sinceRaw ? new Date(sinceRaw) : null;

  try {
    const logs = await prisma.webhookLog.findMany({
      where: {
        ...(source ? { source } : {}),
        ...(outcome ? { outcome } : {}),
        ...(since && !isNaN(since.getTime()) ? { receivedAt: { gte: since } } : {}),
      },
      orderBy: { receivedAt: "desc" },
      take: limit,
    });

    // Sumario por outcome pra dashboard rapido
    const summary = await prisma.webhookLog.groupBy({
      by: ["source", "outcome"],
      where: {
        ...(source ? { source } : {}),
        ...(since && !isNaN(since.getTime()) ? { receivedAt: { gte: since } } : {}),
      },
      _count: { _all: true },
    });

    return NextResponse.json({
      summary: summary.map((s) => ({
        source: s.source,
        outcome: s.outcome,
        count: s._count._all,
      })),
      logs: logs.map((l) => ({
        id: l.id,
        source: l.source,
        receivedAt: l.receivedAt,
        statusCode: l.statusCode,
        outcome: l.outcome,
        reason: l.reason,
        externalId: l.externalId,
        saleId: l.saleId,
        headers: l.headers,
        rawBody: typeof l.rawBody === "string" ? l.rawBody.slice(0, 2000) : l.rawBody,
        resultJson: l.resultJson,
      })),
      total: logs.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "db_error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
