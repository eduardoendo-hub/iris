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
import {
  CartIcon,
  WhatsAppIcon,
  ConsultorIcon,
  VisitsIcon,
  ConversionIcon,
  WalletIcon,
  SalesIcon,
  RevenueIcon,
} from "@/components/icons";
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

  // Métricas de captação derivadas dos mocks (substituídas por dados reais
  // assim que GA4/Meta/Google plug a partir de 11/05).
  const visitsLP = (kpi as { visitsLP?: number }).visitsLP ?? kpi.sessions ?? 0;
  const clicksCompra = (kpi as { clicksCompra?: number }).clicksCompra ?? 0;
  const clicksWhats = (kpi as { clicksWhats?: number }).clicksWhats ?? 0;
  const clicksConsultor = (kpi as { clicksConsultor?: number }).clicksConsultor ?? 0;
  const totalClicksCompras = clicksCompra; // pra taxa
  const taxaConv =
    visitsLP > 0 ? (totalClicksCompras / visitsLP) * 100 : 0;
  const mediaInvestment =
    (kpi as { mediaInvestment?: number }).mediaInvestment ?? kpi.cost ?? 0;

  // Dados reais — Leads recebidos via webhook do integracao-rd
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
    // DB nao disponivel — segue com lista vazia
  }

  // Vendas — total + breakdown por origem (Diretas/Consultor/Engaged) + detalhes
  let salesCount = 0;
  let salesTotal = 0;
  let salesByDireta = 0;
  let salesByConsultor = 0;
  let salesByEngaged = 0;
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

    const grouped = await prisma.sale.groupBy({
      by: ["source"],
      where: { productSlug: slug },
      _count: { _all: true },
    });
    for (const g of grouped) {
      if (g.source === "DIRETA") salesByDireta = g._count._all;
      else if (g.source === "CONSULTOR") salesByConsultor = g._count._all;
      else if (g.source === "ENGAGED") salesByEngaged = g._count._all;
      else salesByDireta += g._count._all; // MANUAL/OTHER caem em "Direta" pra simplificar visao
    }

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
    // tabela Sale nao existe ainda
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
            color: "var(--brand-soft)",
            fontWeight: 700,
            opacity: 0.95,
          }}
        >
          Produto
        </span>
        <ProductSelector currentSlug={slug} products={[...MOCK_PRODUCTS]} />
      </div>

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6 flex flex-col gap-8">
        <MockBanner />

        {/* ───────────────────────────────────────────────
            SEÇÃO 1 — CAPTAÇÃO
            6 KPIs: Visitas LP · Clicks compra · Clicks Whats ·
            Clicks Consultor · Taxa Conv. · Investimento mídia
           ─────────────────────────────────────────────── */}
        <Section
          eyebrow="Captação"
          title="Resultados de prospecção e tráfego"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <KPICard
              label="Visitas LP"
              value={visitsLP}
              format="number"
              icon={<VisitsIcon size={14} />}
            />
            <KPICard
              label="Clicks compra"
              value={clicksCompra}
              format="number"
              icon={<CartIcon size={14} />}
              hint="botão Engaged"
            />
            <KPICard
              label="Clicks WhatsApp"
              value={clicksWhats}
              format="number"
              icon={<WhatsAppIcon size={14} />}
            />
            <KPICard
              label="Clicks Consultor"
              value={clicksConsultor}
              format="number"
              icon={<ConsultorIcon size={14} />}
            />
            <KPICard
              label="Taxa Conv."
              value={taxaConv}
              format="percent"
              icon={<ConversionIcon size={14} />}
              hint="visitas → clicks compra"
            />
            <KPICard
              label="Investimento mídia"
              value={mediaInvestment}
              format="currency"
              icon={<WalletIcon size={14} />}
              hint="Meta + Google"
            />
          </div>
        </Section>

        {/* ───────────────────────────────────────────────
            SEÇÃO 2 — VENDAS
            2 cards grandes (Vendas Totais com split + Receita)
            + tabela de detalhamento abaixo
           ─────────────────────────────────────────────── */}
        <Section
          eyebrow="Vendas"
          title="Resultado comercial"
          actions={<SaleFormButton productSlug={slug} />}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <KPICard
              label="Vendas totais"
              value={salesCount}
              format="number"
              icon={<SalesIcon size={14} />}
              emphasis="strong"
              splits={[
                { label: "Diretas", value: salesByDireta, color: "var(--brand)" },
                { label: "Consultor", value: salesByConsultor, color: "#D97757" },
                ...(salesByEngaged > 0
                  ? [{ label: "Engaged", value: salesByEngaged, color: "#30D158" }]
                  : []),
              ]}
            />
            <KPICard
              label="Receita acumulada"
              value={salesTotal}
              format="currency"
              icon={<RevenueIcon size={14} />}
              emphasis="strong"
              hint={
                salesCount > 0
                  ? `ticket médio R$ ${(salesTotal / salesCount)
                      .toFixed(2)
                      .replace(".", ",")}`
                  : "—"
              }
            />
          </div>

          {/* Detalhamento das vendas — logo abaixo do bloco de KPIs */}
          <SalesTable
            productSlug={slug}
            sales={sales}
            totalCount={salesCount}
            totalAmount={salesTotal}
          />
        </Section>

        {/* ───────────────────────────────────────────────
            SEÇÃO 3 — DETALHAMENTO DE CAPTAÇÃO
            Leads recebidos + canal + posição CTA
           ─────────────────────────────────────────────── */}
        <Section
          eyebrow="Detalhamento de captação"
          title="Leads, canais e posição do CTA"
        >
          <LeadsTable leads={leadsRecent} totalCount={leadsCount} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ChannelTable rows={[...channels]} />
            <CTAPositionTable rows={[...ctaPositions]} />
          </div>
        </Section>

        {/* ───────────────────────────────────────────────
            SEÇÃO 4 — INSIGHTS
           ─────────────────────────────────────────────── */}
        <Section eyebrow="Insights" title="Anomalias e oportunidades detectadas">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {MOCK_INSIGHTS.map((i) => (
              <InsightItem key={i.id} {...i} />
            ))}
          </div>
        </Section>
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

/**
 * Section — bloco visual com header (eyebrow + title) + linha divisória.
 * Mantém elegância sem caixotes pesados; usa só borda superior + tipografia.
 */
function Section({
  eyebrow,
  title,
  actions,
  children,
}: {
  eyebrow: string;
  title?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div
        className="flex items-end justify-between flex-wrap gap-2 pb-2"
        style={{ borderBottom: "1px solid var(--cockpit-border)" }}
      >
        <div className="flex flex-col gap-0.5">
          <span
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "var(--ls-eyebrow)",
              color: "var(--brand)",
              fontWeight: 700,
            }}
          >
            {eyebrow}
          </span>
          {title && (
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--fg1)" }}>
              {title}
            </h2>
          )}
        </div>
        {actions}
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
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
      <span
        style={{
          fontWeight: 700,
          color: "var(--status-warn)",
          textTransform: "uppercase",
          letterSpacing: "var(--ls-eyebrow)",
          fontSize: 10,
        }}
      >
        Mock
      </span>
      <span>
        Dados de captação ainda simulados. Conector GA4 + Meta/Google Ads entra
        após service account JSON e dev token (a partir de 11/05).
      </span>
    </div>
  );
}
