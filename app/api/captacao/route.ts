/**
 * /api/captacao — agregacao de VisitEvent por canal (UTM source/medium/campaign).
 *
 * Usado pelo cockpit pra renderizar a tabela "Detalhamento de captacao por canal":
 * quantas visitas (lp_view) e cliques no compra (click_compra) vieram de cada
 * combinacao (utm_source, utm_medium, utm_campaign) num periodo.
 *
 * Sem auth — cockpit lado-servidor chama internamente (mesmo container).
 * Se virar publico, adicionar rate-limit ou auth.
 *
 * Query:
 *   ?product=claude-pro    (default)
 *   ?days=7                (default 7, max 90)
 *   ?event=lp_view         (filtra um evento especifico — opcional)
 *
 * Resposta:
 *   { period: {from, to, days}, rows: [{utmSource, utmMedium, utmCampaign,
 *     visits, clickCompra, clickConsultor, clickWhats, leadForm}, ...] }
 *
 * Ordenacao: visits desc.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const product = url.searchParams.get("product") || "claude-pro";
  const daysRaw = parseInt(url.searchParams.get("days") || "7", 10);
  const days = Math.max(1, Math.min(daysRaw, 90));
  const from = new Date();
  from.setUTCHours(0, 0, 0, 0);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  const to = new Date();

  try {
    // Group by (utmSource, utmMedium, utmCampaign, eventName) — depois pivota.
    const rows = await prisma.visitEvent.groupBy({
      by: ["utmSource", "utmMedium", "utmCampaign", "eventName"],
      where: {
        productSlug: product,
        ts: { gte: from, lte: to },
      },
      _count: { _all: true },
    });

    // Pivota: cada (source, medium, campaign) vira uma linha com contadores
    // por evento. Uso de string-key porque nulls precisam ser distinguiveis
    // de string vazia.
    type Counts = {
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      visits: number;
      clickCompra: number;
      clickConsultor: number;
      clickWhats: number;
      leadForm: number;
    };
    const pivot = new Map<string, Counts>();
    const key = (s: string | null, m: string | null, c: string | null) =>
      `${s ?? ""}|${m ?? ""}|${c ?? ""}`;
    for (const r of rows) {
      const k = key(r.utmSource, r.utmMedium, r.utmCampaign);
      let cur = pivot.get(k);
      if (!cur) {
        cur = {
          utmSource: r.utmSource,
          utmMedium: r.utmMedium,
          utmCampaign: r.utmCampaign,
          visits: 0,
          clickCompra: 0,
          clickConsultor: 0,
          clickWhats: 0,
          leadForm: 0,
        };
        pivot.set(k, cur);
      }
      const n = r._count._all;
      switch (r.eventName) {
        case "lp_view":
          cur.visits += n;
          break;
        case "click_compra":
          cur.clickCompra += n;
          break;
        case "click_consultor":
          cur.clickConsultor += n;
          break;
        case "click_whats":
          cur.clickWhats += n;
          break;
        case "lead_form":
          cur.leadForm += n;
          break;
      }
    }
    const result = Array.from(pivot.values()).sort((a, b) => b.visits - a.visits);

    return NextResponse.json({
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
        days,
      },
      product,
      total: result.length,
      rows: result,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "db_error", message: msg }, { status: 500 });
  }
}
