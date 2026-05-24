/**
 * GET /api/debug/visit-events — lista últimos VisitEvents do produto.
 *
 * Útil pra diagnosticar:
 *   - Se os events estão chegando da LP (POST /api/events)
 *   - Se vêm com UTM preenchido ou anônimos (tráfego direto/orgânico,
 *     ou anúncio cuja URL de destino esqueceu de adicionar ?utm_source=...)
 *
 * Em produção real, rota deve ser protegida por auth. Por ora,
 * publica e mascarável depois.
 *
 * Query:
 *   ?product=codigozero      (default claude-pro)
 *   ?limit=50                (max 200)
 *   ?event=lp_view           (filtra por eventName — opcional)
 *   ?days=7                  (janela em dias — default 7)
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const product = url.searchParams.get("product") || "claude-pro";
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
  const event = url.searchParams.get("event") || null;
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "7", 10), 1), 90);

  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  try {
    const where: { productSlug: string; ts: { gte: Date }; eventName?: string } = {
      productSlug: product,
      ts: { gte: since },
    };
    if (event) where.eventName = event;

    const events = await prisma.visitEvent.findMany({
      where,
      orderBy: { ts: "desc" },
      take: limit,
      select: {
        id: true,
        ts: true,
        eventName: true,
        campaignSlug: true,
        pageUrl: true,
        referrer: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmContent: true,
        utmTerm: true,
        value: true,
        currency: true,
      },
    });

    // Breakdown: quantos têm UTM source vs vazio
    const total = await prisma.visitEvent.count({ where });
    const withUtm = await prisma.visitEvent.count({
      where: { ...where, utmSource: { not: null } },
    });
    const withoutUtm = total - withUtm;

    // Agrupa por utmSource pra ver quem está enviando tráfego
    const bySource = await prisma.visitEvent.groupBy({
      by: ["utmSource", "utmMedium", "utmCampaign"],
      where,
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
    });

    return NextResponse.json({
      product,
      days,
      total,
      withUtm,
      withoutUtm,
      pctAnonymous: total > 0 ? Math.round((withoutUtm / total) * 100) : 0,
      breakdownBySource: bySource.map((g) => ({
        utm_source: g.utmSource,
        utm_medium: g.utmMedium,
        utm_campaign: g.utmCampaign,
        count: g._count._all,
      })),
      events: events.map((e) => ({
        ...e,
        ts: e.ts.toISOString(),
        value: e.value ? String(e.value) : null,
      })),
    });
  } catch (err) {
    return NextResponse.json(
      { error: "db_error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
