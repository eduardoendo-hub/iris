/**
 * /admin/campaigns/[id] — edita campanha existente.
 */
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { Topbar } from "@/components/Topbar";
import { CampaignForm, type CampaignInitial } from "@/components/CampaignForm";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function EditCampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/admin/campaigns");
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") redirect("/admin");

  const { id } = await params;
  const c = await prisma.campaign.findUnique({ where: { id } });
  if (!c) notFound();

  const initial: CampaignInitial = {
    id: c.id,
    slug: c.slug,
    productSlug: c.productSlug,
    name: c.name,
    startDate: c.startDate.toISOString(),
    endDate: c.endDate.toISOString(),
    mediaBudget: c.mediaBudget ? Number(c.mediaBudget) : null,
    productionCostLP: c.productionCostLP ? Number(c.productionCostLP) : null,
    productionCostAds: c.productionCostAds ? Number(c.productionCostAds) : null,
    productionCostOther: c.productionCostOther ? Number(c.productionCostOther) : null,
    goalEnrollments: c.goalEnrollments,
    goalRevenue: c.goalRevenue ? Number(c.goalRevenue) : null,
    goalCac: c.goalCac ? Number(c.goalCac) : null,
    goalRoas: c.goalRoas ? Number(c.goalRoas) : null,
    goalCpl: c.goalCpl ? Number(c.goalCpl) : null,
    marketingPlan: c.marketingPlan,
    marketingPlanFilename: c.marketingPlanFilename,
    isActive: c.isActive,
  };

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
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--fg1)" }}>
              Editar: {c.name}
            </h1>
          </div>
          <Link
            href="/admin/campaigns"
            style={{ fontSize: 11, color: "var(--fg2)", textDecoration: "none" }}
          >
            ← voltar à lista
          </Link>
        </header>
        <CampaignForm initial={initial} />
      </main>
    </div>
  );
}
