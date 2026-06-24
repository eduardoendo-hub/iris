/**
 * /admin/channel-groups — regra global de agrupamento de canais (Orgânico,
 * Meta, Google, Mailing, Portal, ...) usada na tabela "Por fonte (UTM)".
 */
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Topbar } from "@/components/Topbar";
import { prisma } from "@/lib/prisma";
import { ChannelGroupManager, type GroupItem } from "@/components/ChannelGroupManager";

export const dynamic = "force-dynamic";

export default async function ChannelGroupsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/admin/channel-groups");
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") redirect("/admin");

  const rows = await prisma.channelGroup.findMany({ orderBy: { ordem: "asc" } });
  const items: GroupItem[] = rows.map((g) => ({
    id: g.id,
    name: g.name,
    ordem: g.ordem,
    color: g.color,
    sources: g.sources,
    mediums: g.mediums,
    matchEmptySource: g.matchEmptySource,
  }));

  return (
    <>
      <Topbar />
      <main className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-bold">Grupos de canal</h1>
        <p className="mb-6 text-sm opacity-70">
          Regra global que classifica o tráfego da LP em grupos de negócio (Orgânico, Meta, Google, Mailing,
          Portal…) a partir do utm_source/utm_medium. Vale pra TODAS as campanhas e alimenta o agrupamento da
          tabela “Por fonte (UTM)” no cockpit.
        </p>
        <ChannelGroupManager initial={items} />
      </main>
    </>
  );
}
