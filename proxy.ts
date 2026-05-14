/**
 * proxy.ts — middleware de autenticacao do IRIS (Next.js 16 renomeou
 * middleware.ts pra proxy.ts).
 *
 * NextAuth v5 com session.strategy="database" NAO funciona no middleware
 * (edge runtime) pq edge nao consegue conectar no Postgres pra validar
 * sessao. Por isso aqui fazemos APENAS uma checagem de "tem cookie de
 * sessao?". A validacao completa (sessao expirada/invalidada) acontece
 * no server component via `await auth()`.
 *
 * Logica:
 *   1. Path eh PUBLIC_ROUTES → libera.
 *   2. Path eh /api/cron/* → exige X-Cron-Secret valido senao 401.
 *   3. IRIS_PUBLIC_PREVIEW=true → libera tudo (so usar em dev/preview!).
 *   4. Senao → se nao tem cookie de sessao NextAuth, redirect 307 pra /login
 *      mantendo intent do destino original em ?from=.
 *
 * ⚠️ PROD: IRIS_PUBLIC_PREVIEW DEVE estar removido/false. Ver docs/SECURITY.md
 */
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = [
  "/login",
  "/api/auth", // NextAuth handlers (callbacks OAuth, signin, signout)
  "/api/health", // healthcheck Coolify
  "/api/webhook", // HMAC/Bearer auth interno
  "/api/debug", // X-Admin-Secret auth interno
  "/api/admin", // X-Admin-Secret auth interno
  "/api/events", // CORS-protected (LP push)
];

// Cookies que NextAuth v5 usa pra sessao (depende de HTTPS, prefixos)
// Em HTTPS prod o nome eh "__Secure-authjs.session-token".
// Pra compat com v4 e dev local, checamos varios.
const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "__Secure-next-auth.session-token",
  "next-auth.session-token",
];

function hasSessionCookie(req: NextRequest): boolean {
  return SESSION_COOKIE_NAMES.some((name) => req.cookies.has(name));
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 1. Public routes
  if (PUBLIC_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"))) {
    return NextResponse.next();
  }

  // 2. Cron — exige X-Cron-Secret valido
  if (pathname.startsWith("/api/cron")) {
    const secret = req.headers.get("x-cron-secret");
    if (secret !== process.env.CRON_SECRET) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
    return NextResponse.next();
  }

  // 3. Preview mode (BYPASS — so dev)
  if (process.env.IRIS_PUBLIC_PREVIEW === "true") {
    return NextResponse.next();
  }

  // 4. UI — exige sessao
  if (!hasSessionCookie(req)) {
    const loginUrl = new URL("/login", req.url);
    if (pathname !== "/") loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)",
  ],
};
