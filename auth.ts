import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
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
