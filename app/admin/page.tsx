/**
 * /admin — pagina principal de administracao.
 *
 * Acesso: sessao com role=ADMIN (verificado no server component).
 * Layout: cabecalho + 2 cards de atalho (Campanhas, Acessos).
 *
 * Pra adicionar uma nova area de admin, basta criar route abaixo
 * (ex: /admin/users) e linkar daqui.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Topbar } from "@/components/Topbar";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?from=/admin");
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") {
    return (
      <div className="min-h-screen flex flex-col">
        <Topbar />
        <main className="flex-1 max-w-[1000px] w-full mx-auto px-6 py-12">
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--fg1)" }}>
            Acesso negado
          </h1>
          <p style={{ fontSize: 14, color: "var(--fg2)", marginTop: 8 }}>
            Você está logado mas seu role é <code>{role ?? "VIEWER"}</code>. Esta página exige
            role <code>ADMIN</code>. Fale com o administrador do IRIS.
          </p>
        </main>
      </div>
    );
  }

  // Contadores rapidos pros cards
  const [campaignsCount, activeCampaigns, allowedEmails, allowedDomains, trackedActive, openRecs, channelGroups] = await Promise.all([
    prisma.campaign.count(),
    prisma.campaign.count({ where: { isActive: true } }),
    prisma.allowedEmail.count(),
    prisma.allowedDomain.count(),
    prisma.trackedCampaign.count({ where: { active: true } }),
    prisma.agentRecommendation.count({ where: { status: "OPEN" } }),
    prisma.channelGroup.count(),
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar />
      <main className="flex-1 max-w-[1200px] w-full mx-auto px-6 py-6 flex flex-col gap-5">
        <header
          className="flex items-end justify-between pb-2"
          style={{ borderBottom: "1px solid var(--cockpit-border-strong)" }}
        >
          <div className="flex items-baseline gap-3" style={{ paddingLeft: 12, position: "relative" }}>
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
              Configurações do IRIS
            </h1>
          </div>
          <Link
            href="/"
            style={{
              fontSize: 11,
              color: "var(--fg2)",
              textDecoration: "none",
              textTransform: "uppercase",
              letterSpacing: "var(--ls-eyebrow)",
              fontWeight: 600,
            }}
          >
            ← voltar ao cockpit
          </Link>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AdminCard
            href="/admin/campaigns"
            title="Campanhas"
            subtitle={`${activeCampaigns} ativa${activeCampaigns === 1 ? "" : "s"} · ${campaignsCount} total`}
            description="Nome, datas, investimentos, metas (matrículas, receita, CAC, ROAS, CPL) e plano de marketing por campanha."
          />
          <AdminCard
            href="/admin/access"
            title="Acessos"
            subtitle={`${allowedEmails} email${allowedEmails === 1 ? "" : "s"} · ${allowedDomains} domínio${allowedDomains === 1 ? "" : "s"}`}
            description="Emails individuais e domínios autorizados a logar no IRIS via Google OAuth."
          />
          <AdminCard
            href="/admin/gestor-trafego"
            title="Gestor de Tráfego"
            subtitle={`${openRecs} recomendaç${openRecs === 1 ? "ão" : "ões"} aberta${openRecs === 1 ? "" : "s"}`}
            description="O agente de mídia paga: olha todas as campanhas ativas (Meta + Google) e entrega o que fazer hoje, priorizado e com o número que justifica."
          />
          <AdminCard
            href="/admin/tracked-campaigns"
            title="Campanhas rastreadas"
            subtitle={`${trackedActive} ativa${trackedActive === 1 ? "" : "s"}`}
            description="Visão global (read-only) das campanhas de mídia atreladas. O vínculo é feito dentro de cada campanha → seção Mídia paga."
          />
          <AdminCard
            href="/admin/channel-groups"
            title="Grupos de canal"
            subtitle={`${channelGroups} grupo${channelGroups === 1 ? "" : "s"}`}
            description="Regra global Orgânico/Meta/Google/Mailing/Portal por utm_source/medium. Agrupa a tabela 'Por fonte (UTM)' do cockpit."
          />
        </div>

        <div
          className="rounded-xl px-4 py-3"
          style={{
            background: "var(--cockpit-card)",
            border: "1px solid var(--cockpit-border)",
            fontSize: 12,
            color: "var(--fg2)",
            lineHeight: 1.5,
          }}
        >
          <strong style={{ color: "var(--fg1)" }}>Logado como:</strong>{" "}
          {session.user.email} · role <code>{role}</code>
        </div>
      </main>
    </div>
  );
}

function AdminCard({
  href,
  title,
  subtitle,
  description,
}: {
  href: string;
  title: string;
  subtitle: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl p-5 flex flex-col gap-2"
      style={{
        background: "var(--cockpit-card)",
        border: "1px solid var(--cockpit-border)",
        textDecoration: "none",
        transition: "border-color 0.15s",
      }}
    >
      <div className="flex items-baseline justify-between">
        <span
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "var(--ls-eyebrow)",
            color: "var(--brand)",
            fontWeight: 700,
          }}
        >
          {title}
        </span>
        <span style={{ fontSize: 11, color: "var(--fg2)", fontFamily: "var(--font-mono)" }}>
          {subtitle}
        </span>
      </div>
      <p style={{ fontSize: 13, color: "var(--fg1)", lineHeight: 1.5 }}>{description}</p>
      <span style={{ fontSize: 11, color: "var(--brand)", fontWeight: 600, marginTop: 4 }}>
        gerenciar →
      </span>
    </Link>
  );
}
