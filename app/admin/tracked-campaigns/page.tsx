/**
 * /admin/tracked-campaigns — VISÃO GLOBAL (read-only) de todas as campanhas de
 * mídia rastreadas, agrupadas pela campanha da IRIS a que estão atreladas.
 *
 * O cadastro/vínculo é feito na tela de cada campanha (/admin/campaigns/[id] →
 * seção "Mídia paga"). Aqui é só consulta.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Topbar } from "@/components/Topbar";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TrackedCampaignsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/admin/tracked-campaigns");
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") redirect("/admin");

  const rows = await prisma.trackedCampaign.findMany({
    orderBy: [{ active: "desc" }, { platform: "asc" }, { createdAt: "desc" }],
    include: { campaign: { select: { id: true, name: true, slug: true } } },
  });

  // Agrupa por campanha da IRIS (ou "sem vínculo").
  const groups = new Map<string, { name: string; campaignId: string | null; items: typeof rows }>();
  for (const r of rows) {
    const key = r.campaign?.id ?? "__none__";
    if (!groups.has(key)) {
      groups.set(key, { name: r.campaign?.name ?? "Sem vínculo (atrele numa campanha)", campaignId: r.campaign?.id ?? null, items: [] });
    }
    groups.get(key)!.items.push(r);
  }
  const ordered = Array.from(groups.values()).sort((a, b) => (a.campaignId === null ? 1 : b.campaignId === null ? -1 : a.name.localeCompare(b.name)));

  return (
    <>
      <Topbar />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <h1 className="mb-1 text-2xl font-bold">Campanhas de mídia rastreadas</h1>
        <p className="mb-6 text-sm opacity-70">
          Visão geral (somente leitura) das campanhas de Meta/Google que o Gestor de Tráfego acompanha,
          agrupadas pela campanha da IRIS. Para vincular ou editar, abra a campanha em{" "}
          <Link href="/admin/campaigns" className="text-blue-400 hover:underline">Campanhas</Link> → seção “Mídia paga”.
        </p>

        {rows.length === 0 ? (
          <p className="text-sm opacity-60">Nenhuma campanha de mídia rastreada ainda.</p>
        ) : (
          <div className="flex flex-col gap-5">
            {ordered.map((g) => (
              <div key={g.campaignId ?? "none"} className="overflow-hidden rounded-xl border border-white/10">
                <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.03] px-4 py-2">
                  <span className="font-semibold">{g.name}</span>
                  {g.campaignId ? (
                    <Link href={`/admin/campaigns/${g.campaignId}`} className="text-xs text-blue-400 hover:underline">
                      abrir campanha →
                    </Link>
                  ) : (
                    <span className="text-xs text-yellow-400/70">precisa de vínculo</span>
                  )}
                </div>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase opacity-50">
                    <tr>
                      <th className="px-4 py-2">Plat.</th>
                      <th className="px-4 py-2">Nome</th>
                      <th className="px-4 py-2">ID / utm_campaign</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((i) => (
                      <tr key={i.id} className="border-t border-white/5">
                        <td className="px-4 py-2">{i.platform === "META" ? "Meta" : "Google"}</td>
                        <td className="px-4 py-2 font-medium">{i.label}</td>
                        <td className="px-4 py-2 opacity-70">
                          {i.externalId ?? "—"}
                          {i.utmCampaign ? ` · utm=${i.utmCampaign}` : ""}
                        </td>
                        <td className="px-4 py-2">
                          <span className={"rounded-full px-2 py-0.5 text-xs font-semibold " + (i.active ? "bg-green-500/15 text-green-400" : "bg-white/10 text-white/50")}>
                            {i.active ? "Ativa" : "Pausada"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
