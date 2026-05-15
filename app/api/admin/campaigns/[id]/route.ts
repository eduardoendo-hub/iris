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
 *   PATCH ?action=deactivate → desativa
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CampaignUpdate = z.object({
  slug: z.string().min(2).max(80).optional(),
  productSlug: z.string().min(1).max(64).optional(),
  name: z.string().min(2).max(200).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  mediaBudget: z.coerce.number().nonnegative().nullable().optional(),
  productionCostLP: z.coerce.number().nonnegative().nullable().optional(),
  productionCostAds: z.coerce.number().nonnegative().nullable().optional(),
  productionCostOther: z.coerce.number().nonnegative().nullable().optional(),
  goalEnrollments: z.coerce.number().int().nonnegative().nullable().optional(),
  goalRevenue: z.coerce.number().nonnegative().nullable().optional(),
  goalCac: z.coerce.number().nonnegative().nullable().optional(),
  goalRoas: z.coerce.number().nonnegative().nullable().optional(),
  goalCpl: z.coerce.number().nonnegative().nullable().optional(),
  marketingPlan: z.string().max(200_000).nullable().optional(),
  marketingPlanFilename: z.string().max(255).nullable().optional(),
  isActive: z.boolean().optional(),
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

  // Action shortcuts: activate/deactivate
  if (action === "activate" || action === "deactivate") {
    const existing = await prisma.campaign.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (action === "deactivate") {
      const c = await prisma.campaign.update({
        where: { id },
        data: { isActive: false },
      });
      return NextResponse.json({ status: "deactivated", campaign: c });
    }
    // activate: desativa as outras do mesmo produto + ativa essa
    await prisma.$transaction([
      prisma.campaign.updateMany({
        where: {
          productSlug: existing.productSlug,
          isActive: true,
          NOT: { id },
        },
        data: { isActive: false },
      }),
      prisma.campaign.update({ where: { id }, data: { isActive: true } }),
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
    // Se mudou pra isActive=true, desativa outras do mesmo produto
    if (data.isActive === true) {
      const existing = await prisma.campaign.findUnique({ where: { id } });
      if (existing) {
        const productSlug = data.productSlug ?? existing.productSlug;
        await prisma.campaign.updateMany({
          where: { productSlug, isActive: true, NOT: { id } },
          data: { isActive: false },
        });
      }
    }
    const campaign = await prisma.campaign.update({
      where: { id },
      data,
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
