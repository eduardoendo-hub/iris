/**
 * /api/admin/channel-groups/:id — editar (PATCH) / remover (DELETE) um grupo.
 * Auth: ADMIN ou X-Admin-Secret.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const strArr = z.preprocess(
  (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : undefined),
  z.array(z.string().trim().toLowerCase()).transform((a) => Array.from(new Set(a.filter(Boolean)))),
);

const Patch = z.object({
  name: z.string().min(1).max(40).optional(),
  ordem: z.coerce.number().int().optional(),
  color: z.string().max(16).nullable().optional(),
  sources: strArr.optional(),
  mediums: strArr.optional(),
  matchEmptySource: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  try {
    const updated = await prisma.channelGroup.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ updated });
  } catch (err) {
    return NextResponse.json({ error: "db_error", message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await prisma.channelGroup.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: "db_error", message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
