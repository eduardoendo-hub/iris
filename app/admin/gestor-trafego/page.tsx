/**
 * /admin/gestor-trafego — painel do Gestor de Tráfego IA.
 * Mostra "o que fazer hoje" (AgentRecommendation) + a carteira lado a lado
 * (snapshot calculado on-page, sem LLM). O botão "Atualizar análise" dispara
 * o ciclo completo (ingestão + LLM) via /api/admin/gestor-trafego/run.
 */
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Topbar } from "@/components/Topbar";
import { prisma } from "@/lib/prisma";
import { collectPortfolioSnapshot } from "@/lib/agent/collect-portfolio-data";
import { GestorTrafego, type RecItem, type IrisRow } from "@/components/GestorTrafego";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function GestorTrafegoPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/admin/gestor-trafego");
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") redirect("/admin");

  // Snapshot da carteira (só DB — barato; sem LLM).
  const snapshot = await collectPortfolioSnapshot();

  // Recomendações da análise mais recente.
  const latest = await prisma.agentRecommendation.findFirst({ orderBy: { date: "desc" }, select: { date: true } });
  let recs: RecItem[] = [];
  let analysisDate: string | null = null;
  if (latest) {
    const dayStart = latest.date;
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const rows = await prisma.agentRecommendation.findMany({
      where: { date: { gte: dayStart, lt: dayEnd } },
      orderBy: { createdAt: "asc" },
    });
    analysisDate = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(dayStart);
    recs = rows.map((r) => ({
      id: r.id,
      scope: r.scope,
      platform: r.platform,
      campaignRef: r.campaignRef,
      entityRef: r.entityRef,
      priority: r.priority,
      category: r.category,
      problem: r.problem,
      action: r.action,
      expectedImpact: r.expectedImpact,
      evidence: (r.evidence as Record<string, unknown> | null) ?? null,
      status: r.status,
    }));
  }

  const carteira: IrisRow[] = snapshot.campaigns.map((b) => ({
    name: b.name,
    productSlug: b.productSlug,
    status: b.status,
    goalCpl: b.goalCpl,
    spend7d: b.spend7d,
    spendMTD: b.spendMTD,
    visits7d: b.visits7d,
    leads7d: b.leads7d,
    cpl7d: b.cpl7d,
    cplVsGoalPct: b.cplVsGoalPct,
    visitsMTD: b.visitsMTD,
    leadsMTD: b.leadsMTD,
    cplMTD: b.cplMTD,
    children: b.children.map((c) => ({
      platform: c.platform,
      label: c.label,
      campaignName: c.campaignName,
      spend7d: c.spend7d,
      spendMTD: c.spendMTD,
      impressions7d: c.impressions7d,
      clicks7d: c.clicks7d,
      ctr7d: c.ctr7d,
      cpc7d: c.cpc7d,
      daysWithData: c.daysWithData,
    })),
  }));

  return (
    <>
      <Topbar />
      <main className="mx-auto max-w-6xl px-6 py-8">
        <GestorTrafego
          analysisDate={analysisDate}
          recommendations={recs}
          carteira={carteira}
          notes={snapshot.notes}
          totals={{
            irisCampaigns: snapshot.totals.irisCampaigns,
            platformCampaigns: snapshot.totals.platformCampaigns,
            spend7d: snapshot.totals.spend7d,
            spendMTD: snapshot.totals.spendMTD,
            leads7d: snapshot.totals.leads7d,
            leadsMTD: snapshot.totals.leadsMTD,
            blendedCpl: snapshot.totals.blendedCpl,
          }}
        />
      </main>
    </>
  );
}
