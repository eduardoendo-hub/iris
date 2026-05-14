/**
 * /api/admin/engaged-purchases — lista o estado atual de EngagedPurchase
 * pra debug. Mostra eventAt vs lastUpdatedAt pra detectar se o replay
 * gravou as datas certas.
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * Query:
 *   ?status=DRAFT     (opcional, filtra)
 *   ?limit=50         (default)
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
  const status = url.searchParams.get("status");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);

  const where = status ? { status } : {};
  const rows = await prisma.engagedPurchase.findMany({
    where,
    orderBy: { eventAt: "desc" },
    take: limit,
    select: {
      id: true,
      productSlug: true,
      externalId: true,
      status: true,
      lastEventType: true,
      customerName: true,
      customerEmail: true,
      amount: true,
      eventAt: true,
      firstSeenAt: true,
      lastUpdatedAt: true,
      saleId: true,
    },
  });

  // Sumario por status
  const summary = await prisma.engagedPurchase.groupBy({
    by: ["status"],
    _count: { _all: true },
  });

  return NextResponse.json({
    summary: summary.map((s) => ({ status: s.status, count: s._count._all })),
    total: rows.length,
    rows: rows.map((r) => ({
      ...r,
      amount: r.amount ? Number(r.amount) : null,
      eventAtIso: r.eventAt.toISOString(),
      lastUpdatedAtIso: r.lastUpdatedAt.toISOString(),
      // Diff em segundos entre eventAt e lastUpdatedAt — pra detectar
      // se o evento aconteceu MUITO depois da gravacao (bug do
      // lastUpdatedAt auto-managed)
      eventAtVsSaveSeconds: Math.floor(
        (r.lastUpdatedAt.getTime() - r.eventAt.getTime()) / 1000
      ),
    })),
  });
}
