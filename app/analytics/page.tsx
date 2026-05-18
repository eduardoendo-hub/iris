import Image from "next/image";
import { Topbar } from "@/components/Topbar";
import { CampaignSelector, type CampaignOption } from "@/components/CampaignSelector";
import { TabNav } from "@/components/TabNav";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CaptacaoChart } from "@/components/CaptacaoChart";
import { VendasChart, VendasCountChart } from "@/components/VendasChart";
import { getDailyEvents, getDailySales } from "@/lib/analytics";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type SearchParams = { campaign?: string; product?: string; days?: string };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  // Mesma logica de selecao do cockpit
  let campaignOptions: CampaignOption[] = [];
  try {
    const all = await prisma.campaign.findMany({
      orderBy: [{ isActive: "desc" }, { startDate: "desc" }],
      select: { slug: true, name: true, productSlug: true, isActive: true },
    });
    campaignOptions = all.map((c) => ({
      slug: c.slug,
      name: c.name,
      productSlug: c.productSlug,
      isActive: c.isActive,
    }));
  } catch {
    // tabela nao existe ainda
  }
  const explicitCampaign = params.campaign
    ? campaignOptions.find((c) => c.slug === params.campaign)
    : null;
  const firstActive = campaignOptions.find((c) => c.isActive) ?? null;
  const selectedCampaign = explicitCampaign ?? firstActive ?? null;
  const slug = selectedCampaign?.productSlug ?? params.product ?? "claude-pro";
  const selectedCampaignSlug = selectedCampaign?.slug ?? null;

  const daysRaw = parseInt(params.days ?? "30", 10);
  const days = [10, 30, 60].includes(daysRaw) ? daysRaw : 30;

  const [events, sales] = await Promise.all([
    getDailyEvents({ productSlug: slug, days }),
    getDailySales({ productSlug: slug, days }),
  ]);

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar />

      <div
        className="px-6 py-3 flex items-center gap-3"
        style={{ borderBottom: "1px solid var(--cockpit-border)" }}
      >
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "var(--ls-eyebrow)",
            color: "var(--brand-soft)",
            fontWeight: 700,
          }}
        >
          Campanha
        </span>
        <CampaignSelector
          currentSlug={selectedCampaignSlug}
          campaigns={campaignOptions}
          basePath="/analytics"
        />
      </div>

      <TabNav active="analytics" productSlug={slug} campaignSlug={selectedCampaignSlug} />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6 flex flex-col gap-8">
        <div className="flex items-center justify-end">
          <PeriodSelector current={days} productSlug={slug} campaignSlug={selectedCampaignSlug} />
        </div>

        {/* CAPTAÇÃO */}
        <section className="flex flex-col gap-4">
          <header
            className="pb-2"
            style={{ borderBottom: "1px solid var(--cockpit-border)" }}
          >
            <span
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "var(--ls-eyebrow)",
                color: "var(--brand)",
                fontWeight: 700,
              }}
            >
              Captação
            </span>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--fg1)" }}>
              Eventos diários — escolha a métrica
            </h2>
          </header>
          <CaptacaoChart data={events} />
        </section>

        {/* VENDAS */}
        <section className="flex flex-col gap-4">
          <header
            className="pb-2"
            style={{ borderBottom: "1px solid var(--cockpit-border)" }}
          >
            <span
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "var(--ls-eyebrow)",
                color: "var(--brand)",
                fontWeight: 700,
              }}
            >
              Vendas
            </span>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--fg1)" }}>
              Receita e quantidade — diário e acumulado
            </h2>
          </header>
          <VendasChart data={sales} />
          <VendasCountChart data={sales} />
        </section>
      </main>

      <footer
        className="px-6 py-6 flex items-center justify-center gap-3"
        style={{
          color: "var(--fg2)",
          fontSize: 11,
          borderTop: "1px solid var(--cockpit-border)",
          marginTop: 32,
        }}
      >
        <span
          style={{
            letterSpacing: "var(--ls-eyebrow)",
            textTransform: "uppercase",
            fontWeight: 600,
            opacity: 0.7,
          }}
        >
          IRIS v0.1 · {new Date().getFullYear()} · powered by
        </span>
        <Image
          src="/logo-technow.png"
          alt="Tech Now"
          width={120}
          height={26}
          style={{ height: 22, width: "auto", opacity: 0.85 }}
        />
      </footer>
    </div>
  );
}
