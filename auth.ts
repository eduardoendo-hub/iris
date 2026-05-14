import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

const ALLOWED_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
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
      if (ALLOWED_DOMAINS.length === 0) return true;
      const domain = user.email.split("@")[1]?.toLowerCase();
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
