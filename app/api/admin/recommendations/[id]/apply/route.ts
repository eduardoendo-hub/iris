/**
 * /api/admin/recommendations/:id/apply — executa a ação 1-clique de uma
 * recomendação (negativa/vincular lista) via a Google Ads API. Marca DONE.
 * Auth: ADMIN ou X-Admin-Secret. ESCREVE em conta de mídia real — gated.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/admin-auth";
import { addCampaignNegativeKeywords, linkCampaignToSharedSetByName } from "@/lib/ingest/google-rest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ApplySpec =
  | { type: "ADD_NEGATIVES"; platform: string; campaignId: string; negatives: Array<{ text: string; matchType: string }> }
  | { type: "LINK_LIST"; platform: string; campaignId: string; listName: string };

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  const { id } = await ctx.params;
  const rec = await prisma.agentRecommendation.findUnique({ where: { id } });
  if (!rec) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const apply = (rec.evidence as { apply?: ApplySpec } | null)?.apply;
  if (!apply || !apply.type) {
    return NextResponse.json({ error: "no_apply_spec", message: "Esta recomendação não tem ação automatizável." }, { status: 400 });
  }
  if (apply.platform !== "GOOGLE") {
    return NextResponse.json({ error: "unsupported_platform", message: "Auto-apply só para Google por enquanto." }, { status: 400 });
  }

  try {
    let result: unknown;
    if (apply.type === "ADD_NEGATIVES") {
      if (!apply.campaignId || !apply.negatives?.length) {
        return NextResponse.json({ error: "invalid_spec" }, { status: 400 });
      }
      result = await addCampaignNegativeKeywords(apply.campaignId, apply.negatives);
    } else if (apply.type === "LINK_LIST") {
      if (!apply.campaignId || !apply.listName) {
        return NextResponse.json({ error: "invalid_spec" }, { status: 400 });
      }
      result = await linkCampaignToSharedSetByName(apply.campaignId, apply.listName);
    } else {
      return NextResponse.json({ error: "unknown_apply_type" }, { status: 400 });
    }

    await prisma.agentRecommendation.update({ where: { id }, data: { status: "DONE" } });
    return NextResponse.json({ ok: true, applied: apply.type, result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: "apply_failed", message: msg }, { status: 500 });
  }
}
