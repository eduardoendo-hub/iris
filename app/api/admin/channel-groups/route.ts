/**
 * /api/admin/channel-groups — grupos de canal (Orgânico/Meta/Google/...).
 * GET → lista (ordem asc) · POST → cria. Auth: ADMIN ou X-Admin-Secret.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const strArr = z.preprocess(
  (v) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : []),
  z.array(z.string().trim().toLowerCase()).transform((a) => Array.from(new Set(a.filter(Boolean)))),
);

const Create = z.object({
  name: z.string().min(1).max(40),
  ordem: z.coerce.number().int().default(0),
  color: z.string().max(16).nullable().optional(),
  sources: strArr.optional(),
  mediums: strArr.optional(),
  matchEmptySource: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  const items = await prisma.channelGroup.findMany({ orderBy: { ordem: "asc" } });
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = Create.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  const d = parsed.data;
  try {
    const created = await prisma.channelGroup.create({
      data: {
        name: d.name,
        ordem: d.ordem,
        color: d.color ?? null,
        sources: d.sources ?? [],
        mediums: d.mediums ?? [],
        matchEmptySource: d.matchEmptySource ?? false,
      },
    });
    return NextResponse.json({ created });
  } catch (err) {
    return NextResponse.json({ error: "db_error", message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
