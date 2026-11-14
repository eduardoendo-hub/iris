/**
 * /api/cron/telegram-daily-summary — resumo "Severino 10s" pro Telegram.
 *
 * Formato (4 linhas, lido em periferia em 10s):
 *   🟢 *PRODUTO · dd/MM* — N vendas _(alvo X)_
 *   {headline curto, ≤55 chars}
 *   → *{P1 action}* _(impacto)_
 *   [Análise](dashboard) · _+N P2/P3_
 *
 * Severity emoji: 🟢 INFO · 🟡 WARN · 🟠 HIGH · 🔴 CRITICAL
 *
 * Fonte: DailyInsight (gerado pelo cron /api/cron/daily-insight às 5h BRT)
 *        + query direta de Sale pra vendas do dia (não vem da LLM).
 *
 * Auth: X-Cron-Secret = CRON_SECRET
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { escapeMd, sendTelegramMessage, telegramConfigured } from "@/lib/telegram";
import { spDayBucketFromInstant } from "@/lib/time-buckets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-cron-secret") || "") === secret;
}

const SEV_EMOJI: Record<string, string> = {
  INFO: "🟢",
  WARN: "🟡",
  HIGH: "🟠",
  CRITICAL: "🔴",
};

const DASHBOARD_URL = process.env.IRIS_DASHBOARD_URL || "https://iris.technowhub.ai/";

type Rec = { priority?: number; action?: string; expected_impact?: string };

/** Trunca no último espaço antes de maxChars, adiciona reticências. */
function softTrunc(s: string, maxChars: number): string {
  const t = s.trim();
  if (t.length <= maxChars) return t;
  const slice = t.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice;
  return base.trim() + "…";
}

/** Remove prefixos redundantes ("impacto:", "esperado:", etc). */
function cleanImpact(s: string): string {
  return s.replace(/^(impacto|esperado|expected|efeito|resultado)[:\s]+/i, "").trim();
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dry_run") === "1";
  const productFilter = url.searchParams.get("product") || "claude-pro";

  if (!telegramConfigured() && !dryRun) {
    return NextResponse.json(
      {
        error: "telegram_not_configured",
        hint: "Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in Coolify env",
      },
      { status: 503 }
    );
  }

  const since = new Date(Date.now() - 36 * 60 * 60 * 1000);
  const insight = await prisma.dailyInsight.findFirst({
    where: { productSlug: productFilter, generatedAt: { gte: since } },
    orderBy: { generatedAt: "desc" },
  });

  if (!insight) {
    return NextResponse.json({
      sent: 0,
      reason: "no_insight",
      hint: "/api/cron/daily-insight precisa rodar primeiro (05:00 BRT)",
    });
  }

  // Vendas do dia analisado + dia anterior pro delta (query direta, não via LLM)
  const dayStart = spDayBucketFromInstant(insight.analysisDate);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const prevStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);

  const [salesToday, salesYesterday] = await Promise.all([
    prisma.sale.count({
      where: { productSlug: productFilter, saleDate: { gte: dayStart, lt: dayEnd } },
    }),
    prisma.sale.count({
      where: { productSlug: productFilter, saleDate: { gte: prevStart, lt: dayStart } },
    }),
  ]);

  // Delta simples
  let deltaLabel = "";
  if (salesYesterday > 0 || salesToday > 0) {
    const diff = salesToday - salesYesterday;
    if (diff === 0) deltaLabel = "igual ontem";
    else if (diff > 0) deltaLabel = `+${diff} vs ontem`;
    else deltaLabel = `${diff} vs ontem`;
  }

  // Monta linhas
  const emoji = SEV_EMOJI[insight.severity] ?? "🟢";
  const prodName = escapeMd(insight.productSlug.replace(/-/g, " ").toUpperCase());
  const dateObj = spDayBucketFromInstant(insight.analysisDate);
  const dd = String(dateObj.getUTCDate()).padStart(2, "0");
  const mm = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const dateStr = escapeMd(`${dd}/${mm}`);

  // Linha 1: sinal + produto · data — vendas (delta)
  const salesLabel = `${salesToday} venda${salesToday === 1 ? "" : "s"}`;
  const l1 = `${emoji} *${prodName} · ${dateStr}* — ${escapeMd(salesLabel)}${deltaLabel ? ` _${escapeMd("(" + deltaLabel + ")")}_` : ""}`;

  // Linha 2: headline curto
  const l2 = escapeMd(softTrunc(insight.headline, 55));

  // Linha 3: P1 action + impacto
  const recs = (insight.recommendations ?? []) as Rec[];
  const p1 = recs.find((r) => r?.action);
  let l3 = "";
  if (p1?.action) {
    const action = escapeMd(softTrunc(p1.action, 60));
    const impact = p1.expected_impact ? cleanImpact(p1.expected_impact) : "";
    const impactLabel = impact ? ` _${escapeMd("(" + softTrunc(impact, 25) + ")")}_` : "";
    l3 = `→ *${action}*${impactLabel}`;
  }

  // Linha 4: link dashboard + contador P2/P3
  const nExtras = recs.filter((r) => r?.action).length - (p1 ? 1 : 0);
  const extrasLabel = nExtras > 0 ? ` · _\\+${nExtras} ${escapeMd(nExtras === 1 ? "ação" : "ações")}_` : "";
  const dashUrl = `${DASHBOARD_URL.replace(/\/$/, "")}/?product=${productFilter}`;
  const l4 = `[${escapeMd("Análise")}](${dashUrl})${extrasLabel}`;

  const msg = [l1, l2, l3, l4].filter(Boolean).join("\n");

  if (dryRun) {
    return NextResponse.json({
      sent: 0,
      dry_run: true,
      preview: msg,
      debug: { salesToday, salesYesterday, severity: insight.severity, nRecs: recs.length },
    });
  }

  const r = await sendTelegramMessage(msg);
  return NextResponse.json({
    sent: r.ok ? 1 : 0,
    status: r.status,
    error: r.ok ? undefined : r.description,
    preview: msg,
  });
}
