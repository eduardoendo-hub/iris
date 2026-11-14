/**
 * /api/cron/telegram-daily-summary — resumo "Severino 30s" pro Telegram.
 *
 * Formato (lido em ~30s, celular, periferia):
 *
 *   🟠 *CLAUDE PRO · 14/11*
 *
 *   📝 Matrículas *2* _(alvo 3 · -1 vs ontem)_
 *   💸 Mídia *R$ 178* · 1 lead · CAC R$ 178
 *   🌱 Orgânico *184 visitas* · +12% _(google 70%)_
 *
 *   → *Troca REEL-GYM por variante fresca* _(+0.5pp CTR)_
 *   [Dashboard](link) · _+2 ações_
 *
 * Severity (1º glifo lido em periferia): 🟢 INFO · 🟡 WARN · 🟠 HIGH · 🔴 CRITICAL
 *
 * Fonte dos dados: DailyInsight.metricsSnapshot (já coleta captação + mídia
 * + vendas pelo cron /api/cron/daily-insight das 5h BRT). Zero query extra.
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

const DASHBOARD_URL = (process.env.IRIS_DASHBOARD_URL || "https://iris.technowhub.ai").replace(/\/$/, "");

type Rec = { priority?: number; action?: string; expected_impact?: string };

type Snapshot = {
  goals?: { matriculasAlvoCampanha?: number };
  captacao?: {
    visitas?: number;
    leadForm?: number;
    visitasPorFonte?: Array<{
      utmSource?: string | null;
      utmMedium?: string | null;
      visitas?: number;
    }>;
  };
  midia?: {
    spendDia?: number;
    spendDiaMeta?: number;
    spendDiaGoogle?: number;
    clicksAdsDia?: number;
    cpcMedioAds?: number;
  };
  vendas?: {
    novasDia?: number;
    cacDia?: number | null;
  };
  comparacao?: {
    visitasMedia7d?: number;
    vendasMedia7d?: number;
    spendMedia7d?: number;
  };
};

function softTrunc(s: string, maxChars: number): string {
  const t = s.trim();
  if (t.length <= maxChars) return t;
  const slice = t.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  const base = lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice;
  return base.trim() + "…";
}

function cleanImpact(s: string): string {
  return s.replace(/^(impacto|esperado|expected|efeito|resultado)[:\s]+/i, "").trim();
}

function brMoney(n: number): string {
  if (!Number.isFinite(n)) return "R$ 0";
  // Sem centavos pra ficar mais enxuto; se < 100, mostra decimal
  if (n < 100) return `R$ ${n.toFixed(2).replace(".", ",")}`;
  return `R$ ${Math.round(n).toLocaleString("pt-BR")}`;
}

function pctDelta(curr: number, baseline: number): string {
  if (!Number.isFinite(curr) || !Number.isFinite(baseline) || baseline === 0) return "";
  const diff = ((curr - baseline) / baseline) * 100;
  const sign = diff >= 0 ? "+" : "";
  return `${sign}${Math.round(diff)}%`;
}

/** Categoriza fonte como orgânico/paga/direto. */
function sourceCategory(utmSource: string | null | undefined, utmMedium: string | null | undefined): "paid" | "organic" | "direct" | "other" {
  const m = (utmMedium || "").toLowerCase();
  const s = (utmSource || "").toLowerCase();
  if (!s && !m) return "direct";
  if (["cpc", "paid", "ppc", "cpm", "social-paid"].some((x) => m.includes(x))) return "paid";
  if (["organic", "social", "seo", "referral"].some((x) => m.includes(x))) return "organic";
  // Default: UTM presente mas sem medium padronizado → trata como "other"/orgânico-ish
  return "other";
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
      { error: "telegram_not_configured", hint: "Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID in Coolify env" },
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

  const snap = (insight.metricsSnapshot ?? {}) as Snapshot;

  // ─── Linha 1: cabeçalho ──────────────────────────────────────────
  const emoji = SEV_EMOJI[insight.severity] ?? "🟢";
  const prodName = escapeMd(insight.productSlug.replace(/-/g, " ").toUpperCase());
  const dateObj = spDayBucketFromInstant(insight.analysisDate);
  const dd = String(dateObj.getUTCDate()).padStart(2, "0");
  const mm = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const header = `${emoji} *${prodName} · ${escapeMd(`${dd}/${mm}`)}*`;

  // ─── Linha matrículas ─────────────────────────────────────────────
  const matriculas = snap.vendas?.novasDia ?? 0;
  const vendasMedia7d = snap.comparacao?.vendasMedia7d ?? 0;
  const alvoCampanha = snap.goals?.matriculasAlvoCampanha;
  const deltaVendas = pctDelta(matriculas, vendasMedia7d);
  const matrInfo: string[] = [];
  if (alvoCampanha && alvoCampanha > 0) matrInfo.push(`alvo ${alvoCampanha}`);
  if (deltaVendas) matrInfo.push(`${deltaVendas} vs 7d`);
  const matrSuffix = matrInfo.length ? ` _${escapeMd(`(${matrInfo.join(" · ")})`)}_` : "";
  const l_matr = `📝 Matrículas *${matriculas}*${matrSuffix}`;

  // ─── Linha mídia paga ─────────────────────────────────────────────
  const spend = snap.midia?.spendDia ?? 0;
  const spendMeta = snap.midia?.spendDiaMeta ?? 0;
  const spendGoogle = snap.midia?.spendDiaGoogle ?? 0;
  const clicksAds = snap.midia?.clicksAdsDia ?? 0;
  const cacDia = snap.vendas?.cacDia ?? null;
  let l_midia: string;
  if (spend <= 0) {
    l_midia = `💸 Mídia paga *${escapeMd("R$ 0")}* · campanha pausada`;
  } else {
    const parts: string[] = [`💸 Mídia *${escapeMd(brMoney(spend))}*`];
    // Split Meta vs Google quando ambos > 0
    if (spendMeta > 0 && spendGoogle > 0) {
      parts.push(escapeMd(`(M ${brMoney(spendMeta)} · G ${brMoney(spendGoogle)})`));
    }
    if (clicksAds > 0) parts.push(`${clicksAds} ${escapeMd("cliques")}`);
    if (cacDia !== null && cacDia > 0) parts.push(`CAC ${escapeMd(brMoney(cacDia))}`);
    l_midia = parts.join(escapeMd(" · "));
  }

  // ─── Linha orgânica/direto ────────────────────────────────────────
  const visitas = snap.captacao?.visitas ?? 0;
  const visitasMedia7d = snap.comparacao?.visitasMedia7d ?? 0;
  const deltaVisitas = pctDelta(visitas, visitasMedia7d);
  const fontes = snap.captacao?.visitasPorFonte ?? [];

  // Separa orgânico do pago pra reportar só visita não-paid
  let visitasOrganicDirect = 0;
  const topOrganicSources: Record<string, number> = {};
  for (const f of fontes) {
    const cat = sourceCategory(f.utmSource, f.utmMedium);
    if (cat === "organic" || cat === "direct" || cat === "other") {
      const vol = f.visitas ?? 0;
      visitasOrganicDirect += vol;
      const key = f.utmSource || (cat === "direct" ? "direto" : "orgânico");
      topOrganicSources[key] = (topOrganicSources[key] ?? 0) + vol;
    }
  }
  const topEntry = Object.entries(topOrganicSources).sort((a, b) => b[1] - a[1])[0];
  const totalOrg = Object.values(topOrganicSources).reduce((s, v) => s + v, 0);
  const topLabel =
    topEntry && totalOrg > 0
      ? ` _${escapeMd(`(top: ${topEntry[0]} ${Math.round((topEntry[1] / totalOrg) * 100)}%)`)}_`
      : "";
  const deltaLabel = deltaVisitas ? ` · ${escapeMd(deltaVisitas + " vs 7d")}` : "";
  const l_organico = `🌱 Orgânico *${visitasOrganicDirect || visitas} visitas*${deltaLabel}${topLabel}`;

  // ─── Linha ação P1 ────────────────────────────────────────────────
  const recs = (insight.recommendations ?? []) as Rec[];
  const p1 = recs.find((r) => r?.action);
  let l_acao = "";
  if (p1?.action) {
    const action = escapeMd(softTrunc(p1.action, 70));
    const impact = p1.expected_impact ? cleanImpact(p1.expected_impact) : "";
    const impactLabel = impact ? ` _${escapeMd("(" + softTrunc(impact, 30) + ")")}_` : "";
    l_acao = `→ *${action}*${impactLabel}`;
  } else {
    l_acao = `→ _${escapeMd("Sem ação crítica hoje · segue o fluxo")}_`;
  }

  // ─── Linha dashboard + extras ─────────────────────────────────────
  const nExtras = recs.filter((r) => r?.action).length - (p1 ? 1 : 0);
  const extrasLabel =
    nExtras > 0 ? ` · _\\+${nExtras} ${escapeMd(nExtras === 1 ? "ação" : "ações")}_` : "";
  const dashUrl = `${DASHBOARD_URL}/?product=${productFilter}`;
  const l_footer = `[${escapeMd("Dashboard")}](${dashUrl})${extrasLabel}`;

  const msg = [header, "", l_matr, l_midia, l_organico, "", l_acao, l_footer].join("\n");

  if (dryRun) {
    return NextResponse.json({
      sent: 0,
      dry_run: true,
      preview: msg,
      debug: {
        matriculas,
        spend,
        spendMeta,
        spendGoogle,
        clicksAds,
        cacDia,
        visitas,
        visitasOrganicDirect,
        topEntry,
        nRecs: recs.length,
        severity: insight.severity,
      },
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
