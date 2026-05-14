/**
 * proxy.ts — middleware de autenticacao do IRIS (Next.js 16 renomeou
 * middleware.ts pra proxy.ts).
 *
 * Toda request bate aqui antes do handler. Logica:
 *
 *   1. Path eh PUBLIC_ROUTES → libera (login, auth callbacks, admin/cron/
 *      webhook que tem seu proprio header de auth, health, events).
 *   2. Path eh /api/cron/* → exige X-Cron-Secret valido senao 401.
 *   3. IRIS_PUBLIC_PREVIEW=true → libera tudo (so usar em dev/preview!).
 *   4. Senao → se nao tem req.auth (sessao NextAuth), redirect pra /login
 *      mantendo intent do destino original em ?from=.
 *
 * ⚠️ PROD: IRIS_PUBLIC_PREVIEW DEVE estar removido/false. Ver docs/SECURITY.md
 */
import { auth } from "@/auth";
import { NextResponse } from "next/server";

const PUBLIC_ROUTES = [
  "/login",
  "/api/auth", // NextAuth handlers
  "/api/health", // healthcheck Coolify
  "/api/webhook", // HMAC/Bearer auth interno
  "/api/debug", // X-Admin-Secret auth interno
  "/api/admin", // X-Admin-Secret auth interno
  "/api/events", // CORS-protected (LP push)
];

const PUBLIC_PREVIEW = process.env.IRIS_PUBLIC_PREVIEW === "true";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/cron")) {
    const secret = req.headers.get("x-cron-secret");
    if (secret !== process.env.CRON_SECRET) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    return NextResponse.next();
  }

  if (PUBLIC_PREVIEW) {
    return NextResponse.next();
  }

  if (!req.auth) {
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
