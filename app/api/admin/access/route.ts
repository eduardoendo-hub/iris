/**
 * /api/admin/access — gerencia AllowedEmail + AllowedDomain.
 *
 * Auth: sessao ADMIN OU X-Admin-Secret.
 *
 * GET → lista emails (com campanhas linkadas) + dominios autorizados
 * POST → adiciona um email ou dominio
 *   Body: { type: "email" | "domain", value: string, note?: string, campaignSlugs?: string[] }
 *   campaignSlugs so vale pra type=email; lista vazia = acesso a TODAS
 *   as campanhas (backward compat). Lista nao vazia = restrito.
 * DELETE → remove por id
 *   Query: ?type=email&id=...  OU  ?type=domain&id=...
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AddBody = z.object({
  type: z.enum(["email", "domain"]),
  value: z.string().min(2).max(200),
  note: z.string().max(500).optional(),
  // Slugs de campanhas linkadas (so pra type=email). Vazio = acesso a tudo.
  campaignSlugs: z.array(z.string().min(1).max(80)).max(50).optional(),
});

export async function GET(req: NextRequest) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  const [emails, domains, campaigns] = await Promise.all([
    prisma.allowedEmail.findMany({
      orderBy: { addedAt: "desc" },
      include: {
        allowedCampaigns: {
          select: { campaignSlug: true },
          orderBy: { campaignSlug: "asc" },
        },
      },
    }),
    prisma.allowedDomain.findMany({ orderBy: { addedAt: "desc" } }),
    // Lista resumida de campanhas pra UI montar o multi-select
    prisma.campaign.findMany({
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      select: { slug: true, name: true, productSlug: true, isActive: true },
    }),
  ]);
  // Achata allowedCampaigns pra array de slugs
  const emailsFlat = emails.map((e) => ({
    id: e.id,
    email: e.email,
    note: e.note,
    addedAt: e.addedAt,
    campaignSlugs: e.allowedCampaigns.map((c) => c.campaignSlug),
  }));
  return NextResponse.json({ emails: emailsFlat, domains, campaigns });
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
  const parsed = AddBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const { type, value, note, campaignSlugs } = parsed.data;
  const cleaned = value.trim().toLowerCase();
  const addedByUserId = a.mode === "session" ? a.userId ?? null : null;

  try {
    if (type === "email") {
      if (!cleaned.includes("@")) {
        return NextResponse.json({ error: "invalid_email" }, { status: 422 });
      }
      // Valida que todas as campanhas listadas existem (evita lixo na DB)
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
      // Cria AllowedEmail + linka campanhas em uma transacao
      const row = await prisma.$transaction(async (tx) => {
        const ae = await tx.allowedEmail.create({
          data: { email: cleaned, note, addedByUserId },
        });
        if (campaignSlugs && campaignSlugs.length > 0) {
          await tx.allowedEmailCampaign.createMany({
            data: campaignSlugs.map((slug) => ({
              allowedEmailId: ae.id,
              campaignSlug: slug,
            })),
            skipDuplicates: true,
          });
        }
        return tx.allowedEmail.findUniqueOrThrow({
          where: { id: ae.id },
          include: {
            allowedCampaigns: { select: { campaignSlug: true } },
          },
        });
      });
      return NextResponse.json(
        {
          status: "created",
          entry: {
            id: row.id,
            email: row.email,
            note: row.note,
            addedAt: row.addedAt,
            campaignSlugs: row.allowedCampaigns.map((c) => c.campaignSlug),
          },
        },
        { status: 201 }
      );
    } else {
      const cleanDomain = cleaned.replace(/^@/, "").replace(/^https?:\/\//, "").split("/")[0];
      if (!cleanDomain.includes(".")) {
        return NextResponse.json({ error: "invalid_domain" }, { status: 422 });
      }
      const row = await prisma.allowedDomain.create({
        data: { domain: cleanDomain, note, addedByUserId },
      });
      return NextResponse.json({ status: "created", entry: row }, { status: 201 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const conflict = msg.includes("Unique constraint") || msg.includes("unique");
    return NextResponse.json(
      {
        error: conflict ? "conflict" : "db_error",
        message: conflict ? "Ja existe na whitelist" : msg,
      },
      { status: conflict ? 409 : 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id");
  if (!id || (type !== "email" && type !== "domain")) {
    return NextResponse.json({ error: "missing_or_invalid_type_id" }, { status: 400 });
  }
  try {
    if (type === "email") {
      // Cascade na FK cuida das entradas em AllowedEmailCampaign
      await prisma.allowedEmail.delete({ where: { id } });
    } else {
      await prisma.allowedDomain.delete({ where: { id } });
    }
    return NextResponse.json({ status: "deleted", type, id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "db_error", message: msg }, { status: 500 });
  }
}
