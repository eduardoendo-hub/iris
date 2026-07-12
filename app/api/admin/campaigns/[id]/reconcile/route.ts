/**
 * /api/admin/campaigns/[id]/reconcile — concilia as matrículas da turma
 * (API interna da Impacta) contra as vendas que a IRIS já tem.
 *
 * Auth: sessão ADMIN OU X-Admin-Secret.
 *
 * GET  → DRY-RUN (não grava): busca a turma na API e classifica cada
 *        matrícula paga em JÁ_NA_IRIS (bateu com Sale/EngagedPurchase) ou
 *        FALTANDO (a criar). Serve pra revisar antes de importar.
 * POST → APLICA: cria as vendas FALTANDO com source=SISTEMA.
 *
 * Dedup (pra não duplicar): pra cada matrícula, procura no pool de vendas +
 * EngagedPurchases PAGAS do MESMO produto uma pessoa igual (isSamePerson:
 * email exato / telefone / nome), OU um import anterior (Sale.source=SISTEMA
 * com mesmo externalId), OU CPF já gravado (Sale.customerDocument). Match =
 * pula. Escopo product-wide de propósito: preferimos pular demais a duplicar.
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
};

async function runReconcile(campaignId: string, dryRun: boolean) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) return { statusCode: 404 as const, body: { error: "not_found" } };
  if (!campaign.impactaTurmaId) {
    return {
      statusCode: 400 as const,
      body: { error: "no_turma", message: "Campanha sem 'Turma (sistema interno)' configurada." },
    };
  }

  const fetched = await fetchImpactaTurma(campaign.impactaTurmaId);
  if (!fetched.ok) {
    return {
      statusCode: 502 as const,
      body: { error: "impacta_api_failed", detail: fetched.error, turmaId: campaign.impactaTurmaId },
    };
  }
  const paid = fetched.enrollments.filter(isPaidEnrollment);

  // Pool de "já na IRIS": vendas + EngagedPurchases pagas do MESMO produto.
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
  // Obs.: vendas Engaged/manuais legadas não têm CPF gravado, então a camada 2
  // só pega imports anteriores por ora; email/nome cobre o histórico.
  function findMatch(e: ImpactaEnrollment): MatchInfo | null {
    const person = { customerEmail: e.email, customerPhone: null, customerName: e.name };
    const cpf = e.cpf;

    // 1. Import anterior (idempotência por externalId).
    const prior = sales.find(
      (s) => s.source === "SISTEMA" && s.externalId && s.externalId === e.externalId
    );
    if (prior) return { kind: "sale", id: prior.id, source: prior.source, by: "import_id" };

    // 2. CPF autoritativo — bateu, encerra aqui.
    if (cpf) {
      const byCpf = sales.find(
        (s) => s.customerDocument && s.customerDocument.replace(/\D/g, "") === cpf
      );
      if (byCpf) return { kind: "sale", id: byCpf.id, source: byCpf.source, by: "cpf" };
    }

    // 3. Fallback heurístico (email/telefone/nome).
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

  const rows: Row[] = [];
  const toCreate: ImpactaEnrollment[] = [];
  for (const e of paid) {
    const match = findMatch(e);
    let status: Row["status"];
    if (match) status = "ja_na_iris";
    else if (e.valorPago == null || e.valorPago <= 0) status = "sem_valor";
    else {
      status = "faltando";
      toCreate.push(e);
    }
    rows.push({
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
    });
  }

  let created = 0;
  if (!dryRun && toCreate.length > 0) {
    for (const e of toCreate) {
      const noteParts = [`Importado da API Impacta (turma ${campaign.impactaTurmaId})`];
      if (e.viaEngaged) noteParts.push("⚠ API marcou via_engaged=true — Engaged não registrou na IRIS");
      await prisma.sale.create({
        data: {
          productSlug: campaign.productSlug,
          campaignSlug: campaign.slug,
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

  const summary = {
    turmaId: campaign.impactaTurmaId,
    campaignSlug: campaign.slug,
    productSlug: campaign.productSlug,
    totalNaApi: fetched.count,
    pagas: paid.length,
    jaNaIris: rows.filter((r) => r.status === "ja_na_iris").length,
    faltando: rows.filter((r) => r.status === "faltando").length,
    semValor: rows.filter((r) => r.status === "sem_valor").length,
    engagedAusente: rows.filter((r) => r.engagedMissing).length,
  };

  return {
    statusCode: 200 as const,
    body: { mode: dryRun ? "preview" : "applied", created: dryRun ? 0 : created, summary, rows },
  };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  const { id } = await ctx.params;
  const r = await runReconcile(id, true);
  return NextResponse.json(r.body, { status: r.statusCode });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const a = await checkAdminAuth(req);
  if (!a.authorized) return NextResponse.json({ error: "unauthorized", reason: a.reason }, { status: 401 });
  const { id } = await ctx.params;
  const r = await runReconcile(id, false);
  return NextResponse.json(r.body, { status: r.statusCode });
}
