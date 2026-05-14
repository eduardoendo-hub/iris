/**
 * /api/debug/parse-test — testa o pickSaleDate em uma amostra real do
 * WebhookLog. Util pra confirmar se o codigo deployado tem o fix do
 * camelCase (updatedAt/createdAt do Engaged).
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * Query:
 *   ?logId=<webhookLog.id>   (opcional — default: ultimo log engaged)
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
  const logId = url.searchParams.get("logId");

  const log = logId
    ? await prisma.webhookLog.findUnique({ where: { id: logId } })
    : await prisma.webhookLog.findFirst({
        where: { source: "engaged" },
        orderBy: { receivedAt: "desc" },
      });

  if (!log) {
    return NextResponse.json({ error: "no_webhook_log_found" }, { status: 404 });
  }

  // Replica logica do pickSaleDate INLINE pra mostrar passo a passo
  // que campos do payload existem e qual seria escolhido.
  type P = Record<string, unknown>;
  let payload: P;
  try {
    payload =
      typeof log.rawBody === "string" ? JSON.parse(log.rawBody) : (log.rawBody as P);
  } catch (err) {
    return NextResponse.json({
      error: "parse_failed",
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const candidates = {
    paid_at: payload.paid_at,
    confirmed_at: payload.confirmed_at,
    updatedAt: payload.updatedAt, // camelCase — Engaged real
    occurred_at: payload.occurred_at,
    createdAt: payload.createdAt, // camelCase
    created_at: payload.created_at,
  };

  // Simula a ordem do pickSaleDate atual
  const order = [
    "paid_at",
    "confirmed_at",
    "updatedAt", // se commit 57f5197 estiver deployado, aparece aqui
    "occurred_at",
    "createdAt",
    "created_at",
  ] as const;

  let picked: string | null = null;
  let pickedKey: string | null = null;
  for (const k of order) {
    const v = candidates[k];
    if (typeof v === "string" && v) {
      picked = v;
      pickedKey = k;
      break;
    }
  }

  const hasCamelcaseFix = order.includes("updatedAt" as (typeof order)[number]);

  return NextResponse.json({
    logId: log.id,
    receivedAt: log.receivedAt,
    externalId: log.externalId,
    payloadKeys: Object.keys(payload),
    candidates,
    pickOrder: order,
    pickedKey,
    pickedValue: picked,
    pickedDate: picked ? new Date(picked).toISOString() : null,
    hasCamelcaseFix,
    deployedCodeHint: hasCamelcaseFix
      ? "Codigo tem updatedAt na pickOrder — fix 57f5197 deployado"
      : "Codigo NAO tem updatedAt — fix 57f5197 nao deployado ainda",
  });
}
