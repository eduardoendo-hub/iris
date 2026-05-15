/**
 * /api/admin/access — gerencia AllowedEmail + AllowedDomain.
 *
 * Auth: sessao ADMIN OU X-Admin-Secret.
 *
 * GET → lista emails + dominios autorizados
 * POST → adiciona um email ou dominio
 *   Body: { type: "email" | "domain", value: string, note?: string }
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
});

export async function GET(req: NextRequest) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  const [emails, domains] = await Promise.all([
    prisma.allowedEmail.findMany({ orderBy: { addedAt: "desc" } }),
    prisma.allowedDomain.findMany({ orderBy: { addedAt: "desc" } }),
  ]);
  return NextResponse.json({ emails, domains });
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
  const { type, value, note } = parsed.data;
  const cleaned = value.trim().toLowerCase();
  const addedByUserId = a.mode === "session" ? a.userId ?? null : null;

  try {
    if (type === "email") {
      if (!cleaned.includes("@")) {
        return NextResponse.json({ error: "invalid_email" }, { status: 422 });
      }
      const row = await prisma.allowedEmail.create({
        data: { email: cleaned, note, addedByUserId },
      });
      return NextResponse.json({ status: "created", entry: row }, { status: 201 });
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
