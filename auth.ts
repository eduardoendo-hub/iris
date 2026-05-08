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
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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
