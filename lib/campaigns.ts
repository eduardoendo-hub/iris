/**
 * Resolvers de campanha — camada compartilhada entre cockpit, analytics,
 * ingestao (Meta/Google/eventos) e webhook Engaged.
 *
 * Conceito central: a JANELA [startDate, fim) da campanha eh o escopo
 * canonico de tudo. "fim" = dia seguinte (SP midnight) a effectiveEnd, onde
 * effectiveEnd = endedAt (encerramento real) ?? endDate (planejado). Isso
 * da o limite SUPERIOR que faltava no getCampaignResults e congela os
 * numeros de uma campanha encerrada.
 *
 * Ingestao so grava enquanto existe campanha ACTIVE cuja janela cobre hoje
 * (ver isCampaignIngesting). Encerrar (status=ENDED) corta a ingestao.
 */
import { prisma } from "@/lib/prisma";
import { spDayBucketFromInstant } from "@/lib/time-buckets";

const SP_UTC_OFFSET_HOURS = 3; // SP = UTC-3 fixo

/** Campos minimos de campanha que os resolvers de janela precisam. */
export type CampaignWindowInput = {
  startDate: Date;
  endDate: Date;
  endedAt?: Date | null;
  status?: "DRAFT" | "ACTIVE" | "ENDED";
};

export type CampaignWindow = {
  /** Instante UTC do inicio (meia-noite SP do startDate). Inclusivo. */
  sinceUTC: Date;
  /** Instante UTC do fim, EXCLUSIVO (meia-noite SP do dia seguinte ao fim). */
  untilExclusiveUTC: Date;
  /** YYYY-MM-DD (parte de data crua) do inicio. */
  startYMD: string;
  /** YYYY-MM-DD do fim efetivo (endedAt ?? endDate). */
  endYMD: string;
};

/** Date -> meia-noite SP do MESMO dia, como instante UTC (= 03:00 UTC). */
function spMidnightUTC(d: Date): Date {
  const spLocal = new Date(d.getTime() - SP_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return new Date(
    Date.UTC(
      spLocal.getUTCFullYear(),
      spLocal.getUTCMonth(),
      spLocal.getUTCDate(),
      SP_UTC_OFFSET_HOURS,
      0,
      0
    )
  );
}

/** "YYYY-MM-DD" (SP) de um instante. */
function spYMD(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Janela canonica da campanha. O limite superior eh o dia seguinte (SP) ao
 * effectiveEnd, exclusivo — assim o bucket DAY do ultimo dia entra inteiro.
 */
export function getCampaignWindow(c: CampaignWindowInput): CampaignWindow {
  const effectiveEnd = c.endedAt ?? c.endDate;
  const sinceUTC = spMidnightUTC(c.startDate);
  const endMidnight = spMidnightUTC(effectiveEnd);
  const untilExclusiveUTC = new Date(endMidnight.getTime() + 24 * 60 * 60 * 1000);
  return {
    sinceUTC,
    untilExclusiveUTC,
    startYMD: spYMD(c.startDate),
    endYMD: spYMD(effectiveEnd),
  };
}

/**
 * A campanha esta ingerindo dados AGORA? True somente se ACTIVE e o instante
 * `at` cai dentro da janela [since, until). Crons e /api/events usam isso pra
 * decidir se gravam ou pulam.
 */
export function isCampaignIngesting(
  c: CampaignWindowInput | null | undefined,
  at: Date = new Date()
): boolean {
  if (!c) return false;
  if (c.status !== "ACTIVE") return false;
  const w = getCampaignWindow(c);
  return at >= w.sinceUTC && at < w.untilExclusiveUTC;
}

/** A campanha ATIVA do produto (≤1 garantido pelo indice parcial unico). */
export async function getActiveCampaign(productSlug: string) {
  try {
    return await prisma.campaign.findFirst({
      where: { productSlug, status: "ACTIVE" },
    });
  } catch {
    return null;
  }
}

/**
 * Resolve a campanha dona de um sharedId do checkout Engaged. Procura nas
 * campanhas (campo engagedCheckoutSharedIds) — o sharedId muda por turma,
 * entao mora na campanha, nao no produto.
 */
export async function getCampaignBySharedId(sharedId: string) {
  if (!sharedId) return null;
  try {
    return await prisma.campaign.findFirst({
      where: { engagedCheckoutSharedIds: { has: sharedId } },
    });
  } catch {
    return null;
  }
}

/**
 * Resolve a campanha pelo número da turma do sistema interno (impactaTurmaId).
 * Usado quando o checkout Engaged mantém o MESMO link entre turmas e versiona
 * pela querystring (?turma=<id>) — a turma vem no webhook e resolve a campanha
 * sem depender de sharedId único. Prefere a ATIVA se houver mais de uma.
 */
export async function getCampaignByTurmaId(turmaId: string) {
  if (!turmaId) return null;
  try {
    return await prisma.campaign.findFirst({
      where: { impactaTurmaId: turmaId },
      orderBy: { isActive: "desc" },
    });
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────
// TURMAS PARALELAS (CampaignTurma) — campanha/LP com N turmas ao
// mesmo tempo (presencial + online, etc). Os resolvers abaixo têm
// precedência sobre os legados: se o sharedId/turmaId estiver numa
// CampaignTurma, devolvem {campaign, turma} e o chamador carimba
// turmaKey; senão o chamador cai no resolver legado (campanha simples).
// ────────────────────────────────────────────────────────────────

export type TurmaMatch = {
  campaign: NonNullable<Awaited<ReturnType<typeof getActiveCampaign>>>;
  turma: { id: string; key: string; label: string; color: string | null; impactaTurmaId: string | null; engagedSharedIds: string[] };
};

/** Resolve {campanha, turma} pelo sharedId do checkout Engaged. */
export async function getTurmaBySharedId(sharedId: string): Promise<TurmaMatch | null> {
  if (!sharedId) return null;
  try {
    const t = await prisma.campaignTurma.findFirst({
      where: { engagedSharedIds: { has: sharedId } },
      include: { campaign: true },
      orderBy: { campaign: { isActive: "desc" } },
    });
    if (!t) return null;
    const { campaign, ...turma } = t;
    return { campaign, turma };
  } catch {
    return null; // tabela ainda não migrada — chamador cai no legado
  }
}

/** Resolve {campanha, turma} pelo ID da turma no Simpac (?turma=<id>). */
export async function getTurmaByImpactaTurmaId(turmaId: string): Promise<TurmaMatch | null> {
  if (!turmaId) return null;
  try {
    const t = await prisma.campaignTurma.findFirst({
      where: { impactaTurmaId: turmaId },
      include: { campaign: true },
      orderBy: { campaign: { isActive: "desc" } },
    });
    if (!t) return null;
    const { campaign, ...turma } = t;
    return { campaign, turma };
  } catch {
    return null;
  }
}

/** Metas/alvos de uma campanha, normalizados pro agente de insight. */
export type InsightCampaignGoals = {
  matriculas: number;
  receita: number;
  cacMax: number;
  roasAlvo: number;
  cplAlvo: number;
  budgetTotal: number;
};

export type InsightCampaignContext = {
  campaignSlug: string;
  campaignName: string;
  productSlug: string;
  startISO: string; // YYYY-MM-DD (SP) do inicio
  endISO: string; // YYYY-MM-DD (SP) do fim efetivo (endedAt ?? endDate)
  goals: InsightCampaignGoals;
  /** Plano de marketing cadastrado NESTA campanha (DB). Vazio se nao preenchido.
   *  Quando presente, e a fonte da "realidade" da turma vigente pro agente. */
  marketingPlan: string | null;
};

/**
 * Contexto da campanha ATIVA de um produto pro agente de insight — slug,
 * nome, janela e metas, TODOS vindos do DB (nao mais hardcoded da turma de
 * maio). Retorna null se o produto nao tem campanha ativa (cron pula, em vez
 * de gerar insight com contexto errado). Resolve automaticamente qualquer
 * campanha nova assim que ela entra como ACTIVE — sem tocar codigo.
 */
export async function getInsightCampaignContext(
  productSlug: string
): Promise<InsightCampaignContext | null> {
  const active = await getActiveCampaign(productSlug);
  if (!active) return null;
  const w = getCampaignWindow(active);
  return {
    campaignSlug: active.slug,
    campaignName: active.name,
    productSlug: active.productSlug,
    startISO: w.startYMD,
    endISO: w.endYMD,
    goals: {
      matriculas: active.goalEnrollments ?? 0,
      receita: active.goalRevenue ? Number(active.goalRevenue) : 0,
      cacMax: active.goalCac ? Number(active.goalCac) : 0,
      roasAlvo: active.goalRoas ? Number(active.goalRoas) : 0,
      cplAlvo: active.goalCpl ? Number(active.goalCpl) : 0,
      budgetTotal: active.mediaBudget ? Number(active.mediaBudget) : 0,
    },
    marketingPlan: active.marketingPlan?.trim() ? active.marketingPlan.trim() : null,
  };
}

export type IngestGate = {
  /** Pode ingerir agora? false = pular gravacao (campanha encerrada/sem ativa). */
  ingest: boolean;
  /** Janela da campanha ativa, pra clampar buckets fora de [start, fim]. */
  window: CampaignWindow | null;
  /** Slug da campanha ativa (pra logs). */
  campaignSlug: string | null;
  reason: string;
};

/**
 * Portao de ingestao por produto: resolve a campanha ATIVA e decide se os
 * crons (Meta/Google) e o /api/events devem gravar. Encerrar a campanha
 * (status=ENDED) ou passar do endDate fecha o portao -> dados congelam.
 */
export async function getIngestGate(productSlug: string, at: Date = new Date()): Promise<IngestGate> {
  const active = await getActiveCampaign(productSlug);
  if (!active) {
    return { ingest: false, window: null, campaignSlug: null, reason: "no_active_campaign" };
  }
  if (!isCampaignIngesting(active, at)) {
    return {
      ingest: false,
      window: getCampaignWindow(active),
      campaignSlug: active.slug,
      reason: "campaign_window_closed",
    };
  }
  return {
    ingest: true,
    window: getCampaignWindow(active),
    campaignSlug: active.slug,
    reason: "active",
  };
}

/** True se o dia YYYY-MM-DD (SP) esta dentro da janela [startYMD, endYMD]. */
export function isYMDInWindow(ymd: string, w: CampaignWindow): boolean {
  return ymd >= w.startYMD && ymd <= w.endYMD;
}

/** Bucket DAY (SP) de um instante — re-export pratico pros call-sites. */
export { spDayBucketFromInstant };
