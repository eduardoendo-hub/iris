/**
 * /api/events — recebe eventos de qualquer LP em tempo real (Plano C).
 *
 * Substitui a dependencia do GA4 Data API: em vez do IRIS PUXAR metricas
 * do GA4 (que precisa de Service Account aceito pelo GA4 — UI bloqueia
 * em algumas contas), a LP EMPURRA cada evento direto pra ca via fetch
 * keepalive ou sendBeacon. Real-time, sem cron, sem Google auth.
 *
 * Idempotencia: cada POST INCREMENTA o contador do bucket DAY do dia
 * atual. Se a mesma pagina dispara o mesmo evento N vezes (nao deveria,
 * mas), conta N. Aceitavel — eh o mesmo comportamento que o GA4 teria.
 *
 * CORS: aceita origens whitelisted (claude.technowhub.ai +). LP roda no
 * navegador, entao precisa de header Access-Control-Allow-Origin certo.
 *
 * Sem auth: endpoint publico, eh igual ao Pixel/GA4 — qualquer browser
 * pode disparar. Spam mitigado por:
 *   1. CORS rigoroso
 *   2. Rate limit eventual (TODO se virar problema)
 *   3. Whitelist de event_name (so eventos validos contam)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { spDayBucketFromInstant } from "@/lib/time-buckets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// LPs autorizadas a postar eventos. Adicionar novas LPs aqui.
const ALLOWED_ORIGINS = new Set([
  // Curso Claude Pro
  "https://claude.impacta.com.br",       // canonico (branding Impacta)
  "https://claude.technowhub.ai",        // alias hosted (mesma LP)
  // People AI Lab
  "https://peopleai.impacta.com.br",     // canonico (branding Impacta)
  "https://peopleai.technowhub.ai",      // alias hosted (mesma LP)
  // Outros produtos / futuras LPs
  "https://impacta.technowhub.ai",
  // Dev
  "http://localhost:3000",
  "http://localhost:8080",
]);

const VALID_EVENTS = [
  "lp_view",
  "click_compra",
  "click_consultor",
  "click_whats",
  "lead_form",
] as const;

const EventInput = z.object({
  product_slug: z.string().min(1).max(64).default("claude-pro"),
  event_name: z.enum(VALID_EVENTS),
  campaign_slug: z.string().max(128).nullish(),
  page_url: z.string().max(500).nullish(),
  value: z.coerce.number().nullish(),
  currency: z.string().length(3).nullish(),
  ts: z.coerce.date().optional(),
  meta: z.record(z.string(), z.unknown()).nullish(),
  // UTMs — capturados pela LP a partir da URL e persistidos em sessionStorage.
  // Granularidade por canal (RD Station email, Google CPC, Meta organico, etc.)
  utm_source: z.string().max(120).nullish(),
  utm_medium: z.string().max(120).nullish(),
  utm_campaign: z.string().max(200).nullish(),
  utm_content: z.string().max(200).nullish(),
  utm_term: z.string().max(200).nullish(),
  referrer: z.string().max(500).nullish(),
});

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://claude.technowhub.ai";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// Bucket DAY agora em SP (= UTC-3). Antes: utcDayBucket fazia midnight UTC,
// o que jogava todos os eventos da manha SP no dia anterior na view analitica.
// Ver lib/time-buckets.ts.

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  const headers = corsHeaders(origin);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400, headers });
  }
  const parsed = EventInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422, headers }
    );
  }
  const data = parsed.data;
  const at = data.ts ?? new Date();
  const bucket = spDayBucketFromInstant(at);

  try {
    // (1) MetricSample — agregado por dia (rapido pro cockpit KPI cards).
    // Upsert: increment contador do dia atual pra esse (productSlug, evento).
    const sample = await prisma.metricSample.upsert({
      where: {
        productSlug_source_metric_bucket_startsAt: {
          productSlug: data.product_slug,
          source: "GA4", // Mantem source=GA4 (eventos vem do mesmo gtag da LP)
          metric: data.event_name,
          bucket: "DAY",
          startsAt: bucket,
        },
      },
      create: {
        productSlug: data.product_slug,
        source: "GA4",
        metric: data.event_name,
        bucket: "DAY",
        startsAt: bucket,
        value: 1,
        unit: "count",
        meta: {
          first_seen_at: at.toISOString(),
          campaign_slug: data.campaign_slug ?? null,
          first_page_url: data.page_url ?? null,
        },
      },
      update: {
        value: { increment: 1 },
      },
    });

    // (2) VisitEvent — append granular pra analise por canal (UTM).
    // Best-effort: nao falha o request se VisitEvent quebrar (legado funciona
    // com MetricSample sozinho). Mas em condicao normal grava ambos.
    let visitEventId: string | undefined;
    try {
      const ve = await prisma.visitEvent.create({
        data: {
          productSlug: data.product_slug,
          eventName: data.event_name,
          campaignSlug: data.campaign_slug ?? null,
          pageUrl: data.page_url ?? null,
          utmSource: data.utm_source ?? null,
          utmMedium: data.utm_medium ?? null,
          utmCampaign: data.utm_campaign ?? null,
          utmContent: data.utm_content ?? null,
          utmTerm: data.utm_term ?? null,
          referrer: data.referrer ?? null,
          value: data.value != null ? data.value.toString() : null,
          currency: data.currency ?? null,
          ts: at,
        },
      });
      visitEventId = ve.id;
    } catch (e) {
      // Loga mas nao falha (cockpit antigo nao depende disso)
      console.warn("[events] VisitEvent insert failed:", e instanceof Error ? e.message : e);
    }

    return NextResponse.json(
      { status: "ok", metric: sample.metric, value: Number(sample.value), visitEventId },
      { status: 200, headers }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "db_error", message: msg }, { status: 500, headers });
  }
}
