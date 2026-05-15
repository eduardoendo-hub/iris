/**
 * /admin/campaigns/new — formulario de nova campanha.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Topbar } from "@/components/Topbar";
import { CampaignForm } from "@/components/CampaignForm";

export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/admin/campaigns/new");
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") redirect("/admin");

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar />
      <main className="flex-1 max-w-[1000px] w-full mx-auto px-6 py-6 flex flex-col gap-4">
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
              Admin · Campanhas
            </span>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--fg1)" }}>Nova campanha</h1>
          </div>
          <Link
            href="/admin/campaigns"
            style={{ fontSize: 11, color: "var(--fg2)", textDecoration: "none" }}
          >
            ← voltar à lista
          </Link>
        </header>
        <CampaignForm />
      </main>
    </div>
  );
}
