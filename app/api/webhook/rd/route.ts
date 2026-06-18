/**
 * Webhook receiver para o microserviço `integracao-rd`.
 *
 * Endpoint: POST /api/webhook/rd
 *
 * O `integracao-rd` chama este endpoint após criar/tentar criar um Lead no RD CRM
 * e também quando o usuário clica em WhatsApp na LP. Este handler:
 *   1. Valida a assinatura HMAC-SHA256 (header `X-Iris-Signature`).
 *   2. Persiste o lead em `Lead` (Prisma).
 *   3. Retorna 200 mesmo em caso de duplicata (idempotente por design).
 *
 * Eventos esperados:
 *   - `lead.created`     — formulário "Falar com especialista" enviado
 *   - `whatsapp.click`   — clique no CTA WhatsApp
 *
 * Segurança: a chave HMAC é compartilhada via env var `IRIS_WEBHOOK_SECRET`.
 * Sem assinatura válida → 401.
 */

import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RDPayload = {
  campaign_slug?: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  perfil?: string | null;
  source_page?: string | null;
  utm?: {
    source?: string | null;
    medium?: string | null;
    campaign?: string | null;
    content?: string | null;
    term?: string | null;
  } | null;
  rd_crm?: {
    contact_id?: string | null;
    deal_id?: string | null;
    status?: string | null;
  } | null;
};

type Envelope = { event: string; payload: RDPayload };

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.IRIS_WEBHOOK_SECRET;
  if (!secret) return true;             // sem segredo configurado → assinatura desabilitada
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// Aliases de campanha → produto único no cockpit. Hub e página de IA reportam
// product_slug='corporativo' nos eventos; aqui unificamos os LEADS também
// (a página de IA usa campaign_slug='corporativo-ia' p/ segmentar no RD CRM,
// mas no IRIS cai sob o mesmo produto 'corporativo'). O campaignSlug original
// continua salvo no Lead, então dá pra distinguir IA × hub na lista.
const CAMPAIGN_PRODUCT_ALIASES: Record<string, string> = {
  "corporativo-ia": "corporativo",
};

function productSlugFromCampaign(campaignSlug: string | undefined): string {
  if (!campaignSlug) return "unknown";
  if (CAMPAIGN_PRODUCT_ALIASES[campaignSlug]) return CAMPAIGN_PRODUCT_ALIASES[campaignSlug];
  // "claude-pro-maio-2026" → "claude-pro" (prefixo até a primeira data/sufixo)
  return campaignSlug.replace(/-(?:maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|janeiro|fevereiro|março|abril)-\d{4}$/i, "");
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-iris-signature");
  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let envelope: Envelope;
  try {
    envelope = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { event, payload } = envelope;
  if (!event || !payload) {
    return NextResponse.json({ error: "missing event/payload" }, { status: 400 });
  }

  if (event !== "lead.created" && event !== "whatsapp.click") {
    return NextResponse.json({ status: "ignored", event }, { status: 200 });
  }

  try {
    const lead = await prisma.lead.create({
      data: {
        productSlug:    productSlugFromCampaign(payload.campaign_slug),
        campaignSlug:   payload.campaign_slug ?? "unknown",
        eventType:      event === "lead.created" ? "FORM_SUBMIT" : "WHATSAPP_CLICK",
        name:           payload.name ?? null,
        email:          payload.email ?? null,
        phone:          payload.phone ?? null,
        perfil:         payload.perfil ?? null,
        utmSource:      payload.utm?.source ?? null,
        utmMedium:      payload.utm?.medium ?? null,
        utmCampaign:    payload.utm?.campaign ?? null,
        utmContent:     payload.utm?.content ?? null,
        utmTerm:        payload.utm?.term ?? null,
        sourcePage:     payload.source_page ?? null,
        rdCrmContactId: payload.rd_crm?.contact_id ?? null,
        rdCrmDealId:    payload.rd_crm?.deal_id ?? null,
        rdCrmStatus:    payload.rd_crm?.status ?? null,
        rawJson:        payload as object,
      },
    });
    return NextResponse.json({ status: "ok", lead_id: lead.id }, { status: 200 });
  } catch (err) {
    console.error("[webhook/rd] failed to persist lead", err);
    return NextResponse.json({ error: "persistence failed" }, { status: 500 });
  }
}
