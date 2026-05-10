/**
 * GET /api/debug/leads — lista os ultimos N leads persistidos no Postgres.
 *
 * Util pra confirmar que o webhook do integracao-rd esta chegando e o
 * model Lead esta sendo populado. Em producao real, rota deve ser
 * protegida por auth.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
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
