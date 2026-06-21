/**
 * /api/admin/recommendations/:id — muda status de uma recomendação do agente.
 * PATCH { status: "OPEN" | "DONE" | "DISMISSED" }. Auth: ADMIN ou X-Admin-Secret.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Patch = z.object({ status: z.enum(["OPEN", "DONE", "DISMISSED"]) });

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
  const parsed = Patch.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  }
  try {
    const updated = await prisma.agentRecommendation.update({ where: { id }, data: { status: parsed.data.status } });
    return NextResponse.json({ updated });
  } catch (err) {
    return NextResponse.json({ error: "db_error", message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
