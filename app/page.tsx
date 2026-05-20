import Image from "next/image";
import { Topbar } from "@/components/Topbar";
import { CampaignSelector, type CampaignOption } from "@/components/CampaignSelector";
import { TabNav } from "@/components/TabNav";
import { KPICard } from "@/components/KPICard";
import { ChannelTable } from "@/components/ChannelTable";
import { CTAPositionTable } from "@/components/CTAPositionTable";
import { CaptacaoSourceTable } from "@/components/CaptacaoSourceTable";
import { DailyInsightCard } from "@/components/DailyInsightCard";
import { MetasCard, type Meta } from "@/components/MetasCard";
import { LeadsTable } from "@/components/LeadsTable";
import { EngagedLeadsTable } from "@/components/EngagedLeadsTable";
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
  MOCK_KPIS,
  MOCK_CHANNELS,
  MOCK_CTA_POSITION,
} from "@/lib/mock-data";

export const dynamic = "force-dynamic";

type SearchParams = { campaign?: string; product?: string };

export default async function CockpitPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  // Lista TODAS as campanhas pro combo. Se nenhuma cadastrada, fallback
  // pros produtos mock (legado, primeira vez sem nada no DB).
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
    // Tabela Campaign nao existe ainda
  }

  // Decide qual campanha exibir:
  //   1. ?campaign=<slug> explicito
  //   2. campanha ATIVA do produto especificado em ?product=
  //   3. primeira campanha ATIVA cadastrada
  //   4. fallback: produto "claude-pro" sem campanha (modo legado)
  const explicitCampaign = params.campaign
    ? campaignOptions.find((c) => c.slug === params.campaign)
    : null;
  const productFromParam = params.product;
  const activeForProduct = productFromParam
    ? campaignOptions.find((c) => c.productSlug === productFromParam && c.isActive)
    : null;
  const firstActive = campaignOptions.find((c) => c.isActive) ?? null;

  const selectedCampaign = explicitCampaign ?? activeForProduct ?? firstActive ?? null;
  const slug = selectedCampaign?.productSlug ?? productFromParam ?? "claude-pro";
  const selectedCampaignSlug = selectedCampaign?.slug ?? null;
  const productKey = slug as keyof typeof MOCK_KPIS;

  const kpi = MOCK_KPIS[productKey] ?? MOCK_KPIS["claude-pro"];
  const channels = MOCK_CHANNELS[productKey] ?? [];
  const ctaPositions = MOCK_CTA_POSITION[productKey] ?? [];

  // ────────────────────────────────────────────────────────────────
  // KPIs de Captação — leem de MetricSample (GA4/Meta/Google ingest)
  // Fallback pra mock se a tabela estiver vazia (pre-launch).
  // ────────────────────────────────────────────────────────────────
  let visitsLP = (kpi as { visitsLP?: number }).visitsLP ?? kpi.sessions ?? 0;
  let clicksCompra = (kpi as { clicksCompra?: number }).clicksCompra ?? 0;
  let clicksWhats = (kpi as { clicksWhats?: number }).clicksWhats ?? 0;
  let clicksConsultor = (kpi as { clicksConsultor?: number }).clicksConsultor ?? 0;
  let mediaInvestment =
    (kpi as { mediaInvestment?: number }).mediaInvestment ?? kpi.cost ?? 0;
  let mediaInvestmentMonth = 0;
  let metricsSourceLabel = "mock";
  try {
    // Computa boundaries em SP — bucket startsAt agora salva "Day X 00:00 SP"
    // (= Day X 03:00 UTC). Bate exato com o que vem do ingest.
    const nowSP = new Date(Date.now() - 3 * 60 * 60 * 1000); // UTC - 3h = SP "local"
    const todayUTC = new Date(Date.UTC(nowSP.getUTCFullYear(), nowSP.getUTCMonth(), nowSP.getUTCDate(), 3, 0, 0));
    const monthStartUTC = new Date(Date.UTC(nowSP.getUTCFullYear(), nowSP.getUTCMonth(), 1, 3, 0, 0));
    const sevenDaysAgoUTC = new Date(todayUTC.getTime() - 6 * 24 * 60 * 60 * 1000);

    // Janelas: 7 dias (KPIs de captacao) + hoje (spend dia) + mes (spend mes)
    const samples = await prisma.metricSample.groupBy({
      by: ["metric", "source"],
      where: {
        productSlug: slug,
        bucket: "DAY",
        startsAt: { gte: sevenDaysAgoUTC },
      },
      _sum: { value: true },
    });
    const byMetric: Record<string, number> = {};
    for (const s of samples) {
      byMetric[s.metric] = (byMetric[s.metric] ?? 0) + Number(s._sum.value ?? 0);
    }
    const ga4Has = (m: string) => typeof byMetric[m] === "number" && byMetric[m] > 0;
    if (ga4Has("sessions") || ga4Has("lp_view")) {
      visitsLP = byMetric["sessions"] ?? byMetric["lp_view"] ?? 0;
      metricsSourceLabel = "GA4 · 7d";
    }
    if (ga4Has("click_compra")) clicksCompra = byMetric["click_compra"];
    if (ga4Has("click_whats")) clicksWhats = byMetric["click_whats"];
    if (ga4Has("click_consultor")) clicksConsultor = byMetric["click_consultor"];

    // Spend HOJE — Meta + Google bucket=DAY com startsAt=hoje SP
    const spendTodaySamples = await prisma.metricSample.groupBy({
      by: ["source"],
      where: {
        productSlug: slug,
        metric: "spend",
        bucket: "DAY",
        startsAt: todayUTC,
        source: { in: ["META_ADS", "GOOGLE_ADS"] },
      },
      _sum: { value: true },
    });
    const spendTodayTotal = spendTodaySamples.reduce(
      (acc, s) => acc + Number(s._sum.value ?? 0),
      0
    );
    if (spendTodayTotal > 0) mediaInvestment = spendTodayTotal;

    // Spend MES (do dia 1 ate hoje) — pra dar visao acumulada do investimento
    const spendMonthSamples = await prisma.metricSample.groupBy({
      by: ["source"],
      where: {
        productSlug: slug,
        metric: "spend",
        bucket: "DAY",
        startsAt: { gte: monthStartUTC },
        source: { in: ["META_ADS", "GOOGLE_ADS"] },
      },
      _sum: { value: true },
    });
    mediaInvestmentMonth = spendMonthSamples.reduce(
      (acc, s) => acc + Number(s._sum.value ?? 0),
      0
    );
  } catch {
    // tabela MetricSample nao existe ainda — segue com mocks
  }
  const taxaConv = visitsLP > 0 ? (clicksCompra / visitsLP) * 100 : 0;

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

  // Leads do Engaged — status != PAID E que NAO tenham Sale ou outra
  // EngagedPurchase=PAID com o mesmo email/telefone (dedupe defensivo,
  // pq Engaged manda _id diferente por evento → pode criar 2 linhas pro
  // mesmo cliente: uma DRAFT e outra PAID). Tabela so deve mostrar quem
  // realmente nao pagou ainda.
  let engagedLeadsCount = 0;
  let engagedLeads: Array<{
    id: string;
    externalId: string;
    status: string;
    lastEventType: string;
    customerName: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    amount: number | null;
    currency: string | null;
    eventAt: Date;
    firstSeenAt: Date;
    lastUpdatedAt: Date;
  }> = [];
  try {
    // 1. Coleta TODOS os emails/telefones que ja pagaram (Sale + EngagedPurchase=PAID)
    const [paidEngagedRows, saleRows] = await Promise.all([
      prisma.engagedPurchase.findMany({
        where: { productSlug: slug, status: "PAID" },
        select: { customerEmail: true, customerPhone: true },
      }),
      prisma.sale.findMany({
        where: { productSlug: slug },
        select: { customerEmail: true, customerPhone: true },
      }),
    ]);
    const normEmail = (e: string | null) => (e ? e.toLowerCase().trim() : null);
    const normPhone = (p: string | null) => (p ? p.replace(/\D/g, "") : null);
    const paidEmails = new Set<string>();
    const paidPhones = new Set<string>();
    for (const r of [...paidEngagedRows, ...saleRows]) {
      const e = normEmail(r.customerEmail);
      const p = normPhone(r.customerPhone);
      if (e) paidEmails.add(e);
      if (p) paidPhones.add(p);
    }

    // 2. Busca leads nao-pagos e filtra os que ja pagaram em outra linha
    const raw = await prisma.engagedPurchase.findMany({
      where: { productSlug: slug, status: { not: "PAID" } },
      orderBy: { eventAt: "desc" },
      take: 200, // sobra margem pra filtragem em app
    });
    const filtered = raw.filter((r) => {
      const e = normEmail(r.customerEmail);
      const p = normPhone(r.customerPhone);
      if (e && paidEmails.has(e)) return false; // ja pagou (sale ou engaged PAID)
      if (p && paidPhones.has(p)) return false;
      return true;
    });
    engagedLeadsCount = filtered.length;
    engagedLeads = filtered.slice(0, 50).map((r) => ({
      id: r.id,
      externalId: r.externalId,
      status: r.status,
      lastEventType: r.lastEventType,
      customerName: r.customerName,
      customerEmail: r.customerEmail,
      customerPhone: r.customerPhone,
      amount: r.amount ? Number(r.amount) : null,
      currency: r.currency,
      eventAt: r.eventAt,
      firstSeenAt: r.firstSeenAt,
      lastUpdatedAt: r.lastUpdatedAt,
    }));
  } catch {
    // tabela EngagedPurchase nao existe ainda (pre-migration)
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

  // ────────────────────────────────────────────────────────────────
  // Detalhamento de captação por canal (UTM) — ultimos 7 dias
  // Agrega VisitEvent (cada evento da LP) por (utmSource, utmMedium,
  // utmCampaign, utmContent). utmContent carrega o nome do anuncio
  // (Meta substitui {{ad.name}} automaticamente) — permite ver qual peca
  // ta performando melhor dentro de cada campanha.
  type CaptacaoRow = {
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    visits: number;
    clickCompra: number;
    clickConsultor: number;
    clickWhats: number;
    leadForm: number;
  };
  const captacaoDays = 7;
  let captacaoRows: CaptacaoRow[] = [];
  try {
    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    from.setUTCDate(from.getUTCDate() - (captacaoDays - 1));
    const grouped = await prisma.visitEvent.groupBy({
      by: ["utmSource", "utmMedium", "utmCampaign", "utmContent", "eventName"],
      where: { productSlug: slug, ts: { gte: from } },
      _count: { _all: true },
    });
    const pivot = new Map<string, CaptacaoRow>();
    const key = (s: string | null, m: string | null, c: string | null, ct: string | null) =>
      `${s ?? ""}|${m ?? ""}|${c ?? ""}|${ct ?? ""}`;
    for (const r of grouped) {
      const k = key(r.utmSource, r.utmMedium, r.utmCampaign, r.utmContent);
      let cur = pivot.get(k);
      if (!cur) {
        cur = {
          utmSource: r.utmSource,
          utmMedium: r.utmMedium,
          utmCampaign: r.utmCampaign,
          utmContent: r.utmContent,
          visits: 0,
          clickCompra: 0,
          clickConsultor: 0,
          clickWhats: 0,
          leadForm: 0,
        };
        pivot.set(k, cur);
      }
      const n = r._count._all;
      switch (r.eventName) {
        case "lp_view": cur.visits += n; break;
        case "click_compra": cur.clickCompra += n; break;
        case "click_consultor": cur.clickConsultor += n; break;
        case "click_whats": cur.clickWhats += n; break;
        case "lead_form": cur.leadForm += n; break;
      }
    }
    // Sort: campanha asc (mesma campanha agrupada visualmente) → visits desc dentro da campanha
    captacaoRows = Array.from(pivot.values()).sort((a, b) => {
      const ca = a.utmCampaign ?? "";
      const cb = b.utmCampaign ?? "";
      if (ca !== cb) return ca.localeCompare(cb);
      return b.visits - a.visits;
    });
  } catch {
    // tabela VisitEvent nao existe ainda (pre-migration)
  }

  // ────────────────────────────────────────────────────────────────
  // Análise estratégica diária — últimos 7 insights gerados pelo agente
  // ────────────────────────────────────────────────────────────────
  type DailyInsightRow = {
    id: string;
    analysisDate: Date;
    generatedAt: Date;
    headline: string;
    summary: string;
    severity: string;
    recommendations: Array<{ priority: number; action: string; expected_impact: string }>;
    model: string;
  };
  let dailyInsights: DailyInsightRow[] = [];
  try {
    const rows = await prisma.dailyInsight.findMany({
      where: { productSlug: slug },
      orderBy: { analysisDate: "desc" },
      take: 7,
      select: {
        id: true,
        analysisDate: true,
        generatedAt: true,
        headline: true,
        summary: true,
        severity: true,
        recommendations: true,
        model: true,
      },
    });
    dailyInsights = rows.map((r) => ({
      id: r.id,
      analysisDate: r.analysisDate,
      generatedAt: r.generatedAt,
      headline: r.headline,
      summary: r.summary,
      severity: r.severity,
      recommendations: Array.isArray(r.recommendations)
        ? (r.recommendations as Array<{ priority: number; action: string; expected_impact: string }>)
        : [],
      model: r.model,
    }));
  } catch {
    // tabela DailyInsight nao existe ainda
  }

  // ────────────────────────────────────────────────────────────────
  // Metas da campanha — busca a campanha ATIVA do produto no DB.
  // Fallback nos defaults hardcoded se nenhuma campanha cadastrada
  // (vai funcionar enquanto user nao cria via /admin/campaigns).
  // ────────────────────────────────────────────────────────────────
  // activeCampaign aqui significa "a campanha que o cockpit esta exibindo
  // metas/datas". Se o user selecionou explicitamente uma no combo, usa
  // ela; senao, a ATIVA do produto. (Permite olhar metas de campanhas
  // passadas ao selecionar.)
  let activeCampaign: Awaited<ReturnType<typeof prisma.campaign.findFirst>> = null;
  try {
    if (selectedCampaignSlug) {
      activeCampaign = await prisma.campaign.findUnique({
        where: { slug: selectedCampaignSlug },
      });
    } else {
      activeCampaign = await prisma.campaign.findFirst({
        where: { productSlug: slug, isActive: true },
      });
    }
  } catch {
    // tabela Campaign nao existe ainda (pre-migration)
  }

  const CAMPAIGN_GOALS = {
    matriculas: activeCampaign?.goalEnrollments ?? 30,
    receita: activeCampaign?.goalRevenue ? Number(activeCampaign.goalRevenue) : 44970,
    midiaTotal: activeCampaign?.mediaBudget ? Number(activeCampaign.mediaBudget) : 9000,
    cacMax: activeCampaign?.goalCac ? Number(activeCampaign.goalCac) : 300,
    roasAlvo: activeCampaign?.goalRoas ? Number(activeCampaign.goalRoas) : 5.0,
    cplAlvo: activeCampaign?.goalCpl ? Number(activeCampaign.goalCpl) : 36,
    convLeadMatricula: 11,
  };

  // Custos de producao cadastrados em /admin/campaigns (LP + criativos + outros).
  // Somam UMA UNICA VEZ no mes (nao escalam diariamente como mídia paga).
  const productionCostLP = Number(activeCampaign?.productionCostLP ?? 0);
  const productionCostAds = Number(activeCampaign?.productionCostAds ?? 0);
  const productionCostOther = Number(activeCampaign?.productionCostOther ?? 0);
  const productionCostsTotal = productionCostLP + productionCostAds + productionCostOther;
  // "no mês" no card de Investimento = Meta + Google ingerido + custos de
  // producao da campanha (que sao gastos one-time mas entram no investimento
  // total pra calculo honesto de ROAS/CAC executivo).
  const totalInvestmentMonth = mediaInvestmentMonth + productionCostsTotal;
  const CAMPAIGN_START_ISO = activeCampaign
    ? activeCampaign.startDate.toISOString().slice(0, 10)
    : "2026-05-11";
  const CAMPAIGN_END_ISO = activeCampaign
    ? activeCampaign.endDate.toISOString().slice(0, 10)
    : "2026-06-07";

  // Spend ACUMULADO total da campanha (desde dia 1)
  let spendCampaignTotal = 0;
  try {
    const campaignStartUTC = new Date(CAMPAIGN_START_ISO + "T03:00:00.000Z");
    const totalAgg = await prisma.metricSample.aggregate({
      where: {
        productSlug: slug,
        bucket: "DAY",
        metric: "spend",
        startsAt: { gte: campaignStartUTC },
        source: { in: ["META_ADS", "GOOGLE_ADS"] },
      },
      _sum: { value: true },
    });
    spendCampaignTotal = Number(totalAgg._sum.value ?? 0);
  } catch {
    // tabela MetricSample nao existe ainda
  }

  // CAC e ROAS calculados do estado atual
  const cacAtual = salesCount > 0 ? spendCampaignTotal / salesCount : 0;
  const roasAtual = spendCampaignTotal > 0 ? salesTotal / spendCampaignTotal : 0;
  // CPL alvo é por LEAD captado. Sem dado de leads isolado ainda (vem do
  // form/RD CRM). Por enquanto usa click_compra como proxy de "lead caro"
  // ou pula essa meta — vou incluir como proxy mesmo (mais util pra mostrar
  // visualmente do que esconder).
  const cplAtual = clicksCompra > 0 ? mediaInvestment / clicksCompra : 0;

  // Dias da campanha
  const nowSP = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const startSP = new Date(CAMPAIGN_START_ISO + "T03:00:00.000Z");
  const endSP = new Date(CAMPAIGN_END_ISO + "T03:00:00.000Z");
  const campaignDay = Math.floor((nowSP.getTime() - startSP.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const daysToEnd = Math.floor((endSP.getTime() - nowSP.getTime()) / (24 * 60 * 60 * 1000));

  // ─── Forecast (Matriculas, Receita) ────────────────────────────────
  // Conta APENAS dias uteis (seg-sex) — user nao opera fim de semana.
  // Velocidade atual = atual / dias_uteis_decorridos
  // Forecast = velocidade * dias_uteis_total_campanha
  function countBusinessDays(from: Date, to: Date): number {
    if (to < from) return 0;
    let count = 0;
    const cur = new Date(from);
    cur.setUTCHours(12, 0, 0, 0);
    const endMs = to.getTime();
    while (cur.getTime() <= endMs) {
      const dow = cur.getUTCDay(); // 0=domingo, 6=sabado
      if (dow !== 0 && dow !== 6) count++;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return count;
  }
  const businessDaysElapsed = countBusinessDays(startSP, nowSP);
  const businessDaysTotal = countBusinessDays(startSP, endSP);

  let matriculasForecast: number | undefined;
  let receitaForecast: number | undefined;
  if (businessDaysElapsed > 0 && businessDaysTotal > businessDaysElapsed) {
    matriculasForecast = (salesCount / businessDaysElapsed) * businessDaysTotal;
    receitaForecast = (salesTotal / businessDaysElapsed) * businessDaysTotal;
  } else if (businessDaysElapsed > 0) {
    // Ja passou todos os dias uteis — forecast = atual
    matriculasForecast = salesCount;
    receitaForecast = salesTotal;
  }

  const metas: Meta[] = [
    {
      label: "Matrículas",
      atual: salesCount,
      alvo: CAMPAIGN_GOALS.matriculas,
      format: "number",
      direction: "min",
      forecast: matriculasForecast,
    },
    {
      label: "Receita",
      atual: salesTotal,
      alvo: CAMPAIGN_GOALS.receita,
      format: "currency",
      direction: "min",
      forecast: receitaForecast,
    },
    {
      label: "Mídia gasta",
      atual: spendCampaignTotal,
      alvo: CAMPAIGN_GOALS.midiaTotal,
      format: "currency",
      direction: "max",
      hint: "limite",
    },
    {
      label: "CAC",
      atual: cacAtual,
      alvo: CAMPAIGN_GOALS.cacMax,
      format: "currency",
      direction: "max",
    },
    {
      label: "ROAS",
      atual: roasAtual,
      alvo: CAMPAIGN_GOALS.roasAlvo,
      format: "multiplier",
      direction: "min",
    },
    {
      label: "CPL (click compra)",
      atual: cplAtual,
      alvo: CAMPAIGN_GOALS.cplAlvo,
      format: "currency",
      direction: "max",
    },
  ];

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
          Campanha
        </span>
        <CampaignSelector currentSlug={selectedCampaignSlug} campaigns={campaignOptions} />
      </div>

      <TabNav active="cockpit" productSlug={slug} campaignSlug={selectedCampaignSlug} />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-5 flex flex-col gap-5">
        {metricsSourceLabel === "mock" && <MockBanner />}

        {/* ───────────────────────────────────────────────
            SEÇÃO 1 — CAPTAÇÃO
            6 KPIs: Visitas LP · Clicks compra · Clicks Whats ·
            Clicks Consultor · Taxa Conv. · Investimento mídia
           ─────────────────────────────────────────────── */}
        <Section
          eyebrow="Captação"
          title="Resultados de prospecção e tráfego"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
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
              label="Investimento"
              value={mediaInvestment}
              format="currency"
              icon={<WalletIcon size={14} />}
              hint="hoje · Meta + Google"
              secondaryValue={totalInvestmentMonth}
              secondaryLabel="no mês"
              secondaryHint={
                productionCostsTotal > 0
                  ? `Mídia ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(mediaInvestmentMonth)} + Produção ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(productionCostsTotal)}`
                  : "Meta + Google"
              }
            />
          </div>
        </Section>

        {/* ───────────────────────────────────────────────
            SEÇÃO 1.5 — METAS DA CAMPANHA (card compacto)
            Todos os KPIs vs alvos do plano de marketing em 1 card
           ─────────────────────────────────────────────── */}
        <MetasCard
          metas={metas}
          campaignDay={campaignDay}
          daysToEnd={daysToEnd}
          budgetTotal={CAMPAIGN_GOALS.midiaTotal}
          businessDaysElapsed={businessDaysElapsed}
          businessDaysTotal={businessDaysTotal}
        />

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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
          <CaptacaoSourceTable rows={captacaoRows} days={captacaoDays} />
          <EngagedLeadsTable rows={engagedLeads} totalCount={engagedLeadsCount} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ChannelTable rows={[...channels]} />
            <CTAPositionTable rows={[...ctaPositions]} />
          </div>
        </Section>

        {/* ───────────────────────────────────────────────
            SEÇÃO 4 — INSIGHTS
            Análise estratégica diária (agente LLM) + anomalias
           ─────────────────────────────────────────────── */}
        <Section eyebrow="Insights" title="Anomalias e oportunidades detectadas">
          {/* Sub-seção: Análise estratégica diária */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--fg1)",
                  textTransform: "uppercase",
                  letterSpacing: "var(--ls-eyebrow)",
                }}
              >
                Análise estratégica diária
              </h3>
              <span style={{ fontSize: 11, color: "var(--fg2)" }}>
                {dailyInsights.length === 0
                  ? "aguardando primeiro run do agente (05:00 SP)"
                  : `${dailyInsights.length} análise${dailyInsights.length === 1 ? "" : "s"} recente${dailyInsights.length === 1 ? "" : "s"}`}
              </span>
            </div>
            {dailyInsights.length === 0 ? (
              <div
                className="rounded-xl px-5 py-6 text-center"
                style={{
                  background: "var(--cockpit-card)",
                  border: "1px dashed var(--cockpit-border)",
                  color: "var(--fg2)",
                  fontSize: 13,
                }}
              >
                O agente analisa diariamente a campanha às 05:00 SP. Primeira análise vai aparecer
                aqui após o primeiro run do cron.
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {dailyInsights.map((i) => (
                  <DailyInsightCard
                    key={i.id}
                    analysisDate={i.analysisDate}
                    generatedAt={i.generatedAt}
                    headline={i.headline}
                    summary={i.summary}
                    severity={i.severity}
                    recommendations={i.recommendations}
                    model={i.model}
                  />
                ))}
              </div>
            )}
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
 * Section — bloco visual com header (eyebrow + title) + divisor visual forte.
 * v0.2 — eyebrow maior + linha dupla (Tiffany acima, border abaixo) pra
 * deixar separacao entre Captação / Vendas / Detalhamento bem clara.
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
    <section className="flex flex-col gap-3">
      <div
        className="flex items-center justify-between flex-wrap gap-2 pb-2"
        style={{
          borderBottom: "1px solid var(--cockpit-border-strong)",
        }}
      >
        <div
          className="flex items-baseline gap-3 relative"
          style={{ paddingLeft: 12 }}
        >
          {/* Marcador vertical Tiffany à esquerda do título da seção */}
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
            {eyebrow}
          </span>
          {title && (
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--fg1)" }}>
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
