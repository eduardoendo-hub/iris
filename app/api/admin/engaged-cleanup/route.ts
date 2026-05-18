/**
 * /api/admin/engaged-cleanup — limpeza one-shot dos leads que ja pagaram
 * mas continuam aparecendo no card "Leads Engaged".
 *
 * Pra cada Sale (qualquer source: ENGAGED, DIRETA, CONSULTOR, MANUAL),
 * roda o matching por email exato / telefone (8 digitos) / nome aproximado
 * e promove a EngagedPurchase correspondente pra PAID.
 *
 * Tambem trata o caso "lead capturou pelo Engaged, pagou pelo Engaged"
 * que criou 2 linhas — uma DRAFT, outra PAID (porque Engaged manda _id
 * diferente por evento). Promove a DRAFT pra PAID baseada na PAID.
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * GET  -> preview (dry run, nao modifica nada)
 * POST -> aplica as promocoes
 *
 * Query: ?product=claude-pro (default)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { promoteSiblingLeadsToPaid } from "@/lib/engaged-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-admin-secret") || "") === secret;
}

async function runCleanup(productSlug: string, dryRun: boolean) {
  // 1. Fonte 1: todas as Sales do produto
  const sales = await prisma.sale.findMany({
    where: { productSlug },
    select: {
      id: true,
      source: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
    },
  });

  // 2. Fonte 2: EngagedPurchase ja com status PAID (sibling cleanup)
  const paidEngaged = await prisma.engagedPurchase.findMany({
    where: { productSlug, status: "PAID" },
    select: {
      id: true,
      customerName: true,
      customerEmail: true,
      customerPhone: true,
    },
  });

  const allTargets = [
    ...sales.map((s) => ({
      label: `sale ${s.source}:${s.id.slice(0, 8)}`,
      target: {
        customerEmail: s.customerEmail,
        customerPhone: s.customerPhone,
        customerName: s.customerName,
      },
      excludeIds: [] as string[],
    })),
    ...paidEngaged.map((e) => ({
      label: `engaged.paid:${e.id.slice(0, 8)}`,
      target: {
        customerEmail: e.customerEmail,
        customerPhone: e.customerPhone,
        customerName: e.customerName,
      },
      excludeIds: [e.id],
    })),
  ];

  const promotedIds = new Set<string>();
  const auditLog: Array<{
    target: string;
    matchedEngagedIds: Array<{ id: string; match: string }>;
  }> = [];

  for (const t of allTargets) {
    if (dryRun) {
      // Simula: usa a logica de match sem escrever
      const candidates = await prisma.engagedPurchase.findMany({
        where: {
          productSlug,
          status: { not: "PAID" },
          ...(t.excludeIds.length > 0 ? { id: { notIn: t.excludeIds } } : {}),
        },
        select: {
          id: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
        },
      });
      const { isSamePerson, normalizeEmail, phoneTail } = await import(
        "@/lib/engaged-dedup"
      );
      const matched: Array<{ id: string; match: string }> = [];
      for (const c of candidates) {
        if (promotedIds.has(c.id)) continue; // ja contou em iteracao anterior
        if (!isSamePerson(c, t.target)) continue;
        let how = "name";
        const le = normalizeEmail(c.customerEmail);
        const te = normalizeEmail(t.target.customerEmail);
        if (le && te && le === te) how = "email";
        else {
          const lp = phoneTail(c.customerPhone);
          const tp = phoneTail(t.target.customerPhone);
          if (lp && tp && lp === tp) how = "phone";
        }
        matched.push({ id: c.id, match: how });
        promotedIds.add(c.id);
      }
      if (matched.length > 0) {
        auditLog.push({ target: t.label, matchedEngagedIds: matched });
      }
    } else {
      const r = await promoteSiblingLeadsToPaid({
        productSlug,
        target: t.target,
        excludeIds: [...t.excludeIds, ...Array.from(promotedIds)],
        reason: `cleanup via ${t.label}`,
      });
      if (r.promotedIds.length > 0) {
        for (const id of r.promotedIds) promotedIds.add(id);
        auditLog.push({ target: t.label, matchedEngagedIds: r.matchedBy });
      }
    }
  }

  return {
    productSlug,
    mode: dryRun ? "preview" : "applied",
    totalSalesScanned: sales.length,
    totalPaidEngagedScanned: paidEngaged.length,
    totalPromoted: promotedIds.size,
    auditLog,
  };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const product = url.searchParams.get("product") || "claude-pro";
  const result = await runCleanup(product, true);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const product = url.searchParams.get("product") || "claude-pro";
  const result = await runCleanup(product, false);
  return NextResponse.json(result);
}
