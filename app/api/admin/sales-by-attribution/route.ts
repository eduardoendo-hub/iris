/**
 * /api/admin/sales-by-attribution — performance de vendas por canal/campanha.
 *
 * Agrega Sale.attribution e devolve breakdown:
 *   - por canal (utm_source + utm_medium)
 *   - por campanha (utm_campaign)
 *   - por anuncio (utm_content)
 *   - por origem (source: ENGAGED, DIRETA, CONSULTOR)
 *
 * Inclui: contagem de vendas + receita total + ticket medio + lista de vendas
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * Query:
 *   ?product=claude-pro  (default)
 *   ?days=30             (default 30, max 365)
 *   ?from=YYYY-MM-DD     (alternativa a days)
 *   ?to=YYYY-MM-DD       (alternativa a days)
 *   ?groupBy=channel|campaign|content|all  (default "all" — devolve os 3)
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

type Bucket = {
  key: string;
  label: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
  utmContent?: string | null;
  salesCount: number;
  revenue: number;
  avgTicket: number;
  sources: Record<string, number>; // ENGAGED, DIRETA, etc
};

function bucketKey(parts: Array<string | null | undefined>): string {
  return parts.map((p) => p ?? "—").join(" / ");
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const product = url.searchParams.get("product") || "claude-pro";
  const fromRaw = url.searchParams.get("from");
  const toRaw = url.searchParams.get("to");
  const daysRaw = parseInt(url.searchParams.get("days") || "30", 10);
  const days = Math.max(1, Math.min(daysRaw, 365));
  const groupBy = url.searchParams.get("groupBy") || "all";

  let from: Date;
  let to: Date;
  if (fromRaw && toRaw) {
    from = new Date(fromRaw + "T03:00:00.000Z");
    to = new Date(toRaw + "T03:00:00.000Z");
    to.setUTCDate(to.getUTCDate() + 1); // inclusivo
  } else {
    to = new Date();
    from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  }

  const sales = await prisma.sale.findMany({
    where: {
      productSlug: product,
      saleDate: { gte: from, lte: to },
    },
    select: {
      id: true,
      source: true,
      customerName: true,
      amount: true,
      saleDate: true,
      attribution: true,
    },
    orderBy: { saleDate: "desc" },
  });

  // Sumario geral
  const totalCount = sales.length;
  const totalRevenue = sales.reduce((acc, s) => acc + Number(s.amount), 0);
  const totalAvgTicket = totalCount > 0 ? totalRevenue / totalCount : 0;

  // Quantas tem atribuicao vs sem
  const withAttribution = sales.filter((s) => s.attribution && typeof s.attribution === "object").length;
  const withoutAttribution = totalCount - withAttribution;

  // Helper pra extrair UTMs da attribution Json
  function utm(attr: unknown, key: string): string | null {
    if (!attr || typeof attr !== "object" || Array.isArray(attr)) return null;
    const v = (attr as Record<string, unknown>)[key];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  }

  function buildBuckets(keyFn: (s: (typeof sales)[number]) => Bucket | null): Bucket[] {
    const map = new Map<string, Bucket>();
    for (const s of sales) {
      const b = keyFn(s);
      if (!b) continue;
      let cur = map.get(b.key);
      if (!cur) {
        cur = { ...b, salesCount: 0, revenue: 0, avgTicket: 0, sources: {} };
        map.set(b.key, cur);
      }
      cur.salesCount += 1;
      cur.revenue += Number(s.amount);
      cur.sources[s.source] = (cur.sources[s.source] ?? 0) + 1;
    }
    for (const b of map.values()) {
      b.avgTicket = b.salesCount > 0 ? b.revenue / b.salesCount : 0;
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }

  // Por canal (utm_source / utm_medium)
  const byChannel = buildBuckets((s) => {
    const src = utm(s.attribution, "utm_source");
    const med = utm(s.attribution, "utm_medium");
    if (!src && !med) return { key: "(sem atribuicao)", label: "Sem atribuição", utmSource: null, utmMedium: null, salesCount: 0, revenue: 0, avgTicket: 0, sources: {} };
    return { key: bucketKey([src, med]), label: bucketKey([src, med]), utmSource: src, utmMedium: med, salesCount: 0, revenue: 0, avgTicket: 0, sources: {} };
  });

  // Por campanha (utm_campaign)
  const byCampaign = buildBuckets((s) => {
    const camp = utm(s.attribution, "utm_campaign");
    if (!camp) return { key: "(sem campanha)", label: "Sem campanha", utmCampaign: null, salesCount: 0, revenue: 0, avgTicket: 0, sources: {} };
    return { key: camp, label: camp, utmCampaign: camp, salesCount: 0, revenue: 0, avgTicket: 0, sources: {} };
  });

  // Por anuncio (utm_content) — granularidade maxima
  const byContent = buildBuckets((s) => {
    const cnt = utm(s.attribution, "utm_content");
    const camp = utm(s.attribution, "utm_campaign");
    if (!cnt) return null;
    return { key: bucketKey([camp, cnt]), label: bucketKey([camp, cnt]), utmCampaign: camp, utmContent: cnt, salesCount: 0, revenue: 0, avgTicket: 0, sources: {} };
  });

  // Por origem (ENGAGED, DIRETA, CONSULTOR)
  const bySource = buildBuckets((s) => ({
    key: s.source,
    label: s.source,
    salesCount: 0,
    revenue: 0,
    avgTicket: 0,
    sources: {},
  }));

  const response: Record<string, unknown> = {
    product,
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
      days: Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)),
    },
    summary: {
      totalSales: totalCount,
      totalRevenue,
      avgTicket: totalAvgTicket,
      withAttribution,
      withoutAttribution,
      attributionCoverage: totalCount > 0 ? withAttribution / totalCount : 0,
    },
    bySource,
  };
  if (groupBy === "all" || groupBy === "channel") response.byChannel = byChannel;
  if (groupBy === "all" || groupBy === "campaign") response.byCampaign = byCampaign;
  if (groupBy === "all" || groupBy === "content") response.byContent = byContent;
  if (groupBy === "all") {
    // Lista completa de vendas + attribution pra inspecao detalhada
    response.sales = sales.map((s) => ({
      id: s.id,
      source: s.source,
      customerName: s.customerName,
      amount: Number(s.amount),
      saleDate: s.saleDate,
      attribution: s.attribution,
    }));
  }

  return NextResponse.json(response);
}
