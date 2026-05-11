/**
 * /api/admin/reset — apaga dados operacionais (Lead, Sale, MetricSample,
 * Snapshot) pra zerar o cockpit antes do go-live da campanha.
 *
 * NAO apaga: User, Account, Session, Product, Insight, PushSubscription,
 * VerificationToken — tabelas de config/auth ficam intactas.
 *
 * Modos:
 *   ?keep_from=today (DEFAULT) → apaga registros criados ANTES de hoje
 *                                 00:00 BRT (= 03:00 UTC). Mantem dados
 *                                 do dia atual intactos.
 *   ?keep_from=YYYY-MM-DD     → apaga registros criados antes da data
 *                                 informada (00:00 BRT).
 *   ?keep_from=all            → apaga TUDO (wipe total — cuidado!)
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * Usage:
 *   # 1. preview (default: limpa tudo anterior a hoje)
 *   curl -H "X-Admin-Secret: ..." https://iris.../api/admin/reset
 *
 *   # 2. apagar
 *   curl -X POST \
 *     -H "X-Admin-Secret: ..." -H "X-Confirm-Reset: yes" \
 *     https://iris.../api/admin/reset
 *
 *   # 3. wipe total (cuidado!)
 *   curl -X POST \
 *     -H "X-Admin-Secret: ..." -H "X-Confirm-Reset: yes" \
 *     "https://iris.../api/admin/reset?keep_from=all"
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

/**
 * Retorna o instante UTC equivalente a "00:00 BRT" da data informada
 * (ou de hoje, em SP timezone, se nenhuma data).
 * SP eh UTC-3 → 00:00 BRT = 03:00 UTC.
 */
function brtMidnightUTC(dateYmd?: string): Date {
  let y: number, m: number, d: number;
  if (dateYmd && /^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
    [y, m, d] = dateYmd.split("-").map(Number);
  } else {
    const spStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    [y, m, d] = spStr.split("-").map(Number);
  }
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0)); // 03:00 UTC = 00:00 BRT
}

type CutoffMode = { type: "all" } | { type: "before"; cutoff: Date };

function parseCutoff(req: NextRequest): CutoffMode {
  const url = new URL(req.url);
  const raw = (url.searchParams.get("keep_from") || "today").toLowerCase();
  if (raw === "all") return { type: "all" };
  if (raw === "today") return { type: "before", cutoff: brtMidnightUTC() };
  // ISO date YYYY-MM-DD
  return { type: "before", cutoff: brtMidnightUTC(raw) };
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

async function countBeforeCutoff(cutoff: Date) {
  const [leads, sales, metrics, snapshots] = await Promise.all([
    prisma.lead.count({ where: { capturedAt: { lt: cutoff } } }),
    prisma.sale.count({ where: { saleDate: { lt: cutoff } } }),
    prisma.metricSample.count({ where: { createdAt: { lt: cutoff } } }).catch(() => 0),
    prisma.snapshot.count({ where: { createdAt: { lt: cutoff } } }).catch(() => 0),
  ]);
  return { leads, sales, metrics, snapshots };
}

// Preview — nao apaga
export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const mode = parseCutoff(req);
    const total = await countAll();
    const filtered =
      mode.type === "all"
        ? total
        : await countBeforeCutoff(mode.cutoff);

    return NextResponse.json({
      status: "preview",
      mode: mode.type === "all" ? "all (wipe total)" : `before ${mode.cutoff.toISOString()}`,
      cutoff_utc: mode.type === "before" ? mode.cutoff.toISOString() : null,
      cutoff_brt:
        mode.type === "before"
          ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(mode.cutoff)
          : null,
      will_delete: filtered,
      total_in_db: total,
      tables_kept: ["User", "Account", "Session", "Product", "Insight", "PushSubscription", "VerificationToken"],
      to_confirm: "POST com X-Confirm-Reset: yes",
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
  if (req.headers.get("x-confirm-reset") !== "yes") {
    return NextResponse.json(
      {
        error: "confirmation_required",
        message: "Adicione header 'X-Confirm-Reset: yes'. Operacao destrutiva.",
      },
      { status: 400 }
    );
  }

  try {
    const mode = parseCutoff(req);
    const before = await countAll();

    let delLeads = { count: 0 };
    let delSales = { count: 0 };
    let delMetrics = { count: 0 };
    let delSnapshots = { count: 0 };

    if (mode.type === "all") {
      [delSnapshots, delMetrics, delSales, delLeads] = await Promise.all([
        prisma.snapshot.deleteMany({}).catch(() => ({ count: 0 })),
        prisma.metricSample.deleteMany({}).catch(() => ({ count: 0 })),
        prisma.sale.deleteMany({}),
        prisma.lead.deleteMany({}),
      ]);
    } else {
      const cutoff = mode.cutoff;
      [delSnapshots, delMetrics, delSales, delLeads] = await Promise.all([
        prisma.snapshot
          .deleteMany({ where: { createdAt: { lt: cutoff } } })
          .catch(() => ({ count: 0 })),
        prisma.metricSample
          .deleteMany({ where: { createdAt: { lt: cutoff } } })
          .catch(() => ({ count: 0 })),
        prisma.sale.deleteMany({ where: { saleDate: { lt: cutoff } } }),
        prisma.lead.deleteMany({ where: { capturedAt: { lt: cutoff } } }),
      ]);
    }

    const after = await countAll();

    return NextResponse.json({
      status: "ok",
      mode: mode.type === "all" ? "all (wipe total)" : `before ${mode.cutoff.toISOString()}`,
      deleted: {
        leads: delLeads.count,
        sales: delSales.count,
        metrics: delMetrics.count,
        snapshots: delSnapshots.count,
      },
      counts_before: before,
      counts_after: after,
      message: "Reset aplicado. Refresh https://iris.technowhub.ai/ pra ver.",
    });
  } catch (err) {
    return NextResponse.json(
      { error: "db_error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
