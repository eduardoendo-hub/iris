import { Topbar } from "@/components/Topbar";
import { KPICard } from "@/components/KPICard";
import { ChannelTable } from "@/components/ChannelTable";
import { CTAPositionTable } from "@/components/CTAPositionTable";
import { InsightItem } from "@/components/InsightItem";
import {
  MOCK_PRODUCTS,
  MOCK_KPIS,
  MOCK_CHANNELS,
  MOCK_CTA_POSITION,
  MOCK_INSIGHTS,
} from "@/lib/mock-data";

type SearchParams = { product?: string };

export default async function CockpitPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const slug = params.product ?? "direito5";
  const productKey = slug as keyof typeof MOCK_KPIS;

  const kpi = MOCK_KPIS[productKey] ?? MOCK_KPIS.direito5;
  const channels = MOCK_CHANNELS[productKey] ?? [];
  const ctaPositions = MOCK_CTA_POSITION[productKey] ?? [];

  return (
    <div className="min-h-screen flex flex-col">
      <Topbar productSlug={slug} products={[...MOCK_PRODUCTS]} />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-8 flex flex-col gap-6">
        <MockBanner />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Visitas (7d)"     value={kpi.sessions}   delta={kpi.sessionsDelta}   format="number" />
          <KPICard label="Cliques no CTA"   value={kpi.ctaClicks}  delta={kpi.ctaClicksDelta}  format="number" />
          <KPICard label="Taxa de conversão" value={kpi.ctr}       delta={kpi.ctrDelta}        format="percent" hint="cliques / visitas" />
          <KPICard label="Investimento (7d)" value={kpi.cost}      delta={kpi.costDelta}       format="currency" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <ChannelTable rows={[...channels]} />
            <CTAPositionTable rows={[...ctaPositions]} />
          </div>

          <aside className="flex flex-col gap-3">
            <h3 className="px-1" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--fg2)", fontWeight: 700 }}>
              Insights
            </h3>
            {MOCK_INSIGHTS.map((i) => (
              <InsightItem key={i.id} {...i} />
            ))}
          </aside>
        </div>
      </main>

      <footer className="px-6 py-4 text-center" style={{ color: "var(--fg2)", fontSize: 11 }}>
        IRIS v0.1 · TechNow Hub · {new Date().getFullYear()}
      </footer>
    </div>
  );
}

function MockBanner() {
  return (
    <div
      className="rounded-md px-4 py-2 flex items-center gap-3"
      style={{
        background: "var(--status-warn-bg)",
        border: "1px solid var(--status-warn)",
        fontSize: 12,
        color: "var(--fg1)",
      }}
    >
      <span style={{ fontWeight: 700, color: "var(--status-warn)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", fontSize: 10 }}>
        Mock
      </span>
      <span>Dados simulados. Conector GA4 + Google Ads entra após service account JSON e dev token.</span>
    </div>
  );
}
