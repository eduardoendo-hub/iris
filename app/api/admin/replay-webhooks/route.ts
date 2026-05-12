/**
 * /api/admin/replay-webhooks — reprocessa webhooks que ficaram em
 * outcome=validation_failed (geralmente apos bug fix no parser).
 *
 * Le o rawBody salvo, repassa pela logica atual de handling e atualiza
 * o WebhookLog + cria/atualiza Sale conforme caso. Idempotente — usa
 * externalId pra deduplicar.
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * Query:
 *   ?source=engaged          (default)
 *   ?outcome=validation_failed (default — so reprocessa falhas)
 *   ?dry_run=true            (preview, sem mexer no DB)
 *   ?confirm=yes             (required pra rodar)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processEngagedPayload } from "@/app/api/webhook/engaged/route";

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
  const source = url.searchParams.get("source") || "engaged";
  const outcome = url.searchParams.get("outcome") || "validation_failed";
  const dryRun = url.searchParams.get("dry_run") === "true";
  const confirm = url.searchParams.get("confirm") === "yes";

  if (!dryRun && !confirm) {
    return NextResponse.json(
      {
        error: "confirmation_required",
        message: "Use ?confirm=yes pra aplicar, ou ?dry_run=true pra preview.",
      },
      { status: 400 }
    );
  }

  // Busca logs candidatos a reprocessar
  const logs = await prisma.webhookLog.findMany({
    where: { source, outcome },
    orderBy: { receivedAt: "asc" },
    take: 100,
  });

  if (logs.length === 0) {
    return NextResponse.json({
      status: "ok",
      processed: 0,
      message: `Nenhum webhook source=${source} outcome=${outcome} pra reprocessar.`,
    });
  }

  const results: Array<{
    logId: string;
    receivedAt: Date;
    action: string;
    outcome: string;
    saleId?: string;
    externalId?: string;
    error?: string;
  }> = [];

  for (const log of logs) {
    try {
      if (dryRun) {
        results.push({
          logId: log.id,
          receivedAt: log.receivedAt,
          action: "would_replay",
          outcome: "dry_run",
        });
        continue;
      }

      // Reprocessa via chamada DIRETA da funcao (sem HTTP self-call que
      // falha em ambiente Coolify/Docker pra mesmo container)
      if (source !== "engaged") {
        results.push({
          logId: log.id,
          receivedAt: log.receivedAt,
          action: "skipped",
          outcome: "unsupported_source",
          error: `Replay so suporta source=engaged por enquanto`,
        });
        continue;
      }

      const r = await processEngagedPayload(log.rawBody);

      // Atualiza o log original com o novo outcome
      await prisma.webhookLog
        .update({
          where: { id: log.id },
          data: {
            statusCode: r.statusCode,
            resultJson: r.body as never,
            outcome: r.outcome,
            reason: r.reason ? `[replay] ${r.reason}` : `[replay]`,
            saleId: r.saleId,
            externalId: r.externalId,
          },
        })
        .catch(() => {
          /* ignore log update errors */
        });

      results.push({
        logId: log.id,
        receivedAt: log.receivedAt,
        action: "replayed",
        outcome: r.outcome,
        saleId: r.saleId,
        externalId: r.externalId,
        error: r.reason && r.outcome !== "created" && r.outcome !== "updated" && r.outcome !== "ignored"
          ? r.reason
          : undefined,
      });
    } catch (err) {
      results.push({
        logId: log.id,
        receivedAt: log.receivedAt,
        action: "replayed",
        outcome: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const summary = {
    total: results.length,
    created: results.filter((r) => r.outcome === "created").length,
    updated: results.filter((r) => r.outcome === "updated").length,
    ignored: results.filter((r) => r.outcome === "ignored").length,
    error: results.filter((r) => r.outcome.startsWith("error") || r.outcome === "error").length,
    dry_run: results.filter((r) => r.outcome === "dry_run").length,
  };

  return NextResponse.json({
    status: dryRun ? "preview" : "applied",
    source,
    matched_outcome: outcome,
    summary,
    results,
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
