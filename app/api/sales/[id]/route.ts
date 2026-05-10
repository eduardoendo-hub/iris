/**
 * /api/sales/[id] — editar (PATCH) e apagar (DELETE) uma venda especifica.
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET (mesma chave do POST).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = req.headers.get("x-admin-secret") || "";
  return provided === secret;
}

const SalePatch = z.object({
  source: z.enum(["ENGAGED", "DIRETA", "CONSULTOR", "MANUAL", "OTHER"]).optional(),
  customerName: z.string().min(1).max(200).optional(),
  customerEmail: z.string().email().nullish(),
  customerPhone: z.string().max(40).nullish(),
  amount: z.coerce.number().positive().optional(),
  currency: z.string().length(3).optional(),
  saleDate: z.coerce.date().optional(),
  externalId: z.string().nullish(),
  externalRef: z.string().nullish(),
  notes: z.string().max(2000).nullish(),
});

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = SalePatch.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  try {
    const sale = await prisma.sale.update({
      where: { id },
      data: parsed.data,
    });
    return NextResponse.json({ status: "updated", sale });
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
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  try {
    await prisma.sale.delete({ where: { id } });
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
