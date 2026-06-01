/**
 * /api/admin/campaigns/clone — FEATURE B: cria uma nova campanha (turma)
 * baseada numa anterior.
 *
 * Auth: sessao ADMIN OU X-Admin-Secret.
 *
 * O que faz:
 *   1. Encerra a campanha de origem se ainda estiver ativa (reusa Feature A:
 *      congela frozenResults + corta ingestao).
 *   2. Cria a nova campanha herdando LP/produto/metas/custos da origem.
 *      Mesmo prefixo Meta/Google (vive em lib/products.ts, nao se copia).
 *   3. Novo sharedId do Engaged (turma nova = URL nova). Override opcional.
 *   4. status=ACTIVE, startDate informado (default: dia seguinte ao fim da
 *      origem). Como a janela comeca vazia, os indicadores "zeram" sozinhos.
 *
 * Body:
 *   {
 *     fromSlug: string,            // campanha de origem (obrigatorio)
 *     slug: string,                // slug da nova campanha (obrigatorio)
 *     name: string,                // nome da nova campanha (obrigatorio)
 *     startDate?: date,            // default: endDate_origem + 1 dia
 *     endDate?: date,              // default: startDate + duracao da origem
 *     engagedCheckoutSharedIds?: string[],  // sharedId(s) da nova turma
 *     activate?: boolean,          // default true (ja entra ATIVA)
 *     overrides?: { mediaBudget?, goalEnrollments?, goalRevenue?, ... }
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/admin-auth";
import { getCampaignResults } from "@/lib/analytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = z.coerce.number().nonnegative().optional();
const int = z.coerce.number().int().nonnegative().optional();

const CloneInput = z.object({
  fromSlug: z.string().min(2),
  slug: z.string().min(2).max(80),
  name: z.string().min(2).max(200),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  engagedCheckoutSharedIds: z.array(z.string().min(1)).optional(),
  activate: z.boolean().optional(),
  overrides: z
    .object({
      mediaBudget: num,
      productionCostLP: num,
      productionCostAds: num,
      productionCostOther: num,
      goalEnrollments: int,
      goalRevenue: num,
      goalCac: num,
      goalRoas: num,
      goalCpl: num,
      marketingPlan: z.string().optional(),
    })
    .optional(),
});

const DAY_MS = 24 * 60 * 60 * 1000;

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
  const parsed = CloneInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const input = parsed.data;
  const activate = input.activate ?? true;

  // 1) Carrega a campanha de origem
  const from = await prisma.campaign.findUnique({ where: { slug: input.fromSlug } });
  if (!from) {
    return NextResponse.json({ error: "not_found", message: "fromSlug nao existe" }, { status: 404 });
  }

  // 2) Encerra a origem se ainda ativa (Feature A inline): endedAt -> snapshot
  //    -> ENDED. Garante que a origem fique congelada antes da nova comecar.
  if (from.status === "ACTIVE") {
    const endedAt = new Date();
    await prisma.campaign.update({ where: { id: from.id }, data: { endedAt } });
    let frozen: unknown = null;
    try {
      frozen = await getCampaignResults({ productSlug: from.productSlug, campaignSlug: from.slug });
    } catch (e) {
      console.error("[campaigns:clone] falha ao congelar origem:", e);
    }
    await prisma.campaign.update({
      where: { id: from.id },
      data: {
        status: "ENDED",
        isActive: false,
        endedAt,
        ...(frozen ? { frozenResults: frozen as object } : {}),
      },
    });
  }

  // 3) Datas da nova campanha. Default: comeca no dia seguinte ao fim da origem
  //    e dura o mesmo numero de dias.
  const originEnd = from.endedAt ?? from.endDate;
  const startDate = input.startDate ?? new Date(originEnd.getTime() + DAY_MS);
  const durationMs = from.endDate.getTime() - from.startDate.getTime();
  const endDate =
    input.endDate ?? new Date(startDate.getTime() + (durationMs > 0 ? durationMs : 30 * DAY_MS));

  const ov = input.overrides ?? {};

  // 4) Cria a nova campanha herdando o que faz sentido da origem.
  try {
    if (activate) {
      // desativa qualquer ativa remanescente do mesmo produto
      await prisma.campaign.updateMany({
        where: { productSlug: from.productSlug, isActive: true },
        data: { isActive: false, status: "DRAFT" },
      });
    }
    const created = await prisma.campaign.create({
      data: {
        slug: input.slug,
        productSlug: from.productSlug,
        name: input.name,
        startDate,
        endDate,
        // Herdados (override quando informado)
        mediaBudget: ov.mediaBudget ?? from.mediaBudget ?? undefined,
        productionCostLP: ov.productionCostLP ?? from.productionCostLP ?? undefined,
        productionCostAds: ov.productionCostAds ?? from.productionCostAds ?? undefined,
        productionCostOther: ov.productionCostOther ?? from.productionCostOther ?? undefined,
        goalEnrollments: ov.goalEnrollments ?? from.goalEnrollments ?? undefined,
        goalRevenue: ov.goalRevenue ?? from.goalRevenue ?? undefined,
        goalCac: ov.goalCac ?? from.goalCac ?? undefined,
        goalRoas: ov.goalRoas ?? from.goalRoas ?? undefined,
        goalCpl: ov.goalCpl ?? from.goalCpl ?? undefined,
        marketingPlan: ov.marketingPlan ?? from.marketingPlan ?? undefined,
        // Engaged: turma nova = sharedId novo. NAO herda os da origem.
        engagedCheckoutSharedIds: input.engagedCheckoutSharedIds ?? [],
        clonedFromSlug: from.slug,
        status: activate ? "ACTIVE" : "DRAFT",
        isActive: activate,
        createdByUserId: a.mode === "session" ? a.userId : null,
      },
    });
    return NextResponse.json(
      { status: "cloned", from: from.slug, campaign: created },
      { status: 201 }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const conflict = msg.includes("Unique constraint") || msg.includes("unique");
    return NextResponse.json(
      {
        error: conflict ? "conflict" : "db_error",
        message: conflict ? "Slug ja existe ou outra campanha ativa em conflito" : msg,
      },
      { status: conflict ? 409 : 500 }
    );
  }
}
