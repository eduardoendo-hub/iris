/**
 * /admin/tracked-campaigns — registro das campanhas de mídia paga (Meta + Google)
 * que o Gestor de Tráfego IA acompanha. Substitui a config no código.
 */
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Topbar } from "@/components/Topbar";
import { prisma } from "@/lib/prisma";
import { TrackedCampaignManager, type TrackedItem } from "@/components/TrackedCampaignManager";

export const dynamic = "force-dynamic";

export default async function TrackedCampaignsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/admin/tracked-campaigns");
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") redirect("/admin");

  const rows = await prisma.trackedCampaign.findMany({
    orderBy: [{ active: "desc" }, { platform: "asc" }, { createdAt: "desc" }],
  });

  const items: TrackedItem[] = rows.map((i) => ({
    id: i.id,
    platform: i.platform,
    accountId: i.accountId,
    externalId: i.externalId,
    nameFilter: i.nameFilter,
    utmCampaign: i.utmCampaign,
    productSlug: i.productSlug,
    label: i.label,
    objective: i.objective,
    targetCpl: i.targetCpl != null ? Number(i.targetCpl) : null,
    targetRoas: i.targetRoas != null ? Number(i.targetRoas) : null,
    active: i.active,
  }));

  return (
    <>
      <Topbar />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-bold">Campanhas rastreadas</h1>
        <p className="mb-6 text-sm opacity-70">
          As campanhas de mídia paga (Meta + Google) que o Gestor de Tráfego IA analisa
          todo dia. O ID da campanha dá atribuição precisa; o filtro por nome é a
          alternativa. A meta de CPL alimenta as regras de recomendação.
        </p>
        <TrackedCampaignManager initial={items} />
      </main>
    </>
  );
}
