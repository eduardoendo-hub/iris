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

  // Determina origem (host) da request original via headers pra reconstruir POST
  const internalUrl = new URL(req.url);
  const baseUrl = `${internalUrl.protocol}//${internalUrl.host}`;
  const webhookUrl = `${baseUrl}/api/webhook/${source}`;

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

      // Reprocessa via POST interno usando Bearer auth (mesmo formato Engaged)
      const engagedSecret = process.env.ENGAGED_WEBHOOK_SECRET || "";
      const r = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${engagedSecret}`,
          "User-Agent": "iris-replay/1.0",
        },
        body: log.rawBody,
      });
      const respJson = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      results.push({
        logId: log.id,
        receivedAt: log.receivedAt,
        action: "replayed",
        outcome: r.ok ? String(respJson.status || "ok") : `error_${r.status}`,
        saleId: typeof respJson.id === "string" ? respJson.id : undefined,
        externalId:
          typeof respJson.externalId === "string" ? respJson.externalId : undefined,
        error: !r.ok ? String(respJson.error || respJson.message || "") : undefined,
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
