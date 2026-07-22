/**
 * /api/admin/campaigns/[id]/reconcile — concilia as matrículas da(s) turma(s)
 * (API interna da Impacta/Simpac) contra as vendas que a IRIS já tem.
 *
 * Auth: sessão ADMIN OU X-Admin-Secret.
 *
 * MULTI-TURMA: se a campanha tem CampaignTurma cadastradas (LP que vende
 * presencial + online ao mesmo tempo), itera TODAS as turmas com
 * impactaTurmaId, busca cada uma na API e importa carimbando Sale.turmaKey.
 * Falha numa turma NÃO derruba as outras (erro fica isolado por turma).
 * Campanha simples (sem turmas) segue no caminho legado: campaign.impactaTurmaId.
 *
 * GET  → DRY-RUN (não grava): classifica cada matrícula paga em JÁ_NA_IRIS
 *        (bateu com Sale/EngagedPurchase) ou FALTANDO (a criar).
 * POST → APLICA: cria as vendas FALTANDO com source=SISTEMA (+turmaKey).
 *
 * Dedup (pra não duplicar): pra cada matrícula, procura no pool de vendas +
 * EngagedPurchases PAGAS do MESMO produto uma pessoa igual (isSamePerson:
 * email exato / telefone / nome), OU um import anterior (Sale.source=SISTEMA
 * com mesmo externalId), OU CPF já gravado (Sale.customerDocument). Match =
 * pula. Escopo product-wide de propósito: preferimos pular demais a duplicar.
 * (Matrículas de turmas diferentes têm externalId diferente no Simpac, então
 * a idempotência por import_id continua exata por turma.)
 *
 * Vendas via_engaged que NÃO estão na IRIS entram como SISTEMA com aviso
 * (discrepância: o webhook do Engaged deveria ter pego).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkAdminAuth } from "@/lib/admin-auth";
import { fetchImpactaTurma, isPaidEnrollment, type ImpactaEnrollment } from "@/lib/ingest/impacta";
import { isSamePerson, normalizeEmail } from "@/lib/engaged-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MatchInfo = { kind: "sale" | "engaged"; id: string; source?: string; by: string };

type Row = {
  externalId: string;
  name: string;
  email: string | null;
  cpf: string | null;
  valorPago: number | null;
  enrolledAt: string | null;
  viaEngaged: boolean;
  status: "ja_na_iris" | "faltando" | "sem_valor";
  match?: MatchInfo | null;
  /** true quando API diz via_engaged mas não achamos na IRIS (discrepância). */
  engagedMissing?: boolean;
  /** Turma da campanha (CampaignTurma.key) — null em campanha simples. */
  turmaKey: string | null;
  turmaLabel: string | null;
};

/** Alvo de conciliação: uma turma no Simpac (ou a campanha inteira, legado). */
type Target = {
  turmaKey: string | null;   // null = campanha simples (legado)
  turmaLabel: string | null;
  impactaTurmaId: string;
};

type TurmaSummary = {
  turmaKey: string | null;
  turmaLabel: string | null;
  impactaTurmaId: string;
  ok: boolean;
  error?: string;        // detail técnico (http_500, timeout, ...)
  errorMessage?: string; // mensagem amigável pro painel
  totalNaApi: number;
  pagas: number;
  jaNaIris: number;
  faltando: number;
  semValor: number;
  engagedAusente: number;
  created: number;
};

/** Traduz o erro técnico do fetch numa mensagem clara pro painel. */
function impactaErrorMessage(raw: string, turmaId: string): string {
  const m = /^http_(\d{3})$/.exec(raw);
  if (m && Number(m[1]) >= 500) {
    return `A API de matrículas da Impacta retornou HTTP ${m[1]} (Server Error) para a turma ${turmaId}. É uma falha no servidor da Impacta (apiv2.impacta.com.br), não no IRIS — peça ao time de TI da Impacta pra verificar essa turma.`;
  }
  if (m) {
    return `A API de matrículas da Impacta retornou HTTP ${m[1]} para a turma ${turmaId}. Confira se o nº da turma está correto.`;
  }
  if (raw.toLowerCase().includes("timeout") || raw.toLowerCase().includes("abort")) {
    return `A API de matrículas da Impacta não respondeu a tempo (timeout) para a turma ${turmaId}. Tente de novo em instantes; se persistir, é lentidão no servidor da Impacta.`;
  }
  return `Não foi possível conciliar: a API de matrículas da Impacta falhou (${raw}) para a turma ${turmaId}.`;
}

async function runReconcile(campaignId: string, dryRun: boolean) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { statusCode: 404 as const, body: { error: "not_found" } };

  // ── Alvos: turmas cadastradas (multi-turma) OU o campo legado ─────────
  let turmas: Array<{ key: string; label: string; impactaTurmaId: string | null }> = [];
  try {
    turmas = await prisma.campaignTurma.findMany({
      where: { campaignId },
      orderBy: { ordem: "asc" },
      select: { key: true, label: true, impactaTurmaId: true },
    });
  } catch {
    // tabela ainda não migrada — segue no legado
  }

  const targets: Target[] = turmas
    .filter((t) => t.impactaTurmaId && t.impactaTurmaId.trim() !== "")
    .map((t) => ({ turmaKey: t.key, turmaLabel: t.label, impactaTurmaId: t.impactaTurmaId!.trim() }));

  if (targets.length === 0 && campaign.impactaTurmaId) {
    targets.push({ turmaKey: null, turmaLabel: null, impactaTurmaId: campaign.impactaTurmaId });
  }

  if (targets.length === 0) {
    return {
      statusCode: 400 as const,
      body: {
        error: "no_turma",
        message:
          turmas.length > 0
            ? "Nenhuma turma da campanha tem 'Turma (Simpac)' preenchida. Configure o ID em cada turma e salve."
            : "Campanha sem 'Turma (sistema interno)' configurada.",
      },
    };
  }

  // ── Pool de "já na IRIS": vendas + EngagedPurchases pagas do produto ──
  const [sales, engaged] = await Promise.all([
    prisma.sale.findMany({
      where: { productSlug: campaign.productSlug },
      select: {
        id: true, source: true, customerName: true, customerEmail: true,
        customerPhone: true, customerDocument: true, externalId: true,
      },
    }),
    prisma.engagedPurchase.findMany({
      where: { productSlug: campaign.productSlug, status: "PAID" },
      select: { id: true, customerName: true, customerEmail: true, customerPhone: true },
    }),
  ]);

  // Match em CAMADAS por confiança (para na primeira que bater):
  //   1. Import anterior (externalId) — idempotência de re-run.
  //   2. CPF — AUTORITATIVO: se bate CPF é a mesma pessoa, não olha mais nada.
  //   3. Heurístico (email exato / telefone / nome) — só quando não há CPF batendo.
  function findMatch(e: ImpactaEnrollment): MatchInfo | null {
    const person = { customerEmail: e.email, customerPhone: null, customerName: e.name };
    const cpf = e.cpf;

    const prior = sales.find(
      (s) => s.source === "SISTEMA" && s.externalId && s.externalId === e.externalId
    );
    if (prior) return { kind: "sale", id: prior.id, source: prior.source, by: "import_id" };

    if (cpf) {
      const byCpf = sales.find(
        (s) => s.customerDocument && s.customerDocument.replace(/\D/g, "") === cpf
      );
      if (byCpf) return { kind: "sale", id: byCpf.id, source: byCpf.source, by: "cpf" };
    }

    for (const s of sales) {
      if (isSamePerson({ customerEmail: s.customerEmail, customerPhone: s.customerPhone, customerName: s.customerName }, person)) {
        const by = normalizeEmail(s.customerEmail) && normalizeEmail(s.customerEmail) === normalizeEmail(e.email) ? "email" : "nome";
        return { kind: "sale", id: s.id, source: s.source, by };
      }
    }
    for (const g of engaged) {
      if (isSamePerson({ customerEmail: g.customerEmail, customerPhone: g.customerPhone, customerName: g.customerName }, person)) {
        const by = normalizeEmail(g.customerEmail) && normalizeEmail(g.customerEmail) === normalizeEmail(e.email) ? "email" : "nome";
        return { kind: "engaged", id: g.id, by };
      }
    }
    return null;
  }

  // ── Processa cada turma isoladamente ──────────────────────────────────
  const rows: Row[] = [];
  const perTurma: TurmaSummary[] = [];
  let createdTotal = 0;

  for (const target of targets) {
    const base: TurmaSummary = {
      turmaKey: target.turmaKey,
      turmaLabel: target.turmaLabel,
      impactaTurmaId: target.impactaTurmaId,
      ok: false,
      totalNaApi: 0, pagas: 0, jaNaIris: 0, faltando: 0, semValor: 0,
      engagedAusente: 0, created: 0,
    };

    const fetched = await fetchImpactaTurma(target.impactaTurmaId);
    if (!fetched.ok) {
      const raw = fetched.error || "unknown";
      perTurma.push({
        ...base,
        error: raw,
        errorMessage: impactaErrorMessage(raw, target.impactaTurmaId),
      });
      continue; // erro isolado — as outras turmas conciliam mesmo assim
    }

    const paid = fetched.enrollments.filter(isPaidEnrollment);
    const toCreate: ImpactaEnrollment[] = [];
    const turmaRows: Row[] = [];

    for (const e of paid) {
      const match = findMatch(e);
      let status: Row["status"];
      if (match) status = "ja_na_iris";
      else if (e.valorPago == null || e.valorPago <= 0) status = "sem_valor";
      else {
        status = "faltando";
        toCreate.push(e);
      }
      turmaRows.push({
        externalId: e.externalId,
        name: e.name,
        email: e.email,
        cpf: e.cpf,
        valorPago: e.valorPago,
        enrolledAt: e.enrolledAt ? e.enrolledAt.toISOString() : null,
        viaEngaged: e.viaEngaged,
        status,
        match,
        engagedMissing: !match && e.viaEngaged,
        turmaKey: target.turmaKey,
        turmaLabel: target.turmaLabel,
      });
    }

    let created = 0;
    if (!dryRun && toCreate.length > 0) {
      for (const e of toCreate) {
        const noteParts = [`Importado da API Impacta (turma ${target.impactaTurmaId})`];
        if (target.turmaLabel) noteParts.push(`Turma: ${target.turmaLabel}`);
        if (e.viaEngaged) noteParts.push("⚠ API marcou via_engaged=true — Engaged não registrou na IRIS");
        await prisma.sale.create({
          data: {
            productSlug: campaign.productSlug,
            campaignSlug: campaign.slug,
            turmaKey: target.turmaKey,
            source: "SISTEMA",
            customerName: e.name || "Aluno Impacta",
            customerEmail: e.email,
            customerDocument: e.cpf,
            amount: e.valorPago as number,
            currency: "BRL",
            externalId: e.externalId,
            externalRef: e.codigoAluno,
            notes: noteParts.join(" · "),
            saleDate: e.enrolledAt ?? new Date(),
          },
        });
        created++;
      }
    }
    createdTotal += created;
    rows.push(...turmaRows);

    perTurma.push({
      ...base,
      ok: true,
      totalNaApi: fetched.count,
      pagas: paid.length,
      jaNaIris: turmaRows.filter((r) => r.status === "ja_na_iris").length,
      faltando: turmaRows.filter((r) => r.status === "faltando").length,
      semValor: turmaRows.filter((r) => r.status === "sem_valor").length,
      engagedAusente: turmaRows.filter((r) => r.engagedMissing).length,
      created,
    });
  }

  const okTurmas = perTurma.filter((t) => t.ok);
  const failedTurmas = perTurma.filter((t) => !t.ok);

  // TODAS as turmas falharam → 502 com a(s) mensagem(ns) — nada a mostrar.
  if (okTurmas.length === 0) {
    return {
      statusCode: 502 as const,
      body: {
        error: "impacta_api_failed",
        message: failedTurmas.map((t) => t.errorMessage).join(" · "),
        turmas: perTurma,
      },
    };
  }

  // Consolidado (soma das turmas que responderam) — faturamento é um só.
  const summary = {
    campaignSlug: campaign.slug,
    productSlug: campaign.productSlug,
    // legado: turmaId único quando campanha simples
    turmaId: targets.length === 1 && targets[0].turmaKey === null ? targets[0].impactaTurmaId : null,
    turmasTotal: targets.length,
    turmasOk: okTurmas.length,
    turmasComErro: failedTurmas.length,
    totalNaApi: okTurmas.reduce((a, t) => a + t.totalNaApi, 0),
    pagas: okTurmas.reduce((a, t) => a + t.pagas, 0),
    jaNaIris: okTurmas.reduce((a, t) => a + t.jaNaIris, 0),
    faltando: okTurmas.reduce((a, t) => a + t.faltando, 0),
    semValor: okTurmas.reduce((a, t) => a + t.semValor, 0),
    engagedAusente: okTurmas.reduce((a, t) => a + t.engagedAusente, 0),
  };

  return {
    statusCode: 200 as const,
    body: {
      mode: dryRun ? "preview" : "applied",
      created: dryRun ? 0 : createdTotal,
      summary,
      turmas: perTurma,
      rows,
    },
  };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const r = await runReconcile(id, true);
    return NextResponse.json(r.body, { status: r.statusCode });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reconcile GET] falhou", { campaignId: id, message, err });
    return NextResponse.json({ error: "reconcile_failed", message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const r = await runReconcile(id, false);
    return NextResponse.json(r.body, { status: r.statusCode });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[reconcile POST] falhou", { campaignId: id, message, err });
    return NextResponse.json({ error: "reconcile_failed", message }, { status: 500 });
  }
}
