/**
 * /api/debug/auth — diagnostico de configuracao do NextAuth.
 *
 * Mostra (sem expor secrets) se cada env esta:
 *   - presente
 *   - tem tamanho razoavel
 *   - tem prefixo/sufixo esperado (.apps.googleusercontent.com etc)
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * Util quando login retorna "Server error" generico.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-admin-secret") || "") === secret;
}

function describe(value: string | undefined, expectedSuffix?: string): {
  present: boolean;
  length: number;
  startsWith: string;
  endsWith: string;
  suffixOk?: boolean;
  whitespaceWarning?: boolean;
} {
  if (!value) return { present: false, length: 0, startsWith: "", endsWith: "" };
  const trimmed = value.trim();
  return {
    present: true,
    length: value.length,
    startsWith: value.slice(0, 8),
    endsWith: value.slice(-6),
    ...(expectedSuffix
      ? { suffixOk: value.endsWith(expectedSuffix) }
      : {}),
    whitespaceWarning: value.length !== trimmed.length || /["']/.test(value.slice(0, 1)),
  };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    NEXTAUTH_SECRET: describe(process.env.NEXTAUTH_SECRET),
    AUTH_SECRET: describe(process.env.AUTH_SECRET),
    NEXTAUTH_URL: describe(process.env.NEXTAUTH_URL),
    AUTH_URL: describe(process.env.AUTH_URL),
    GOOGLE_CLIENT_ID: describe(process.env.GOOGLE_CLIENT_ID, ".apps.googleusercontent.com"),
    AUTH_GOOGLE_ID: describe(process.env.AUTH_GOOGLE_ID, ".apps.googleusercontent.com"),
    GOOGLE_CLIENT_SECRET: describe(process.env.GOOGLE_CLIENT_SECRET),
    AUTH_GOOGLE_SECRET: describe(process.env.AUTH_GOOGLE_SECRET),
    ALLOWED_EMAIL_DOMAINS: describe(process.env.ALLOWED_EMAIL_DOMAINS),
    NODE_ENV: process.env.NODE_ENV,
    expected_callback_url: "https://iris.technowhub.ai/api/auth/callback/google",
    notes: [
      "Confira no Google Cloud Console se a Authorized Redirect URI bate EXATAMENTE com expected_callback_url",
      "AUTH_SECRET deve ter >= 32 chars (use: openssl rand -hex 32)",
      "GOOGLE_CLIENT_ID deve terminar com .apps.googleusercontent.com",
      "Se whitespaceWarning=true em algum, env tem espaco/aspas extras no Coolify",
    ],
  });
}
