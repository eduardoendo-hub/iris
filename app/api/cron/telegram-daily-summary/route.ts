/**
 * /api/cron/telegram-daily-summary — envia o resumo diario pro Telegram.
 *
 * Fluxo:
 *   1. Le o ultimo DailyInsight gerado (produto-wide ou por campanha ativa)
 *      do claude-pro (ou de todos se ?all=1)
 *   2. Monta mensagem markdown com headline + summary + top recomendacoes
 *   3. Envia via sendTelegramMessage()
 *
 * Pre-requisitos:
 *   - /api/cron/daily-insight deve ter rodado ANTES (geralmente 5h BRT),
 *     populando DailyInsight. Se nao tiver insight pra hoje nem ontem,
 *     retorna "no_insight" e nao envia.
 *   - Env vars TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID no Coolify.
 *
 * Auth: header X-Cron-Secret = CRON_SECRET (mesmo da daily-insight).
 *
 * Query:
 *   ?product=claude-pro  (default — unico produto hoje)
 *   ?all=1               (envia insight de TODOS os produtos ativos)
 *   ?dry_run=1           (nao envia; retorna o markdown que seria enviado)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { escapeMd, formatBRL, sendTelegramMessage, telegramConfigured } from "@/lib/telegram";
import { spDayBucketFromInstant } from "@/lib/time-buckets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (req.headers.get("x-cron-secret") || "") === secret;
}

const SEVERITY_EMOJI: Record<string, string> = {
  INFO: "📊",
  WARN: "⚠️",
  HIGH: "🔥",
  CRITICAL: "🚨",
};

type Recommendation = {
  priority?: number;
  action?: string;
  expected_impact?: string;
};

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "1";
  const dryRun = url.searchParams.get("dry_run") === "1";
  const productFilter = url.searchParams.get("product") || "claude-pro";

  if (!telegramConfigured() && !dryRun) {
    return NextResponse.json(
      { error: "telegram_not_configured", hint: "Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in Coolify env" },
      { status: 503 }
    );
  }

  // Busca o insight mais recente (ultimo gerado nas ultimas 36h)
  const since = new Date(Date.now() - 36 * 60 * 60 * 1000);
  const insights = await prisma.dailyInsight.findMany({
    where: {
      productSlug: all ? undefined : productFilter,
      generatedAt: { gte: since },
    },
    orderBy: [{ generatedAt: "desc" }],
    take: all ? 10 : 1,
  });

  if (insights.length === 0) {
    return NextResponse.json({
      sent: 0,
      reason: "no_insight",
      hint: "/api/cron/daily-insight precisa rodar primeiro (05:00 BRT)",
    });
  }

  const results: Array<{ productSlug: string; sent: boolean; reason?: string }> = [];

  for (const ins of insights) {
    const emoji = SEVERITY_EMOJI[ins.severity] ?? "📊";
    const dateStr = spDayBucketFromInstant(ins.analysisDate).toISOString().slice(0, 10);
    const prodLabel = escapeMd(ins.productSlug.toUpperCase());

    const recs = ((ins.recommendations ?? []) as Recommendation[])
      .filter((r) => r?.action)
      .slice(0, 3);

    const recsBlock = recs.length
      ? recs
          .map((r, i) => {
            const prio = r.priority ? `P${r.priority}` : `${i + 1}`;
            const impact = r.expected_impact ? ` _${escapeMd(r.expected_impact)}_` : "";
            return `${escapeMd(prio)}\\. ${escapeMd(r.action!)}${impact}`;
          })
          .join("\n")
      : escapeMd("(sem recomendações críticas hoje)");

    const msg = [
      `${emoji} *${prodLabel}* · ${escapeMd(dateStr)}`,
      ``,
      `*${escapeMd(ins.headline)}*`,
      ``,
      escapeMd(ins.summary),
      ``,
      `🎯 *Ações recomendadas:*`,
      recsBlock,
    ].join("\n");

    if (dryRun) {
      results.push({ productSlug: ins.productSlug, sent: false, reason: "dry_run" });
      continue;
    }

    const r = await sendTelegramMessage(msg);
    results.push({
      productSlug: ins.productSlug,
      sent: r.ok,
      reason: r.ok ? undefined : r.description,
    });
  }

  return NextResponse.json({
    sent: results.filter((r) => r.sent).length,
    total: results.length,
    results,
  });
}
