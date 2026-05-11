/**
 * /api/admin/reset — apaga dados operacionais (Lead, Sale, MetricSample,
 * Snapshot) pra zerar o cockpit antes do go-live da campanha.
 *
 * NAO apaga: User, Account, Session, Product, Insight, PushSubscription,
 * VerificationToken — tabelas de config/auth ficam intactas.
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET (mesma chave do migrate).
 *
 * Operacao:
 *   GET  → preview (mostra quantos registros tem em cada tabela, nao apaga nada)
 *   POST → apaga (precisa header X-Confirm-Reset: yes pra prevenir uso acidental)
 *
 * Usage:
 *   # 1. preview
 *   curl -H "X-Admin-Secret: ..." https://iris.../api/admin/reset
 *
 *   # 2. apagar
 *   curl -X POST \
 *     -H "X-Admin-Secret: ..." \
 *     -H "X-Confirm-Reset: yes" \
 *     https://iris.../api/admin/reset
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

async function countAll() {
  const [leads, sales, metrics, snapshots] = await Promise.all([
    prisma.lead.count(),
    prisma.sale.count(),
    prisma.metricSample.count().catch(() => 0),
    prisma.snapshot.count().catch(() => 0),
  ]);
  return { leads, sales, metrics, snapshots };
}

// Preview — nao apaga, so mostra estado atual
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const counts = await countAll();
    return NextResponse.json({
      status: "preview",
      message: "POST com X-Confirm-Reset: yes pra apagar tudo abaixo",
      counts,
      tables_to_truncate: ["Lead", "Sale", "MetricSample", "Snapshot"],
      tables_kept: ["User", "Account", "Session", "Product", "Insight", "PushSubscription", "VerificationToken"],
    });
  } catch (err) {
    return NextResponse.json(
      { error: "db_error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// Apaga — requer X-Confirm-Reset: yes
export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const confirm = req.headers.get("x-confirm-reset");
  if (confirm !== "yes") {
    return NextResponse.json(
      {
        error: "confirmation_required",
        message:
          "Adicione header 'X-Confirm-Reset: yes' pra confirmar. Operacao destrutiva.",
      },
      { status: 400 }
    );
  }

  try {
    const before = await countAll();

    // Apaga em ordem (sem FKs entre essas, mas mantemos ordem logica)
    const [delSnapshots, delMetrics, delSales, delLeads] = await Promise.all([
      prisma.snapshot.deleteMany({}).catch(() => ({ count: 0 })),
      prisma.metricSample.deleteMany({}).catch(() => ({ count: 0 })),
      prisma.sale.deleteMany({}),
      prisma.lead.deleteMany({}),
    ]);

    const after = await countAll();

    return NextResponse.json({
      status: "ok",
      deleted: {
        leads: delLeads.count,
        sales: delSales.count,
        metrics: delMetrics.count,
        snapshots: delSnapshots.count,
      },
      counts_before: before,
      counts_after: after,
      message:
        "Cockpit zerado. Pronto pra dados reais da campanha. Refresh https://iris.technowhub.ai/ pra confirmar visualmente.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "db_error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
