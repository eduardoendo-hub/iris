/**
 * /api/admin/tracked-campaigns — campanhas que o Gestor de Tráfego acompanha.
 * Auth: sessão NextAuth (role=ADMIN) OU X-Admin-Secret.
 *   GET  → lista
 *   POST → cria  { platform, accountId, externalId?, nameFilter?, productSlug?, label, objective?, targetCpl?, targetRoas?, active? }
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nstr = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.string().nullable(),
);
const nnum = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.coerce.number().nonnegative().nullable(),
);

const TrackedCreate = z.object({
  platform: z.enum(["META", "GOOGLE"]),
  accountId: z.string().min(1).max(64),
  externalId: nstr.optional(),
  nameFilter: nstr.optional(),
  productSlug: nstr.optional(),
  label: z.string().min(2).max(120),
  objective: nstr.optional(),
  targetCpl: nnum.optional(),
  targetRoas: nnum.optional(),
  active: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) {
    return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  }
  const items = await prisma.trackedCampaign.findMany({
    orderBy: [{ active: "desc" }, { platform: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ items });
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
  const parsed = TrackedCreate.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", issues: parsed.error.issues }, { status: 422 });
  }
  const d = parsed.data;
  try {
    const created = await prisma.trackedCampaign.create({
      data: {
        platform: d.platform,
        accountId: d.accountId,
        externalId: d.externalId ?? null,
        nameFilter: d.nameFilter ?? null,
        productSlug: d.productSlug ?? null,
        label: d.label,
        objective: d.objective ?? null,
        targetCpl: d.targetCpl ?? null,
        targetRoas: d.targetRoas ?? null,
        active: d.active ?? true,
      },
    });
    return NextResponse.json({ created });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "db_error", message: msg }, { status: 500 });
  }
}
