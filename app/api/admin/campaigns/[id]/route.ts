/**
 * /api/admin/campaigns/[id] — operacoes em campanha especifica.
 *
 * Auth: sessao ADMIN OU X-Admin-Secret.
 *
 * GET     → detalhes da campanha
 * PATCH   → atualiza campos (qualquer subset)
 * DELETE  → remove campanha
 *
 * Tambem aceita acao via query:
 *   PATCH ?action=activate → torna ativa (desativa as outras do mesmo produto)
 *   PATCH ?action=deactivate → pausa (volta pra DRAFT, sem congelar)
 *   PATCH ?action=end → ENCERRA (Feature A): status=ENDED, endedAt=now,
 *                       congela frozenResults e corta ingestao Meta/Google/
 *                       Engaged/eventos dessa campanha.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/admin-auth";
import { getCampaignResults } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Pra UPDATE permite null explicito (limpar campo) — null vira null no DB.
// undefined → nao mexe no campo.
const nullableNumber = z.preprocess(
  (v) => (v === "" ? null : v),
  z.coerce.number().nonnegative().nullable().optional()
);
const nullableInt = z.preprocess(
  (v) => (v === "" ? null : v),
  z.coerce.number().int().nonnegative().nullable().optional()
);
const nullableString = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().nullable().optional()
);

const CampaignUpdate = z.object({
  slug: z.string().min(2).max(80).optional(),
  productSlug: z.string().min(1).max(64).optional(),
  name: z.string().min(2).max(200).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  mediaBudget: nullableNumber,
  productionCostLP: nullableNumber,
  productionCostAds: nullableNumber,
  productionCostOther: nullableNumber,
  goalEnrollments: nullableInt,
  goalRevenue: nullableNumber,
  goalCac: nullableNumber,
  goalRoas: nullableNumber,
  goalCpl: nullableNumber,
  marketingPlan: nullableString,
  marketingPlanFilename: nullableString,
  isActive: z.boolean().optional(),
  // SharedIDs do checkout Engaged desta turma (1 por linha no form, array aqui).
  engagedCheckoutSharedIds: z.array(z.string().min(1)).optional(),
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  const { id } = await ctx.params;
  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ campaign });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // Action shortcuts: activate/deactivate/end
  if (action === "activate" || action === "deactivate" || action === "end") {
    const existing = await prisma.campaign.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

    if (action === "deactivate") {
      // Pausa: tira de ATIVA mas NAO congela (volta pra DRAFT). Pra encerrar
      // de vez (congelar + cortar ingestao) use action=end.
      const c = await prisma.campaign.update({
        where: { id },
        data: { isActive: false, status: "DRAFT" },
      });
      return NextResponse.json({ status: "deactivated", campaign: c });
    }

    if (action === "end") {
      // FEATURE A — Encerrar campanha:
      //   1. Marca endedAt=now (status segue ACTIVE temporariamente) pra que
      //      getCampaignResults use NOW como limite superior da janela.
      //   2. Calcula o snapshot dos resultados (live, dentro da janela).
      //   3. Grava status=ENDED + isActive=false + frozenResults.
      // A partir daqui crons/eventos/webhook param de gravar nessa campanha.
      const endedAt = new Date();
      await prisma.campaign.update({ where: { id }, data: { endedAt } });
      let frozen: unknown = null;
      try {
        frozen = await getCampaignResults({
          productSlug: existing.productSlug,
          campaignSlug: existing.slug,
        });
      } catch (e) {
        console.error("[campaigns:end] falha ao calcular frozenResults:", e);
      }
      const c = await prisma.campaign.update({
        where: { id },
        data: {
          status: "ENDED",
          isActive: false,
          endedAt,
          ...(frozen ? { frozenResults: frozen as object } : {}),
        },
      });
      return NextResponse.json({ status: "ended", campaign: c });
    }

    // activate: desativa as outras do mesmo produto + ativa essa.
    // Reabrir uma ENDED limpa endedAt/frozenResults (volta a alimentar).
    await prisma.$transaction([
      prisma.campaign.updateMany({
        where: {
          productSlug: existing.productSlug,
          isActive: true,
          NOT: { id },
        },
        data: { isActive: false, status: "DRAFT" },
      }),
      prisma.campaign.update({
        where: { id },
        data: { isActive: true, status: "ACTIVE", endedAt: null, frozenResults: Prisma.DbNull },
      }),
    ]);
    const c = await prisma.campaign.findUnique({ where: { id } });
    return NextResponse.json({ status: "activated", campaign: c });
  }

  // Update fields normalmente
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = CampaignUpdate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const data = parsed.data;
  try {
    // Se mudou pra isActive=true, desativa outras do mesmo produto e mantem
    // status em lockstep (ACTIVE). isActive=false sem encerrar -> DRAFT.
    if (data.isActive === true) {
      const existing = await prisma.campaign.findUnique({ where: { id } });
      if (existing) {
        const productSlug = data.productSlug ?? existing.productSlug;
        await prisma.campaign.updateMany({
          where: { productSlug, isActive: true, NOT: { id } },
          data: { isActive: false, status: "DRAFT" },
        });
      }
    }
    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...data,
        ...(data.isActive === true ? { status: "ACTIVE" as const } : {}),
      },
    });
    return NextResponse.json({ status: "updated", campaign });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = msg.includes("Record to update not found") ? 404 : 500;
    return NextResponse.json(
      { error: code === 404 ? "not_found" : "db_error", message: msg },
      { status: code }
    );
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    await prisma.campaign.delete({ where: { id } });
    return NextResponse.json({ status: "deleted", id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = msg.includes("Record to delete does not exist") ? 404 : 500;
    return NextResponse.json(
      { error: code === 404 ? "not_found" : "db_error", message: msg },
      { status: code }
    );
  }
}
