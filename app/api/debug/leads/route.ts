/**
 * GET /api/debug/leads — lista os ultimos N leads persistidos no Postgres.
 *
 * Util pra confirmar que o webhook do integracao-rd esta chegando e o
 * model Lead esta sendo populado.
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET (a resposta traz nome/email/
 * telefone — dado pessoal, nunca publico).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Auth: header X-Admin-Secret = IRIS_WEBHOOK_SECRET — mesmo padrao dos outros
// /api/debug (webhooks, parse-test, auth). Sem isso a rota fica PUBLICA: o
// middleware (proxy.ts) libera /api/debug inteiro assumindo auth no handler.
function authorized(req: Request): boolean {
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-admin-secret") || "") === secret;
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "10", 10), 100);

  try {
    const leads = await prisma.lead.findMany({
      orderBy: { capturedAt: "desc" },
      take: limit,
      select: {
        id: true,
        productSlug: true,
        campaignSlug: true,
        eventType: true,
        name: true,
        email: true,
        phone: true,
        utmSource: true,
        utmMedium: true,
        utmCampaign: true,
        sourcePage: true,
        rdCrmDealId: true,
        rdCrmContactId: true,
        rdCrmStatus: true,
        status: true,
        capturedAt: true,
      },
    });
    const total = await prisma.lead.count();
    return NextResponse.json({ total, count: leads.length, leads });
  } catch (err) {
    return NextResponse.json(
      { error: "db_error", message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
