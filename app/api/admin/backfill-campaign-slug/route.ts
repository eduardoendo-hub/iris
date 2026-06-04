/**
 * /api/admin/backfill-campaign-slug — popula EngagedPurchase.campaignSlug
 * nos registros legados que ficaram NULL.
 *
 * Contexto: a coluna campaignSlug so passou a existir/ser carimbada depois
 * da feature de ciclo de vida de campanha (commit 6f11910) + migracao
 * 20260601160000. Registros anteriores (e os reprocessados por replay antigo)
 * ficaram com campaignSlug=null, quebrando atribuicao por turma em relatorios.
 *
 * O webhook (processEngagedPayload) JA carimba campaignSlug corretamente em
 * compras novas — este endpoint so conserta o historico.
 *
 * ESTRATEGIA (por registro NULL), na ordem que o ticket pediu:
 *   1. PREFERIDO — sharedId do payload: acha o WebhookLog com o mesmo
 *      externalId, le checkout.sharedId do rawBody e resolve a campanha dona
 *      (getCampaignBySharedId; funciona inclusive p/ campanha ENDED, ex: maio).
 *   2. FALLBACK — janela de eventAt: entre as campanhas do mesmo productSlug,
 *      escolhe aquela cuja janela [start, fim) (getCampaignWindow, usa
 *      endedAt ?? endDate) contem o eventAt do registro.
 *
 * Auth: X-Admin-Secret = IRIS_WEBHOOK_SECRET
 *
 * GET  -> preview (dry run; NAO escreve — serve tambem pra auditar a resolucao)
 * POST -> aplica os UPDATEs
 *
 * Query: ?product=claude-pro  (opcional — default: TODOS os produtos)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCampaignBySharedId, getCampaignWindow } from "@/lib/campaigns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-admin-secret") || "") === secret;
}

/** Extrai checkout.sharedId de um rawBody (string JSON). Best-effort. */
function sharedIdFromRawBody(rawBody: string): string | null {
  try {
    const b = JSON.parse(rawBody) as { checkout?: { sharedId?: unknown } };
    const sid = b?.checkout?.sharedId;
    return typeof sid === "string" && sid ? sid : null;
  } catch {
    return null;
  }
}

type Resolution = {
  id: string;
  productSlug: string;
  externalId: string;
  eventAt: Date;
  resolved: string | null;
  via: "sharedId" | "window" | "none";
  sharedId?: string | null;
  /** quando sharedId e janela discordam — sinaliza pra auditoria */
  windowSlug?: string | null;
  conflict?: boolean;
};

async function runBackfill(productSlug: string | null, dryRun: boolean) {
  // 1) Registros alvo: campaignSlug ainda NULL
  const nulls = await prisma.engagedPurchase.findMany({
    where: { campaignSlug: null, ...(productSlug ? { productSlug } : {}) },
    select: { id: true, productSlug: true, externalId: true, eventAt: true },
  });

  // 2) Campanhas (uma query) — pra resolucao por sharedId e por janela.
  const campaigns = await prisma.campaign.findMany({
    select: {
      slug: true,
      productSlug: true,
      startDate: true,
      endDate: true,
      endedAt: true,
      status: true,
      engagedCheckoutSharedIds: true,
    },
  });
  // Mapa sharedId -> slug (campanha dona). Resolve inclusive ENDED.
  const slugBySharedId = new Map<string, string>();
  for (const c of campaigns) {
    for (const sid of c.engagedCheckoutSharedIds ?? []) slugBySharedId.set(sid, c.slug);
  }
  // Janelas por produto, pra fallback. Cada campanha vira [since, untilExcl).
  const windowsByProduct = new Map<
    string,
    Array<{ slug: string; since: number; until: number }>
  >();
  for (const c of campaigns) {
    const w = getCampaignWindow(c);
    const arr = windowsByProduct.get(c.productSlug) ?? [];
    arr.push({ slug: c.slug, since: w.sinceUTC.getTime(), until: w.untilExclusiveUTC.getTime() });
    windowsByProduct.set(c.productSlug, arr);
  }

  // 3) sharedId do payload por externalId (fonte preferida). Busca os logs
  //    engaged dos externalIds em jogo e mapeia externalId -> sharedId.
  const externalIds = Array.from(new Set(nulls.map((n) => n.externalId)));
  const sharedIdByExternalId = new Map<string, string>();
  if (externalIds.length > 0) {
    const logs = await prisma.webhookLog.findMany({
      where: { source: "engaged", externalId: { in: externalIds } },
      orderBy: { receivedAt: "asc" }, // re-entregas: ultima (com sharedId) vence
      select: { externalId: true, rawBody: true },
    });
    for (const log of logs) {
      if (!log.externalId) continue;
      const sid = sharedIdFromRawBody(log.rawBody);
      if (sid) sharedIdByExternalId.set(log.externalId, sid);
    }
  }

  // 4) Resolve cada registro: sharedId primeiro, janela como fallback.
  const resolutions: Resolution[] = nulls.map((n) => {
    const eventAtMs = n.eventAt.getTime();
    // Fallback por janela (calcula sempre, pra detectar conflito)
    const wins = windowsByProduct.get(n.productSlug) ?? [];
    const windowSlug =
      wins.find((w) => eventAtMs >= w.since && eventAtMs < w.until)?.slug ?? null;

    // Preferido: sharedId do payload
    const sid = sharedIdByExternalId.get(n.externalId) ?? null;
    const sharedSlug = sid ? slugBySharedId.get(sid) ?? null : null;

    let resolved: string | null;
    let via: Resolution["via"];
    if (sharedSlug) {
      resolved = sharedSlug;
      via = "sharedId";
    } else if (windowSlug) {
      resolved = windowSlug;
      via = "window";
    } else {
      resolved = null;
      via = "none";
    }

    return {
      id: n.id,
      productSlug: n.productSlug,
      externalId: n.externalId,
      eventAt: n.eventAt,
      resolved,
      via,
      sharedId: sid,
      windowSlug,
      conflict: !!(sharedSlug && windowSlug && sharedSlug !== windowSlug),
    };
  });

  // 5) Aplica (ou simula)
  let updated = 0;
  if (!dryRun) {
    for (const r of resolutions) {
      if (!r.resolved) continue;
      await prisma.engagedPurchase.update({
        where: { id: r.id },
        data: { campaignSlug: r.resolved },
      });
      updated++;
    }
  }

  // 6) Sumario
  const bySlug: Record<string, number> = {};
  const byVia: Record<string, number> = { sharedId: 0, window: 0, none: 0 };
  for (const r of resolutions) {
    byVia[r.via]++;
    if (r.resolved) bySlug[r.resolved] = (bySlug[r.resolved] ?? 0) + 1;
  }
  const conflicts = resolutions.filter((r) => r.conflict);
  const unresolved = resolutions.filter((r) => !r.resolved);

  return {
    mode: dryRun ? "preview" : "applied",
    scope: productSlug ?? "ALL",
    totalNull: nulls.length,
    wouldResolve: resolutions.filter((r) => r.resolved).length,
    updated: dryRun ? 0 : updated,
    byVia,
    bySlug,
    conflicts: conflicts.map((c) => ({
      id: c.id,
      productSlug: c.productSlug,
      eventAt: c.eventAt,
      sharedId: c.sharedId,
      sharedSlug: c.resolved,
      windowSlug: c.windowSlug,
    })),
    unresolved: unresolved.map((u) => ({
      id: u.id,
      productSlug: u.productSlug,
      externalId: u.externalId,
      eventAt: u.eventAt,
      sharedId: u.sharedId,
    })),
  };
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const product = new URL(req.url).searchParams.get("product");
  const result = await runBackfill(product, true);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const product = new URL(req.url).searchParams.get("product");
  const result = await runBackfill(product, false);
  return NextResponse.json(result);
}
