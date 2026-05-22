/**
 * /admin/access — gerencia emails e dominios autorizados a logar.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Topbar } from "@/components/Topbar";
import { AccessManager } from "@/components/AccessManager";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AccessPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/admin/access");
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") redirect("/admin");

  const [emails, domains, campaigns] = await Promise.all([
    prisma.allowedEmail.findMany({
      orderBy: { addedAt: "desc" },
      include: {
        allowedCampaigns: {
          select: { campaignSlug: true },
          orderBy: { campaignSlug: "asc" },
        },
      },
    }),
    prisma.allowedDomain.findMany({ orderBy: { addedAt: "desc" } }),
    prisma.campaign.findMany({
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      select: { slug: true, name: true, productSlug: true, isActive: true },
    }),
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar />
      <main className="flex-1 max-w-[1200px] w-full mx-auto px-6 py-6 flex flex-col gap-4">
        <header
          className="flex items-baseline justify-between flex-wrap gap-3 pb-2"
          style={{ borderBottom: "1px solid var(--cockpit-border-strong)" }}
        >
          <div
            className="flex items-baseline gap-3"
            style={{ paddingLeft: 12, position: "relative" }}
          >
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                top: 1,
                bottom: 1,
                width: 3,
                borderRadius: 2,
                background: "var(--brand)",
              }}
            />
            <span
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "var(--ls-eyebrow)",
                color: "var(--brand)",
                fontWeight: 800,
              }}
            >
              Admin
            </span>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--fg1)" }}>
              Acessos autorizados
            </h1>
          </div>
          <Link
            href="/admin"
            style={{ fontSize: 11, color: "var(--fg2)", textDecoration: "none" }}
          >
            ← admin
          </Link>
        </header>

        <p style={{ fontSize: 12, color: "var(--fg2)", lineHeight: 1.5 }}>
          Cadastre emails individuais (ex: contas Gmail pessoais) ou domínios inteiros (ex:{" "}
          <code>impacta.com.br</code>) autorizados a logar no IRIS via Google OAuth.
          Para emails, é possível restringir a quais campanhas o usuário tem acesso.
          Sem nenhuma campanha selecionada → vê todas (admin).
        </p>

        <AccessManager
          initialEmails={emails.map((e) => ({
            id: e.id,
            email: e.email,
            note: e.note,
            addedAt: e.addedAt.toISOString(),
            campaignSlugs: e.allowedCampaigns.map((c) => c.campaignSlug),
          }))}
          initialDomains={domains.map((d) => ({
            id: d.id,
            domain: d.domain,
            note: d.note,
            addedAt: d.addedAt.toISOString(),
          }))}
          allCampaigns={campaigns.map((c) => ({
            slug: c.slug,
            name: c.name,
            productSlug: c.productSlug,
            isActive: c.isActive,
          }))}
        />
      </main>
    </div>
  );
}
