/**
 * /api/admin/ad-campaigns — lista campanhas das contas Meta + Google
 * (pro picker "Puxar campanhas da conta" na tela de campanhas rastreadas).
 * Auth: sessão ADMIN ou X-Admin-Secret. Não cria nada — só lê das plataformas.
 */
import { NextRequest, NextResponse } from "next/server";
import { checkAdminAuth } from "@/lib/admin-auth";
import { listGoogleCampaigns, listMetaCampaignsForPicker } from "@/lib/ingest/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  const [meta, google] = await Promise.all([listMetaCampaignsForPicker(), listGoogleCampaigns()]);
  return NextResponse.json({ meta, google });
}
