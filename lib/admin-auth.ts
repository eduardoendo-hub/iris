/**
 * admin-auth — helper de autorizacao pros endpoints admin novos.
 *
 * Aceita 2 modos de auth:
 *   1. Sessao NextAuth com role=ADMIN (uso humano via UI)
 *   2. Header X-Admin-Secret = IRIS_WEBHOOK_SECRET (uso automacao/cURL)
 *
 * Retorna { authorized: true, mode, userId? } se ok, ou { authorized: false }.
 * Pra usar no inicio de cada handler.
 */
import { NextRequest } from "next/server";
import { auth } from "@/auth";

export type AdminAuthResult =
  | { authorized: true; mode: "session" | "secret"; userId?: string }
  | { authorized: false; reason: string };

export async function checkAdminAuth(req: NextRequest): Promise<AdminAuthResult> {
  // 1. X-Admin-Secret (automacao/cURL)
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  const headerSecret = req.headers.get("x-admin-secret");
  if (secret && headerSecret === secret) {
    return { authorized: true, mode: "secret" };
  }

  // 2. Sessao NextAuth com role=ADMIN
  const session = await auth();
  if (!session?.user) {
    return { authorized: false, reason: "no_session_and_no_secret" };
  }
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") {
    return { authorized: false, reason: `role_not_admin (got: ${role ?? "VIEWER"})` };
  }
  return {
    authorized: true,
    mode: "session",
    userId: (session.user as { id?: string }).id,
  };
}
