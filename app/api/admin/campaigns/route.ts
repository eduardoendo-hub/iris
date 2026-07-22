/**
 * /api/admin/campaigns — gerencia campanhas configuradas via /admin.
 *
 * Auth: sessao NextAuth (role=ADMIN) OU X-Admin-Secret.
 *
 * GET → lista todas as campanhas (ordenadas por startDate desc)
 * POST → cria nova campanha
 *   Body: { slug, productSlug, name, startDate, endDate, ... }
 *
 * Constraint: max 1 ativa por (productSlug). Pra ativar outra, primeiro
 * desativar a anterior (ou usar /api/admin/campaigns/:id/activate).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/admin-auth";
import { TurmaInputSchema, syncCampaignTurmas } from "@/lib/campaign-turmas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// nullishNumber: aceita null, undefined, "" (string) ou numero >= 0.
// null/undefined/"" viram undefined (campo nao seta no DB).
const nullishNumber = z.preprocess(
  (v) => (v === null || v === "" ? undefined : v),
  z.coerce.number().nonnegative().optional()
);
const nullishInt = z.preprocess(
  (v) => (v === null || v === "" ? undefined : v),
  z.coerce.number().int().nonnegative().optional()
);
const nullishString = z.preprocess(
  (v) => (v === null || v === "" ? undefined : v),
  z.string().optional()
);

const CampaignCreate = z.object({
  slug: z.string().min(2).max(80),
  productSlug: z.string().min(1).max(64),
  name: z.string().min(2).max(200),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  mediaBudget: nullishNumber,
  productionCostLP: nullishNumber,
  productionCostAds: nullishNumber,
  productionCostOther: nullishNumber,
  goalEnrollments: nullishInt,
  goalRevenue: nullishNumber,
  goalCac: nullishNumber,
  goalRoas: nullishNumber,
  goalCpl: nullishNumber,
  marketingPlan: nullishString,
  marketingPlanFilename: nullishString,
  isActive: z.boolean().optional(),
  engagedCheckoutSharedIds: z.array(z.string().min(1)).optional(),
  impactaTurmaId: nullishString,
  // Turmas paralelas (presencial/online) — opcional; vazio = campanha simples.
  turmas: z.array(TurmaInputSchema).optional(),
});

export async function GET(req: NextRequest) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  const campaigns = await prisma.campaign.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
  });
  return NextResponse.json({ total: campaigns.length, campaigns });
}

export async function POST(req: NextRequest) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = CampaignCreate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const { turmas, ...data } = parsed.data;
  try {
    // Se isActive=true, desativa outras do mesmo produto primeiro (transaction)
    if (data.isActive) {
      await prisma.$transaction([
        prisma.campaign.updateMany({
          where: { productSlug: data.productSlug, isActive: true },
          data: { isActive: false, status: "DRAFT" },
        }),
      ]);
    }
    const campaign = await prisma.campaign.create({
      data: {
        ...data,
        // status em lockstep com isActive (ACTIVE se ativa, senao DRAFT).
        status: data.isActive ? "ACTIVE" : "DRAFT",
        createdByUserId: a.mode === "session" ? a.userId : null,
      },
    });
    if (turmas && turmas.length > 0) {
      await syncCampaignTurmas(campaign.id, turmas);
    }
    return NextResponse.json({ status: "created", campaign }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const conflict = msg.includes("Unique constraint") || msg.includes("unique");
    return NextResponse.json(
      {
        error: conflict ? "conflict" : "db_error",
        message: conflict ? "Slug ou outra campanha ativa em conflito" : msg,
      },
      { status: conflict ? 409 : 500 }
    );
  }
}
