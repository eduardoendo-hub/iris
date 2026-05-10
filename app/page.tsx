import Image from "next/image";
import { Topbar } from "@/components/Topbar";
import { ProductSelector } from "@/components/ProductSelector";
import { KPICard } from "@/components/KPICard";
import { ChannelTable } from "@/components/ChannelTable";
import { CTAPositionTable } from "@/components/CTAPositionTable";
import { InsightItem } from "@/components/InsightItem";
import { LeadsTable } from "@/components/LeadsTable";
import { SalesTable } from "@/components/SalesTable";
import { SaleFormButton } from "@/components/SaleFormButton";
import { prisma } from "@/lib/prisma";
import {
  MOCK_PRODUCTS,
  MOCK_KPIS,
  MOCK_CHANNELS,
  MOCK_CTA_POSITION,
  MOCK_INSIGHTS,
} from "@/lib/mock-data";

export const dynamic = "force-dynamic";

type SearchParams = { product?: string };

export default async function CockpitPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const slug = params.product ?? "claude-pro";
  const productKey = slug as keyof typeof MOCK_KPIS;

  const kpi = MOCK_KPIS[productKey] ?? MOCK_KPIS["claude-pro"];
  const channels = MOCK_CHANNELS[productKey] ?? [];
  const ctaPositions = MOCK_CTA_POSITION[productKey] ?? [];

  // Dados reais — conta + ultimos N Leads recebidos via webhook do integracao-rd
  let leadsCount = 0;
  let leadsRecent: Array<{
    id: string; name: string | null; email: string | null; phone: string | null;
    eventType: string; rdCrmDealId: string | null; capturedAt: Date;
    utmSource: string | null; utmMedium: string | null; utmCampaign: string | null;
  }> = [];
  try {
    leadsCount = await prisma.lead.count({ where: { productSlug: slug } });
    leadsRecent = await prisma.lead.findMany({
      where: { productSlug: slug },
      orderBy: { capturedAt: "desc" },
      take: 20,
      select: {
        id: true, name: true, email: true, phone: true,
        eventType: true, rdCrmDealId: true, capturedAt: true,
        utmSource: true, utmMedium: true, utmCampaign: true,
      },
    });
  } catch {
    // DB nao disponivel ou tabela nao existe — segue com lista vazia
  }

  // Vendas — quantidade, acumulado e detalhe (Engaged + manual)
  let salesCount = 0;
  let salesTotal = 0;
  let sales: Array<{
    id: string; source: string;
    customerName: string; customerEmail: string | null; customerPhone: string | null;
    amount: number; currency: string; notes: string | null;
    saleDate: Date;
  }> = [];
  try {
    const agg = await prisma.sale.aggregate({
      where: { productSlug: slug },
      _sum: { amount: true },
      _count: { _all: true },
    });
    salesCount = agg._count._all;
    salesTotal = Number(agg._sum.amount ?? 0);
    const raw = await prisma.sale.findMany({
      where: { productSlug: slug },
      orderBy: { saleDate: "desc" },
      take: 50,
    });
    sales = raw.map((s) => ({
      id: s.id, source: s.source,
      customerName: s.customerName,
      customerEmail: s.customerEmail, customerPhone: s.customerPhone,
      amount: Number(s.amount), currency: s.currency,
      notes: s.notes, saleDate: s.saleDate,
    }));
  } catch {
    // tabela Sale nao existe ainda — segue com vazio
  }

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
            color: "var(--fg2)",
            fontWeight: 700,
          }}
        >
          Produto
        </span>
        <ProductSelector currentSlug={slug} products={[...MOCK_PRODUCTS]} />
      </div>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6 flex flex-col gap-6">
        <MockBanner />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard label="Leads recebidos"    value={leadsCount}  format="number"   hint="via formulário (RD CRM)" />
          <KPICard label="Vendas confirmadas" value={salesCount}  format="number"   hint="Engaged + manual" />
          <KPICard label="Receita acumulada"  value={salesTotal}  format="currency" hint={salesCount > 0 ? `ticket médio R$ ${(salesTotal / salesCount).toFixed(2).replace('.', ',')}` : "—"} />
          <KPICard label="Investimento (7d)"  value={kpi.cost}    delta={kpi.costDelta}  format="currency" />
        </div>

        {/* DADOS REAIS — Leads que chegaram no RD CRM via integracao-rd */}
        <LeadsTable leads={leadsRecent} totalCount={leadsCount} />

        {/* VENDAS — confirmadas (Engaged via webhook + manuais) */}
        <div className="flex items-center justify-between">
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>Vendas</h2>
          <SaleFormButton productSlug={slug} />
        </div>
        <SalesTable sales={sales} totalCount={salesCount} totalAmount={salesTotal} />

        {/* Bloco principal de tabelas: agora ocupa toda a largura.
            Espaço lateral fica livre pra futuras visualizacoes (graficos,
            tabelas adicionais, painel comercial, etc.). */}
        <div className="flex flex-col gap-6">
          <ChannelTable rows={[...channels]} />
          <CTAPositionTable rows={[...ctaPositions]} />
        </div>

        {/* Insights movidos pra abaixo de tudo, ocupando toda a largura.
            Cards do tipo InsightItem em grid responsivo (1 col mobile,
            2 cols tablet, 3 cols desktop). */}
        <section className="flex flex-col gap-3 mt-2">
          <h3
            className="px-1"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "var(--ls-eyebrow)",
              color: "var(--fg2)",
              fontWeight: 700,
            }}
          >
            Insights
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {MOCK_INSIGHTS.map((i) => (
              <InsightItem key={i.id} {...i} />
            ))}
          </div>
        </section>
      </main>

      <footer
        className="px-6 py-6 flex items-center justify-center gap-3"
        style={{ color: "var(--fg2)", fontSize: 11, borderTop: "1px solid var(--cockpit-border)", marginTop: 32 }}
      >
        <span style={{ letterSpacing: "var(--ls-eyebrow)", textTransform: "uppercase", fontWeight: 600, opacity: 0.7 }}>
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
