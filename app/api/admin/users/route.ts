/**
 * /api/admin/users — gerenciar usuarios do IRIS.
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET (bootstrap; quando primeiro
 * ADMIN existir, idealmente migrar pra sessao + role check).
 *
 * GET → lista todos os usuarios cadastrados (email, role, createdAt, lastSeenAt)
 *
 * POST → muda o role de um usuario.
 *   Body: { email: string, role: "ADMIN" | "OPERATOR" | "VIEWER" }
 *   Exemplo:
 *     curl -X POST -H "X-Admin-Secret: $IRIS_WEBHOOK_SECRET" \
 *       -H "Content-Type: application/json" \
 *       -d '{"email":"eu@gmail.com","role":"ADMIN"}' \
 *       https://iris.technowhub.ai/api/admin/users
 *
 * Util pra promover primeiro admin sem precisar de acesso DB shell.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-admin-secret") || "") === secret;
}

const RoleEnum = z.enum(["ADMIN", "OPERATOR", "VIEWER"]);
const SetRoleBody = z.object({
  email: z.string().email(),
  role: RoleEnum,
});

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      lastSeenAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ total: users.length, users });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = SetRoleBody.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const { email, role } = parsed.data;
  try {
    const user = await prisma.user.update({
      where: { email: email.toLowerCase() },
      data: { role },
      select: { id: true, email: true, role: true, name: true },
    });
    return NextResponse.json({ status: "updated", user });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const notFound = msg.includes("Record to update not found");
    return NextResponse.json(
      {
        error: notFound ? "user_not_found" : "db_error",
        message: notFound
          ? `Nenhum usuario com email '${email}' — verifique se ja logou pelo menos 1x via Google OAuth.`
          : msg,
      },
      { status: notFound ? 404 : 500 }
    );
  }
}
