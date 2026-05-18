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
import { PRODUCTS, type ProductConfig } from "@/lib/products";
import { promoteSiblingLeadsToPaid } from "@/lib/engaged-dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAID_STATUS = new Set([
  "paid", "approved", "completed", "success", "confirmed",
  "pago", "aprovado", "concluido", "sucesso",
]);

/**
 * Mapeia o `eventType` do Engaged pro status interno do EngagedPurchase.
 * Tabela canonica do Engaged:
 *   purchase.lead_captured                     → DRAFT
 *   purchase.open.payment.waiting_payment      → WAITING_PAYMENT
 *   purchase.open.payment.canceled             → CANCELED
 *   purchase.refused                           → REFUSED
 *   purchase.expired                           → EXPIRED
 *   purchase.paid                              → PAID
 * Outros eventos (purchase.refund, purchase.chargeback, etc) retornam null
 * → handler ignora pra nao poluir tabela com estados nao mapeados.
 */
function mapEventTypeToStatus(eventType: string | undefined | null): string | null {
  if (!eventType) return null;
  const et = eventType.toLowerCase().trim();
  if (et === "purchase.lead_captured") return "DRAFT";
  if (et === "purchase.open.payment.waiting_payment") return "WAITING_PAYMENT";
  if (et === "purchase.open.payment.canceled") return "CANCELED";
  if (et === "purchase.refused") return "REFUSED";
  if (et === "purchase.expired") return "EXPIRED";
  if (et === "purchase.paid") return "PAID";
  return null;
}

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

    // Valor — em Reais (campos comuns no payload raiz)
    amount: z.coerce.number().optional(),
    total: z.coerce.number().optional(),
    value: z.coerce.number().optional(),
    price: z.coerce.number().optional(),
    currency: z.string().default("BRL"),

    // ENGAGED — payload real usa _id na raiz + invoice/checkout nested
    _id: z.union([z.string(), z.number().transform(String)]).optional(),
    eventType: z.string().optional(),

    // Engaged: invoice nested com discountedAmount (em CENTAVOS)
    invoice: z
      .object({
        _id: z.union([z.string(), z.number().transform(String)]).optional(),
        discountedAmount: z.number().optional(),
        items: z.array(z.unknown()).optional(),
      })
      .partial()
      .passthrough()
      .optional(),

    // Engaged: checkout nested com invoiceTotalAmount (em CENTAVOS)
    checkout: z
      .object({
        _id: z.union([z.string(), z.number().transform(String)]).optional(),
        invoiceTotalAmount: z.number().optional(),
        invoiceItemsAmount: z.number().optional(),
        status: z.string().optional(),
        description: z.string().optional(),
        sharedId: z.string().optional(),
      })
      .partial()
      .passthrough()
      .optional(),

    // Engaged: buyer/payer info (nome varia conforme plataforma)
    buyer: z
      .object({
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        document: z.string().optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    payer: z
      .object({
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
      })
      .partial()
      .passthrough()
      .optional(),

    // ENGAGED real schema: user (account) + userPaymentProfile (billing info)
    user: z
      .object({
        _id: z.string().optional(),
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        document: z.string().optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    userPaymentProfile: z
      .object({
        _id: z.string().optional(),
        name: z.string().optional(),
        email: z.string().optional(),
        phone: z.string().optional(),
        document: z.string().optional(),
      })
      .partial()
      .passthrough()
      .optional(),
    // Engaged: queryParams contem UTMs do redirect da LP pra recuperar
    // origem da venda no IRIS
    queryParams: z.record(z.string(), z.unknown()).optional(),

    // Datas — Engaged usa camelCase no payload real (updatedAt/createdAt)
    paid_at: z.string().optional(),
    confirmed_at: z.string().optional(),
    created_at: z.string().optional(),
    occurred_at: z.string().optional(),
    updatedAt: z.string().optional(), // Engaged: hora do ultimo evento (PAID = pagamento)
    createdAt: z.string().optional(), // Engaged: hora da criacao da compra

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
  // Engaged manda eventType "purchase.paid" — pega depois do ponto
  const eventType = (p.eventType || "").toLowerCase();
  if (eventType.includes(".")) {
    const suffix = eventType.split(".").pop() || "";
    if (suffix) return suffix; // "purchase.paid" -> "paid"
  }
  return (
    p.status ||
    p.payment_status ||
    p.event ||
    p.event_type ||
    p.type ||
    eventType ||
    ""
  ).toLowerCase();
}

function pickExternalId(p: Parsed): string | null {
  // Engaged: usa _id na raiz como ID do evento de webhook
  return (
    p.order_id ||
    p.payment_id ||
    p.transaction_id ||
    p.invoice_id ||
    p.id ||
    p._id ||
    p.invoice?._id ||
    p.checkout?._id ||
    null
  );
}

function pickName(p: Parsed): string {
  return (
    // Engaged real: user.name eh a fonte primaria
    p.user?.name ||
    p.userPaymentProfile?.name ||
    // Outros gateways / fallbacks
    p.customer?.name ||
    p.customer_name ||
    p.buyer?.name ||
    p.payer?.name ||
    p.name ||
    "Cliente Engaged"
  );
}

function pickEmail(p: Parsed): string | null {
  return (
    p.user?.email ||
    p.userPaymentProfile?.email ||
    p.customer?.email ||
    p.customer_email ||
    p.buyer?.email ||
    p.payer?.email ||
    p.email ||
    null
  );
}

function pickPhone(p: Parsed): string | null {
  return (
    p.user?.phone ||
    p.userPaymentProfile?.phone ||
    p.customer?.phone ||
    p.customer_phone ||
    p.buyer?.phone ||
    p.payer?.phone ||
    p.phone ||
    null
  );
}

function pickAmount(p: Parsed): number {
  // 1) Campos diretos em Reais (outros gateways)
  const directAmount = Number(p.amount ?? p.total ?? p.value ?? p.price ?? 0);
  if (directAmount > 0) return directAmount;

  // 2) Engaged: valores em CENTAVOS dentro de invoice/checkout
  //    PRIORIDADE: paidAmount > totalAmount (apos desconto) > invoiceTotalAmount
  //    NUNCA usar discountedAmount sozinho — esse eh o VALOR DO DESCONTO,
  //    nao o pago. Ja deu bug em prod confundindo desconto com receita.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invAny = (p.invoice ?? {}) as Record<string, any>;
  const cents =
    invAny.paidAmount ??
    invAny.totalAmount ??
    p.checkout?.invoiceTotalAmount ??
    p.checkout?.invoiceItemsAmount ??
    invAny.discountedAmount ?? // fallback final (legado)
    0;
  if (cents > 0) return Number(cents) / 100;

  return 0;
}

/**
 * Identifica qual produto IRIS esse webhook representa, baseado em sharedId
 * + productId(s). Retorna null se nenhum produto configurado bate
 * (geralmente webhook de OUTRO produto da Impacta — MBA, Faculdade, etc).
 */
function matchProduct(p: Parsed): ProductConfig | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ck = (p.checkout ?? {}) as Record<string, any>;
  const sharedId = typeof ck.sharedId === "string" ? ck.sharedId : null;

  // Coleta todos productIds presentes no payload (pode ter multi-item)
  const productIds: string[] = [];
  if (Array.isArray(ck.invoiceItems)) {
    for (const item of ck.invoiceItems) {
      const pid = item?.product?._id;
      if (typeof pid === "string") productIds.push(pid);
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invAny = (p.invoice ?? {}) as Record<string, any>;
  if (Array.isArray(invAny.items)) {
    for (const item of invAny.items) {
      const pid = item?.product?._id;
      if (typeof pid === "string" && !productIds.includes(pid)) productIds.push(pid);
    }
  }

  // Procura match em qualquer produto configurado
  for (const product of Object.values(PRODUCTS)) {
    const sharedMatch =
      sharedId && product.engagedCheckoutSharedIds?.includes(sharedId);
    const productMatch =
      product.engagedProductIds &&
      productIds.some((pid) => product.engagedProductIds!.includes(pid));
    if (sharedMatch || productMatch) return product;
  }
  return null;
}

// REMOVIDO pickProductSlug — agora usamos matchProduct() que retorna o
// ProductConfig completo baseado em sharedId/productId. Mais robusto.

function pickSaleDate(p: Parsed): Date {
  // Ordem de preferencia: paid_at (campo explicito de pagamento) →
  // confirmed_at → updatedAt (Engaged real, hora do ULTIMO evento) →
  // occurred_at → createdAt/created_at (criacao da compra).
  // updatedAt prevalece sobre createdAt pq o webhook eh sobre o EVENTO
  // mais recente, nao a primeira criacao.
  const ts =
    p.paid_at ||
    p.confirmed_at ||
    p.updatedAt ||
    p.occurred_at ||
    p.createdAt ||
    p.created_at;
  if (!ts) return new Date();
  const d = new Date(ts);
  return isNaN(d.getTime()) ? new Date() : d;
}

function pickNotes(p: Parsed): string {
  const utm = p.utm || {};
  // Engaged: queryParams pode conter UTMs do redirect da LP
  const q = (p.queryParams || {}) as Record<string, unknown>;
  const utmSrc =
    utm.source || p.utm_source || (typeof q.utm_source === "string" ? q.utm_source : undefined);
  const utmCamp =
    utm.campaign || p.utm_campaign || (typeof q.utm_campaign === "string" ? q.utm_campaign : undefined);
  const utmCnt = typeof q.utm_content === "string" ? q.utm_content : undefined;
  const status = pickStatus(p);
  const parts = [
    `Engaged ${status}`,
    p.payment_id ? `pay:${p.payment_id}` : null,
    utmSrc && utmCamp ? `utm:${utmSrc}/${utmCamp}${utmCnt ? `/${utmCnt}` : ""}` : null,
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

function verifyBearer(provided: string | null, secret: string): boolean {
  if (!provided) return false;
  // Aceita "Bearer xxx" ou "xxx" direto
  const value = provided.replace(/^Bearer\s+/i, "").trim();
  if (value.length !== secret.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(value), Buffer.from(secret));
  } catch {
    return false;
  }
}

/** Captura headers relevantes (sem expor secret completo) */
function captureHeaders(req: NextRequest): Record<string, string> {
  const interesting = [
    "user-agent",
    "content-type",
    "x-engaged-signature",
    "x-webhook-signature",
    "x-hub-signature-256",
    "authorization",
    "x-engaged-secret",
    "x-webhook-secret",
    "x-forwarded-for",
    "x-real-ip",
  ];
  const out: Record<string, string> = {};
  for (const h of interesting) {
    const v = req.headers.get(h);
    if (v) {
      // mascara secrets/tokens nos logs — guarda só primeiros/últimos chars
      if (/(secret|signature|authorization)/i.test(h) && v.length > 12) {
        out[h] = `${v.slice(0, 8)}...${v.slice(-4)} (len=${v.length})`;
      } else {
        out[h] = v;
      }
    }
  }
  return out;
}

/**
 * Processa o rawBody do payload Engaged e cria/atualiza Sale no DB.
 * Exportada pra reuso pelo endpoint /api/admin/replay-webhooks
 * (chamada direta sem HTTP self-call, que falha em ambiente Coolify).
 */
export async function processEngagedPayload(rawBody: string): Promise<{
  statusCode: number;
  body: Record<string, unknown>;
  outcome: string;
  reason?: string;
  saleId?: string;
  externalId?: string;
}> {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return {
      statusCode: 400,
      body: { error: "invalid_json" },
      outcome: "validation_failed",
      reason: "invalid_json",
    };
  }
  const parsed = EngagedWebhook.safeParse(json);
  if (!parsed.success) {
    return {
      statusCode: 422,
      body: { error: "validation_error", issues: parsed.error.issues },
      outcome: "validation_failed",
      reason: "schema_mismatch",
    };
  }
  const p = parsed.data;
  const status = pickStatus(p);
  const externalId = pickExternalId(p);

  // FILTRO DE PRODUTO — engaged manda webhooks de TODOS os produtos da
  // Impacta pra mesma URL. Sem filtro, viramos coletor de vendas do MBA,
  // Faculdade, etc. Identifica produto baseado em sharedId + productId.
  const matchedProduct = matchProduct(p);
  if (!matchedProduct) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ck = (p.checkout ?? {}) as Record<string, any>;
    const desc = typeof ck.description === "string" ? ck.description : "unknown";
    const sharedId = typeof ck.sharedId === "string" ? ck.sharedId : "unknown";

    // IDEMPOTENCIA: se ja existe Sale com esse externalId (criada antes do
    // filtro entrar em vigor — ex: MBA leaked como Claude Pro), removemos.
    // Replay desse webhook precisa "consertar o historico", nao so marcar
    // o log como ignored.
    let deletedSaleId: string | undefined;
    if (externalId) {
      const orphan = await prisma.sale.findFirst({
        where: { source: "ENGAGED", externalId },
        select: { id: true },
      });
      if (orphan) {
        await prisma.sale.delete({ where: { id: orphan.id } });
        deletedSaleId = orphan.id;
      }
    }

    return {
      statusCode: 200,
      body: {
        status: "ignored",
        reason: `product_not_tracked (${desc}, sharedId=${sharedId})`,
        externalId,
        deletedSaleId,
      },
      outcome: "ignored",
      reason: deletedSaleId
        ? `product_not_tracked:${sharedId} (orphan_sale_deleted=${deletedSaleId})`
        : `product_not_tracked:${sharedId}`,
      externalId: externalId || undefined,
    };
  }
  const productSlug = matchedProduct.slug;

  // Mapeia eventType → status interno. Eventos nao mapeados sao ignorados.
  const eventType = p.eventType ?? null;
  const purchaseStatus = mapEventTypeToStatus(eventType);
  if (!purchaseStatus) {
    return {
      statusCode: 200,
      body: { status: "ignored", reason: `unmapped_event_type (${eventType})`, externalId },
      outcome: "ignored",
      reason: `unmapped_event_type:${eventType ?? "null"}`,
      externalId: externalId || undefined,
    };
  }

  // Dados do cliente/compra extraidos do payload (mesma logica do parser)
  const customerName = pickName(p);
  const customerEmail = pickEmail(p);
  const customerPhone = pickPhone(p);
  const amount = pickAmount(p);
  const currency = (p.currency || "BRL").toUpperCase();
  const saleDate = pickSaleDate(p);
  // eventAt = quando o evento ocorreu no Engaged (mesmo extrator usado pra
  // saleDate). Usado pra mostrar "Data" no UI. NAO eh o save time.
  const eventAt = saleDate;

  // externalId eh chave de unicidade — sem ela nao da pra upsert idempotente
  if (!externalId) {
    return {
      statusCode: 422,
      body: { error: "missing_external_id", eventType },
      outcome: "validation_failed",
      reason: "missing_external_id",
    };
  }

  // ─── STEP 1: SEMPRE upsert EngagedPurchase ────────────────────────────
  // Independente do status, registra o estado atual da compra.
  let engagedPurchase;
  try {
    engagedPurchase = await prisma.engagedPurchase.upsert({
      where: {
        productSlug_externalId: { productSlug, externalId },
      },
      create: {
        productSlug,
        externalId,
        status: purchaseStatus,
        lastEventType: eventType ?? "",
        customerName,
        customerEmail,
        customerPhone,
        amount: amount > 0 ? amount : null,
        currency: amount > 0 ? currency : null,
        eventAt,
        firstSeenAt: eventAt, // primeira vez vista = data do primeiro evento
      },
      update: {
        status: purchaseStatus,
        lastEventType: eventType ?? "",
        eventAt, // ultimo evento real do Engaged (nao save time)
        // So atualiza dados do cliente se o novo payload trouxe (evita
        // sobrescrever name/email/phone com null vindo de evento parcial)
        ...(customerName ? { customerName } : {}),
        ...(customerEmail ? { customerEmail } : {}),
        ...(customerPhone ? { customerPhone } : {}),
        ...(amount > 0 ? { amount, currency } : {}),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 500,
      body: { error: "db_error", phase: "engaged_purchase_upsert", message: msg },
      outcome: "error",
      reason: msg.slice(0, 200),
      externalId,
    };
  }

  // ─── STEP 2: Se PAID, criar/atualizar Sale tambem ─────────────────────
  if (purchaseStatus !== "PAID") {
    return {
      statusCode: 200,
      body: {
        status: "tracked",
        externalId,
        engagedPurchaseId: engagedPurchase.id,
        purchaseStatus,
      },
      outcome: "tracked",
      reason: `engaged_purchase:${purchaseStatus}`,
      externalId,
    };
  }

  // ─── STEP 2a: Promove sibling leads do mesmo cliente pra PAID ─────────
  // Engaged manda _id diferente por evento, entao lead_captured e
  // waiting_payment criam linhas com externalId diferente do evento .paid.
  // Match por email exato OU telefone (ultimos 8 digitos) OU nome aprox.
  try {
    await promoteSiblingLeadsToPaid({
      productSlug,
      target: { customerName, customerEmail, customerPhone },
      excludeIds: [engagedPurchase.id],
      reason: `engaged ${eventType ?? "purchase.paid"}`,
    });
  } catch (err) {
    // best-effort — nao quebra fluxo
    console.error("[engaged] sibling promote failed:", err);
  }

  if (amount <= 0) {
    return {
      statusCode: 422,
      body: { error: "invalid_amount_for_paid", amount, externalId },
      outcome: "validation_failed",
      reason: "invalid_amount_for_paid",
      externalId,
    };
  }

  const saleData = {
    productSlug,
    source: "ENGAGED" as const,
    customerName,
    customerEmail,
    customerPhone,
    amount,
    currency,
    externalId,
    externalRef: p.payment_id || null,
    notes: pickNotes(p),
    saleDate,
  };

  try {
    let sale;
    const existing = await prisma.sale.findFirst({
      where: { source: "ENGAGED", externalId },
    });
    if (existing) {
      sale = await prisma.sale.update({
        where: { id: existing.id },
        data: {
          customerName,
          customerEmail,
          customerPhone,
          amount,
          currency,
          notes: saleData.notes,
          saleDate,
        },
      });
    } else {
      sale = await prisma.sale.create({ data: saleData });
    }

    // Linka EngagedPurchase → Sale (rastreio E2E)
    await prisma.engagedPurchase
      .update({
        where: { id: engagedPurchase.id },
        data: { saleId: sale.id },
      })
      .catch(() => {});

    return {
      statusCode: existing ? 200 : 201,
      body: {
        status: existing ? "updated" : "created",
        id: sale.id,
        externalId,
        engagedPurchaseId: engagedPurchase.id,
      },
      outcome: existing ? "updated" : "created",
      saleId: sale.id,
      externalId,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      statusCode: 500,
      body: { error: "db_error", phase: "sale_upsert", message: msg },
      outcome: "error",
      reason: msg.slice(0, 200),
      externalId,
    };
  }
}

async function logWebhook(opts: {
  rawBody: string;
  headers: Record<string, string>;
  statusCode: number;
  resultJson: unknown;
  outcome: string;
  reason?: string;
  saleId?: string;
  externalId?: string;
}) {
  try {
    await prisma.webhookLog.create({
      data: {
        source: "engaged",
        headers: opts.headers,
        rawBody: opts.rawBody.slice(0, 10000), // cap em 10KB pra evitar bloat
        statusCode: opts.statusCode,
        resultJson: opts.resultJson as never,
        outcome: opts.outcome,
        reason: opts.reason,
        saleId: opts.saleId,
        externalId: opts.externalId,
      },
    });
  } catch (err) {
    // logging não deve quebrar o webhook se DB falhar
    console.error("[webhook-log] failed to log:", err);
  }
}

export async function POST(req: NextRequest) {
  // Le body raw pra validar HMAC ANTES de parsear
  const rawBody = await req.text();
  const reqHeaders = captureHeaders(req);

  // Auth: aceita 2 formatos pra flexibilidade com plataformas diferentes:
  //
  // 1) HMAC-SHA256 do body (mais seguro — preferido):
  //    Header: X-Engaged-Signature, X-Webhook-Signature ou X-Hub-Signature-256
  //    Value: hex digest de HMAC(secret, body) — Engaged calcula a cada request
  //
  // 2) Bearer token estático (fallback — quando plataforma nao suporta HMAC):
  //    Header: Authorization: Bearer <secret>   OU
  //    Header: X-Engaged-Secret: <secret>       OU
  //    Header: X-Webhook-Secret: <secret>
  //    Value: o secret cru em todas as requests
  //
  // Se ENGAGED_WEBHOOK_SECRET nao configurado → modo dev (aceita tudo).
  const secret = process.env.ENGAGED_WEBHOOK_SECRET;
  if (secret) {
    const hmacSig =
      req.headers.get("x-engaged-signature") ||
      req.headers.get("x-webhook-signature") ||
      req.headers.get("x-hub-signature-256") ||
      null;
    const bearerSecret =
      req.headers.get("authorization") ||
      req.headers.get("x-engaged-secret") ||
      req.headers.get("x-webhook-secret") ||
      null;

    const hmacOk = hmacSig ? verifyHmac(rawBody, hmacSig, secret) : false;
    const bearerOk = bearerSecret ? verifyBearer(bearerSecret, secret) : false;

    if (!hmacOk && !bearerOk) {
      const result = {
        error: "invalid_signature",
        hint: "Use X-Engaged-Signature (HMAC-SHA256 do body) OU X-Engaged-Secret/Authorization: Bearer <token> com o secret cru.",
      };
      await logWebhook({
        rawBody,
        headers: reqHeaders,
        statusCode: 401,
        resultJson: result,
        outcome: "auth_failed",
        reason: hmacSig ? "hmac_mismatch" : bearerSecret ? "bearer_mismatch" : "no_auth_header",
      });
      return NextResponse.json(result, { status: 401 });
    }
  }

  // Processa via funcao extraida (compartilhada com replay endpoint)
  const result = await processEngagedPayload(rawBody);
  await logWebhook({
    rawBody,
    headers: reqHeaders,
    statusCode: result.statusCode,
    resultJson: result.body,
    outcome: result.outcome,
    reason: result.reason,
    saleId: result.saleId,
    externalId: result.externalId,
  });
  return NextResponse.json(result.body, { status: result.statusCode });
}

// GET pra debug rapido (so retorna config status, sem secret)
export async function GET() {
  const hasSecret = !!process.env.ENGAGED_WEBHOOK_SECRET;
  return NextResponse.json({
    endpoint: "/api/webhook/engaged",
    auth: hasSecret ? "auth_required" : "open (dev mode)",
    accepted_auth_methods: hasSecret
      ? [
          {
            method: "HMAC-SHA256 (preferido)",
            header: "X-Engaged-Signature (ou X-Webhook-Signature, X-Hub-Signature-256)",
            value: "hex digest de HMAC(secret, body) — calculado a cada request",
          },
          {
            method: "Bearer estatico (fallback)",
            header: "Authorization: Bearer <secret> (ou X-Engaged-Secret, X-Webhook-Secret)",
            value: "o secret cru em todas as requests",
          },
        ]
      : [],
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
