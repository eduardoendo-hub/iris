/**
 * /api/admin/access/[id] — edita campanhas linkadas de um AllowedEmail.
 *
 * Auth: sessao ADMIN OU X-Admin-Secret.
 *
 * PATCH → atualiza campanhas linkadas e/ou nota
 *   Body: { campaignSlugs?: string[], note?: string | null }
 *   campaignSlugs = lista completa que substitui as anteriores.
 *   Array vazio [] = remove todas as restricoes (acesso a todas as campanhas).
 *   Omitir o campo = nao mexe nas campanhas.
 *
 * GET → detalhes do AllowedEmail com suas campanhas
 *
 * Nota: este endpoint so opera em AllowedEmail (id). Pra dominios, deletar +
 * recriar via /api/admin/access POST/DELETE.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  campaignSlugs: z.array(z.string().min(1).max(80)).max(50).optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  const { id } = await ctx.params;
  const row = await prisma.allowedEmail.findUnique({
    where: { id },
    include: { allowedCampaigns: { select: { campaignSlug: true } } },
  });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    entry: {
      id: row.id,
      email: row.email,
      note: row.note,
      addedAt: row.addedAt,
      campaignSlugs: row.allowedCampaigns.map((c) => c.campaignSlug),
    },
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = PatchBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const { campaignSlugs, note } = parsed.data;

  // Verifica existencia
  const existing = await prisma.allowedEmail.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Valida que todas as campanhas listadas existem
  if (campaignSlugs && campaignSlugs.length > 0) {
    const found = await prisma.campaign.findMany({
      where: { slug: { in: campaignSlugs } },
      select: { slug: true },
    });
    const foundSet = new Set(found.map((c) => c.slug));
    const missing = campaignSlugs.filter((s) => !foundSet.has(s));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "unknown_campaigns", missing },
        { status: 422 },
      );
    }
  }

  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Update note se foi enviada (note: null tambem limpa)
      if (note !== undefined) {
        await tx.allowedEmail.update({
          where: { id },
          data: { note },
        });
      }
      // Replace campanhas se campaignSlugs foi enviado (incluindo array vazio)
      if (campaignSlugs !== undefined) {
        await tx.allowedEmailCampaign.deleteMany({
          where: { allowedEmailId: id },
        });
        if (campaignSlugs.length > 0) {
          await tx.allowedEmailCampaign.createMany({
            data: campaignSlugs.map((slug) => ({
              allowedEmailId: id,
              campaignSlug: slug,
            })),
            skipDuplicates: true,
          });
        }
      }
      return tx.allowedEmail.findUniqueOrThrow({
        where: { id },
        include: { allowedCampaigns: { select: { campaignSlug: true } } },
      });
    });
    return NextResponse.json({
      status: "updated",
      entry: {
        id: updated.id,
        email: updated.email,
        note: updated.note,
        addedAt: updated.addedAt,
        campaignSlugs: updated.allowedCampaigns.map((c) => c.campaignSlug),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "db_error", message: msg }, { status: 500 });
  }
}
