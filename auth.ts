import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const ALLOWED_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

// Whitelist de emails individuais (alem dos dominios). Util pra admin com
// conta pessoal Gmail/Outlook sem abrir o dominio inteiro pra qualquer um.
// Formato: "user1@gmail.com,user2@outlook.com" (separados por virgula).
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAIL_ADDRESSES ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Atras de reverse proxy (Coolify/Traefik) — confiar nos headers
  // X-Forwarded-Host/Proto. Sem isso, callback OAuth retorna 400 generico
  // "Server error - There is a problem with the server configuration."
  trustHost: true,
  // Debug logs em dev/preview. Em prod fica desligado pra nao vazar info.
  debug: process.env.NODE_ENV !== "production",
  // Secret explicito — NextAuth v5 procura AUTH_SECRET por default mas
  // suportamos NEXTAUTH_SECRET pra compat com setup atual.
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET,
    }),
    // Magic link por email (sem senha) — pra quem não tem conta Google.
    // Envio via API HTTP do Resend (porta 443) porque a Hetzner bloqueia SMTP
    // de saída. A whitelist no callback signIn roda ANTES do envio, então
    // email fora da lista nem recebe o link.
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
      async sendVerificationRequest({ identifier: to, url, provider }) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: provider.from,
            to,
            subject: "Seu link de acesso ao IRIS",
            text: `Acesse o IRIS por este link (expira em 24h):\n${url}\n\nSe você não solicitou, ignore este email.`,
            html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
  <h2 style="color:#111">IRIS · TechNow Cockpit</h2>
  <p>Clique no botão abaixo para entrar. O link expira em 24h.</p>
  <p style="margin:24px 0">
    <a href="${url}" style="background:#0fb9b1;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">Entrar no IRIS</a>
  </p>
  <p style="color:#666;font-size:13px">Se o botão não funcionar, copie e cole este endereço:<br>${url}</p>
  <p style="color:#999;font-size:12px">Se você não solicitou este acesso, ignore este email.</p>
</div>`,
          }),
        });
        if (!res.ok) {
          throw new Error("Resend error: " + JSON.stringify(await res.json()));
        }
      },
    }),
  ],
  session: { strategy: "database" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const email = user.email.toLowerCase();
      const domain = email.split("@")[1];

      // Fontes de whitelist (em ordem de prioridade):
      //   1. DB (AllowedEmail / AllowedDomain) — gerenciavel via /admin
      //   2. env ALLOWED_EMAIL_ADDRESSES / ALLOWED_EMAIL_DOMAINS — fallback inicial
      // Se TODAS estiverem vazias → permite (modo dev/aberto).

      // 1. DB checks
      try {
        const [dbEmail, dbDomain] = await Promise.all([
          prisma.allowedEmail.findUnique({ where: { email } }),
          domain ? prisma.allowedDomain.findUnique({ where: { domain } }) : null,
        ]);
        if (dbEmail) return true;
        if (dbDomain) return true;
        // Se a tabela tem registros mas nenhum bate, bloqueia (DB e o source of truth)
        const [emailCount, domainCount] = await Promise.all([
          prisma.allowedEmail.count(),
          prisma.allowedDomain.count(),
        ]);
        if (emailCount > 0 || domainCount > 0) {
          return false;
        }
      } catch {
        // DB nao acessivel — cai pro fallback env
      }

      // 2. env fallback
      if (ALLOWED_DOMAINS.length === 0 && ALLOWED_EMAILS.length === 0) return true;
      if (ALLOWED_EMAILS.includes(email)) return true;
      return Boolean(domain && ALLOWED_DOMAINS.includes(domain));
    },
    async session({ session, user }) {
      if (session.user) {
        (session.user as typeof session.user & { id: string; role: string }).id = user.id;
        (session.user as typeof session.user & { id: string; role: string }).role =
          (user as typeof user & { role?: string }).role ?? "VIEWER";
      }
      return session;
    },
  },
});
