/**
 * /api/webhook/engaged — recebe webhook do Engaged quando uma compra
 * eh confirmada e cria/atualiza um Sale no IRIS automaticamente.
 *
 * AUTH: HMAC-SHA256 do body com ENGAGED_WEBHOOK_SECRET (env), enviado
 * no header X-Engaged-Signature ou X-Webhook-Signature. Se a env nao
 * estiver setada, aceita sem validar (modo dev — NAO USAR EM PROD).
 *
 * IDEMPOTENCIA: usa externalId (= order_id/payment_id/transaction_id)
 * pra detectar duplicata. Se ja existe Sale com mesmo externalId, faz
 * update do amount/status/customer (Engaged pode reenviar webhook quando
 * pedido eh confirmado, depois quando pago, etc).
 *
 * STATUS FILTER: so cria Sale quando status indica pagamento confirmado
 * (paid, approved, completed, success, confirmed). Outros status sao
 * logados em DebugLog mas nao viram Sale (evita inflar receita com
 * pedidos pendentes que viram refund).
 *
 * PAYLOAD FLEX: aceita varios formatos comuns de plataformas de checkout
 * (Engaged tem doc propria — quando vier, ajusta o mapping. Hoje aceita
 * tanto {customer:{name,email}} quanto customer_name flat, etc).
 */
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAID_STATUS = new Set([
  "paid", "approved", "completed", "success", "confirmed",
  "pago", "aprovado", "concluido", "sucesso",
]);

const EngagedWebhook = z
  .object({
    // Identificação do evento (Engaged provavelmente envia event_type ou similar)
    event: z.string().optional(),
    event_type: z.string().optional(),
    type: z.string().optional(),

    // IDs (qualquer um pode ser usado como externalId — preferimos order)
    order_id: z.string().optional(),
    payment_id: z.string().optional(),
    transaction_id: z.string().optional(),
    invoice_id: z.string().optional(),
    id: z.union([z.string(), z.number().transform(String)]).optional(),

    // Status
    status: z.string().optional(),
    payment_status: z.string().optional(),

    // Cliente — pode vir nested OU flat
    customer: z
      .object({
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        document: z.string().optional(), // CPF/CNPJ se Engaged enviar
      })
      .optional(),
    customer_name: z.string().optional(),
    customer_email: z.string().optional(),
    customer_phone: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),

    // Valor — em Reais (Engaged provavelmente usa Real direto, não centavos)
    amount: z.coerce.number().optional(),
    total: z.coerce.number().optional(),
    value: z.coerce.number().optional(),
    price: z.coerce.number().optional(),
    currency: z.string().default("BRL"),

    // Datas
    paid_at: z.string().optional(),
    confirmed_at: z.string().optional(),
    created_at: z.string().optional(),
    occurred_at: z.string().optional(),

    // Produto
    product_slug: z.string().optional(),
    product_id: z.union([z.string(), z.number().transform(String)]).optional(),
    products: z.array(z.unknown()).optional(),

    // UTMs (Engaged pode preservar do checkout)
    utm: z
      .object({
        source: z.string().optional(),
        medium: z.string().optional(),
        campaign: z.string().optional(),
        content: z.string().optional(),
        term: z.string().optional(),
      })
      .optional(),
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
  })
  .passthrough(); // aceita campos extras sem reclamar

type Parsed = z.infer<typeof EngagedWebhook>;

function pickStatus(p: Parsed): string {
  return (p.status || p.payment_status || p.event || p.event_type || p.type || "").toLowerCase();
}

function pickExternalId(p: Parsed): string | null {
  return p.order_id || p.payment_id || p.transaction_id || p.invoice_id || p.id || null;
}

function pickName(p: Parsed): string {
  return p.customer?.name || p.customer_name || p.name || "Cliente Engaged";
}

function pickEmail(p: Parsed): string | null {
  return p.customer?.email || p.customer_email || p.email || null;
}

function pickPhone(p: Parsed): string | null {
  return p.customer?.phone || p.customer_phone || p.phone || null;
}

function pickAmount(p: Parsed): number {
  return Number(p.amount ?? p.total ?? p.value ?? p.price ?? 0);
}

function pickProductSlug(p: Parsed): string {
  return p.product_slug || "claude-pro";
}

function pickSaleDate(p: Parsed): Date {
  const ts = p.paid_at || p.confirmed_at || p.occurred_at || p.created_at;
  if (!ts) return new Date();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? new Date() : d;
}

function pickNotes(p: Parsed): string {
  const utm = p.utm || {};
  const utmSrc = utm.source || p.utm_source;
  const utmCamp = utm.campaign || p.utm_campaign;
  const status = pickStatus(p);
  const parts = [
    `Engaged ${status}`,
    p.payment_id ? `pay:${p.payment_id}` : null,
    utmSrc && utmCamp ? `utm:${utmSrc}/${utmCamp}` : null,
  ].filter(Boolean);
  return parts.join(" · ");
}

function verifyHmac(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  // Engaged pode enviar como "sha256=abcdef..." ou direto "abcdef..."
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.replace(/^sha256=/, "").trim();
  if (provided.length !== expected.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // Le body raw pra validar HMAC ANTES de parsear
  const rawBody = await req.text();

  // HMAC validation (se secret configurado)
  const secret = process.env.ENGAGED_WEBHOOK_SECRET;
  if (secret) {
    const sig =
      req.headers.get("x-engaged-signature") ||
      req.headers.get("x-webhook-signature") ||
      req.headers.get("x-hub-signature-256") ||
      null;
    if (!verifyHmac(rawBody, sig, secret)) {
      return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
    }
  }
  // se !secret → modo dev, aceita sem validar (warning no log)

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = EngagedWebhook.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.issues },
      { status: 422 }
    );
  }
  const p = parsed.data;

  const status = pickStatus(p);
  const externalId = pickExternalId(p);
  const productSlug = pickProductSlug(p);

  // Status filter — soh cria Sale quando pagamento confirmado
  if (status && !PAID_STATUS.has(status)) {
    return NextResponse.json(
      { status: "ignored", reason: `status_not_paid (${status})`, externalId },
      { status: 200 }
    );
  }

  if (!externalId) {
    // Sem ID externo eh dificil garantir idempotencia; aceita mas avisa
    console.warn("[engaged-webhook] payload sem externalId — possivel duplicata futura");
  }

  const data = {
    productSlug,
    source: "ENGAGED" as const,
    customerName: pickName(p),
    customerEmail: pickEmail(p),
    customerPhone: pickPhone(p),
    amount: pickAmount(p),
    currency: (p.currency || "BRL").toUpperCase(),
    externalId,
    externalRef: p.payment_id || null,
    notes: pickNotes(p),
    saleDate: pickSaleDate(p),
  };

  if (data.amount <= 0) {
    return NextResponse.json(
      { error: "invalid_amount", amount: data.amount, externalId },
      { status: 422 }
    );
  }

  try {
    // Idempotencia manual: se ja tem Sale com mesmo externalId+source, atualiza
    let sale;
    if (externalId) {
      const existing = await prisma.sale.findFirst({
        where: { source: "ENGAGED", externalId },
      });
      if (existing) {
        sale = await prisma.sale.update({
          where: { id: existing.id },
          data: {
            customerName: data.customerName,
            customerEmail: data.customerEmail,
            customerPhone: data.customerPhone,
            amount: data.amount,
            currency: data.currency,
            notes: data.notes,
            saleDate: data.saleDate,
          },
        });
        return NextResponse.json({ status: "updated", id: sale.id, externalId }, { status: 200 });
      }
    }
    sale = await prisma.sale.create({ data });
    return NextResponse.json({ status: "created", id: sale.id, externalId }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "db_error", message: msg }, { status: 500 });
  }
}

// GET pra debug rapido (so retorna config status, sem secret)
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/webhook/engaged",
    auth: process.env.ENGAGED_WEBHOOK_SECRET ? "hmac_required" : "open (dev mode)",
    accepted_status: Array.from(PAID_STATUS),
    expected_payload_example: {
      event: "purchase.completed",
      order_id: "ord_abc123",
      payment_id: "pay_xyz789",
      status: "paid",
      customer: { name: "Maria Silva", email: "maria@example.com", phone: "+5511999998888" },
      amount: 1499.0,
      currency: "BRL",
      paid_at: "2026-05-12T10:30:00Z",
      utm: { source: "meta", campaign: "M1-prospecting" },
    },
  });
}
