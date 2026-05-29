/**
 * /api/admin/purge-product — limpeza TOTAL de um produto, TRAVADA num
 * productSlug. Pensado pra zerar a base de teste de uma LP antes do go-live
 * (visitas, contadores, leads, compras) sem afetar nenhum outro produto.
 *
 * Apaga TUDO de um productSlug em: MetricSample, VisitEvent, Lead,
 * EngagedPurchase, Sale. NÃO toca em RD CRM (sistema externo) nem em outros
 * produtos. Diferente do /api/admin/reset (que é global e não escopa produto).
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * Params (query):
 *   ?product=advia                 (OBRIGATÓRIO — escopo travado)
 *
 * Uso:
 *   # 1. preview (dry-run, não apaga) — conta o que casa
 *   curl -H "X-Admin-Secret: ..." \
 *     "https://iris.../api/admin/purge-product?product=advia"
 *
 *   # 2. apagar (requer header de confirmação)
 *   curl -X POST -H "X-Admin-Secret: ..." -H "X-Confirm-Purge: yes" \
 *     "https://iris.../api/admin/purge-product?product=advia"
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

function parseProduct(req: NextRequest): string | { error: string } {
  const product = (new URL(req.url).searchParams.get("product") || "").trim();
  if (!product) return { error: "param 'product' obrigatório (escopo travado)" };
  return product;
}

async function countFor(product: string) {
  const where = { productSlug: product };
  const [metricSamples, visitEvents, leads, engagedPurchases, sales] = await Promise.all([
    prisma.metricSample.count({ where }),
    prisma.visitEvent.count({ where }),
    prisma.lead.count({ where }),
    prisma.engagedPurchase.count({ where }),
    prisma.sale.count({ where }),
  ]);
  return { metricSamples, visitEvents, leads, engagedPurchases, sales };
}

// Preview — não apaga
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const product = parseProduct(req);
  if (typeof product !== "string") return NextResponse.json({ error: product.error }, { status: 400 });

  try {
    const counts = await countFor(product);
    return NextResponse.json({
      status: "preview",
      product,
      will_delete: counts,
      to_confirm: "POST com X-Confirm-Purge: yes",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "db_error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// Apaga — requer X-Confirm-Purge: yes
export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (req.headers.get("x-confirm-purge") !== "yes") {
    return NextResponse.json(
      { error: "confirmation_required", message: "Adicione header 'X-Confirm-Purge: yes'. Operação destrutiva." },
      { status: 400 }
    );
  }
  const product = parseProduct(req);
  if (typeof product !== "string") return NextResponse.json({ error: product.error }, { status: 400 });

  try {
    const before = await countFor(product);
    const where = { productSlug: product };
    const [delMetrics, delVisits, delLeads, delPurchases, delSales] = await Promise.all([
      prisma.metricSample.deleteMany({ where }),
      prisma.visitEvent.deleteMany({ where }),
      prisma.lead.deleteMany({ where }),
      prisma.engagedPurchase.deleteMany({ where }),
      prisma.sale.deleteMany({ where }),
    ]);
    return NextResponse.json({
      status: "ok",
      product,
      before,
      deleted: {
        metricSamples: delMetrics.count,
        visitEvents: delVisits.count,
        leads: delLeads.count,
        engagedPurchases: delPurchases.count,
        sales: delSales.count,
      },
      message: "Purge aplicado. Refresh https://iris.technowhub.ai/ pra ver.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "db_error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
