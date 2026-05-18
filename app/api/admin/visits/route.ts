/**
 * /api/admin/visits — diagnostico de VisitEvent por UTM.
 *
 * Mesma agregacao do /api/captacao, mas com auth por X-Admin-Secret
 * (captacao ficou atras do login proxy). Util pra confirmar se eventos
 * de um canal especifico (ex: utm_source=email) chegaram no banco.
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * GET ?product=claude-pro&days=14[&source=email]
 *   -> rows agrupados por (utmSource, utmMedium, utmCampaign, utmContent)
 *      com contagem por evento. Se ?source= informado, filtra.
 *   -> tambem retorna lastEvents: ultimos 20 VisitEvent crus (debug fino)
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
  const product = url.searchParams.get("product") || "claude-pro";
  const days = Math.max(1, Math.min(parseInt(url.searchParams.get("days") || "14", 10), 90));
  const sourceFilter = url.searchParams.get("source");

  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - (days - 1));

  try {
    const where = {
      productSlug: product,
      ts: { gte: from },
      ...(sourceFilter ? { utmSource: sourceFilter } : {}),
    };

    const grouped = await prisma.visitEvent.groupBy({
      by: ["utmSource", "utmMedium", "utmCampaign", "utmContent", "eventName"],
      where,
      _count: { _all: true },
    });

    type Row = {
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      utmContent: string | null;
      visits: number;
      clickCompra: number;
      clickConsultor: number;
      clickWhats: number;
      leadForm: number;
    };
    const pivot = new Map<string, Row>();
    for (const r of grouped) {
      const k = `${r.utmSource ?? ""}|${r.utmMedium ?? ""}|${r.utmCampaign ?? ""}|${r.utmContent ?? ""}`;
      let cur = pivot.get(k);
      if (!cur) {
        cur = {
          utmSource: r.utmSource,
          utmMedium: r.utmMedium,
          utmCampaign: r.utmCampaign,
          utmContent: r.utmContent,
          visits: 0,
          clickCompra: 0,
          clickConsultor: 0,
          clickWhats: 0,
          leadForm: 0,
        };
        pivot.set(k, cur);
      }
      const n = r._count._all;
      if (r.eventName === "lp_view") cur.visits += n;
      else if (r.eventName === "click_compra") cur.clickCompra += n;
      else if (r.eventName === "click_consultor") cur.clickConsultor += n;
      else if (r.eventName === "click_whats") cur.clickWhats += n;
      else if (r.eventName === "lead_form") cur.leadForm += n;
    }
    const rows = Array.from(pivot.values()).sort((a, b) => b.visits - a.visits);

    // Ultimos 20 eventos crus — pra ver UTMs exatos e timestamps
    const lastEvents = await prisma.visitEvent.findMany({
      where,
      orderBy: { ts: "desc" },
      take: 20,
      select: {
        eventName: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        utmContent: true,
        utmTerm: true,
        pageUrl: true,
        ts: true,
      },
    });

    const totalVisitEvents = await prisma.visitEvent.count({ where });

    return NextResponse.json({
      product,
      period_days: days,
      source_filter: sourceFilter ?? null,
      total_visit_events: totalVisitEvents,
      distinct_channels: rows.length,
      rows,
      lastEvents,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "db_error", message: msg }, { status: 500 });
  }
}
