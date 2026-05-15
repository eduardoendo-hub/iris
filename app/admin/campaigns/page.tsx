/**
 * /admin/campaigns — lista todas as campanhas + atalho pra criar/editar.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Topbar } from "@/components/Topbar";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function fmtDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function fmtBRL(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);
}

export default async function CampaignsListPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/admin/campaigns");
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") redirect("/admin");

  const campaigns = await prisma.campaign.findMany({
    orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
  });

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar />
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6 flex flex-col gap-4">
        <header className="flex items-baseline justify-between flex-wrap gap-3 pb-2"
          style={{ borderBottom: "1px solid var(--cockpit-border-strong)" }}>
          <div className="flex items-baseline gap-3" style={{ paddingLeft: 12, position: "relative" }}>
            <span aria-hidden style={{
              position: "absolute", left: 0, top: 1, bottom: 1, width: 3,
              borderRadius: 2, background: "var(--brand)",
            }} />
            <span style={{
              fontSize: 10, textTransform: "uppercase",
              letterSpacing: "var(--ls-eyebrow)", color: "var(--brand)", fontWeight: 800,
            }}>Admin</span>
            <h1 style={{ fontSize: 16, fontWeight: 700, color: "var(--fg1)" }}>Campanhas</h1>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/admin" style={{ fontSize: 11, color: "var(--fg2)", textDecoration: "none" }}>← admin</Link>
            <Link href="/admin/campaigns/new"
              style={{
                fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 6,
                background: "var(--brand)", color: "var(--fg-on-brand)",
                textDecoration: "none",
              }}>+ Nova campanha</Link>
          </div>
        </header>

        {campaigns.length === 0 ? (
          <div className="rounded-xl px-5 py-10 text-center"
            style={{
              background: "var(--cockpit-card)",
              border: "1px dashed var(--cockpit-border)",
              color: "var(--fg2)", fontSize: 14,
            }}>
            Nenhuma campanha cadastrada ainda.{" "}
            <Link href="/admin/campaigns/new" style={{ color: "var(--brand)", fontWeight: 600 }}>
              Criar a primeira
            </Link>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden"
            style={{ background: "var(--cockpit-card)", border: "1px solid var(--cockpit-border)" }}>
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{
                  fontSize: 10, textTransform: "uppercase",
                  letterSpacing: "var(--ls-eyebrow)", color: "var(--brand-soft)", fontWeight: 700,
                }}>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-left px-4 py-2.5">Nome</th>
                  <th className="text-left px-4 py-2.5">Produto</th>
                  <th className="text-left px-4 py-2.5">Período</th>
                  <th className="text-right px-4 py-2.5">Mídia</th>
                  <th className="text-right px-4 py-2.5">Matrículas</th>
                  <th className="text-right px-4 py-2.5">Receita</th>
                  <th className="text-left px-4 py-2.5">ROAS</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--cockpit-border)", fontSize: 13 }}>
                    <td className="px-4 py-3">
                      {c.isActive ? (
                        <span style={{
                          fontSize: 10, fontWeight: 700, padding: "2px 8px",
                          borderRadius: 4, background: "rgba(48,209,88,0.15)", color: "#30D158",
                          textTransform: "uppercase", letterSpacing: "0.05em",
                        }}>Ativa</span>
                      ) : (
                        <span style={{ color: "var(--fg2)", fontSize: 11 }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--fg1)", fontWeight: 600 }}>
                      {c.name}
                      <div style={{ fontSize: 10, color: "var(--fg2)", fontFamily: "var(--font-mono)" }}>
                        {c.slug}
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--fg1)", fontSize: 12, fontFamily: "var(--font-mono)" }}>
                      {c.productSlug}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--fg1)", fontSize: 12, fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>
                      {fmtDate(c.startDate)} → {fmtDate(c.endDate)}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: "var(--fg1)", fontFamily: "var(--font-mono)" }}>
                      {fmtBRL(c.mediaBudget ? Number(c.mediaBudget) : null)}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: "var(--fg1)", fontFamily: "var(--font-mono)" }}>
                      {c.goalEnrollments ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ color: "var(--fg1)", fontFamily: "var(--font-mono)" }}>
                      {fmtBRL(c.goalRevenue ? Number(c.goalRevenue) : null)}
                    </td>
                    <td className="px-4 py-3" style={{ color: "var(--fg1)", fontFamily: "var(--font-mono)" }}>
                      {c.goalRoas ? `${Number(c.goalRoas).toFixed(1)}×` : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/admin/campaigns/${c.id}`}
                        style={{ fontSize: 11, color: "var(--brand)", fontWeight: 600, textDecoration: "none" }}>
                        editar →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
