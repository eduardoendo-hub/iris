/**
 * lib/chatpro — cliente da API ChatPro Chat (sparks.chatpro.com.br).
 *
 * Portado do botmba (app/services/chatpro.py), que roda em produção:
 *   • Base URL : https://sparks.chatpro.com.br
 *   • Auth     : header 'instance-token'
 *   • Rotas POST; payload camelCase
 *
 * Fluxo de envio proativo (follow-up, sem sessão aberta):
 *   1. POST /sessions/getOrCreateByNumber { instanceId, number, provider }
 *   2. POST /messages/sendMessage { instanceId, sessionId, provider, message }
 *
 * Envs (Coolify):
 *   CHATPRO_CHAT_TOKEN        — instance-token (Settings > Desenvolvedor)
 *   CHATPRO_CHAT_INSTANCE_ID  — instanceId da instância WhatsApp
 *   CHATPRO_CHAT_URL          — default https://sparks.chatpro.com.br
 *   CHATPRO_CHAT_PROVIDER     — default "cloud"
 */

type ChatProResult = { ok: boolean; error?: string; raw?: unknown };

function cfg() {
  return {
    token: process.env.CHATPRO_CHAT_TOKEN || "",
    instanceId: process.env.CHATPRO_CHAT_INSTANCE_ID || "",
    baseUrl: (process.env.CHATPRO_CHAT_URL || "https://sparks.chatpro.com.br").replace(/\/$/, ""),
    provider: process.env.CHATPRO_CHAT_PROVIDER || "cloud",
  };
}

export function chatproConfigured(): boolean {
  const c = cfg();
  return !!(c.token && c.instanceId);
}

async function post(endpoint: string, body: Record<string, unknown>): Promise<{ ok: boolean; json: Record<string, unknown> | null; error?: string }> {
  const c = cfg();
  try {
    const res = await fetch(`${c.baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "instance-token": c.token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok) {
      return { ok: false, json, error: `http_${res.status}: ${JSON.stringify(json).slice(0, 200)}` };
    }
    return { ok: true, json };
  } catch (err) {
    return { ok: false, json: null, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Normaliza telefone pra dígitos com DDI (55...). */
export function normalizeWaNumber(phone: string): string {
  let d = phone.replace(/\D/g, "");
  // remove zeros à esquerda de discagem
  d = d.replace(/^0+/, "");
  // sem DDI e com cara de BR (10-11 dígitos: DDD+numero) → prefixa 55
  if (d.length >= 10 && d.length <= 11 && !d.startsWith("55")) d = "55" + d;
  return d;
}

async function getOrCreateSession(number: string): Promise<{ sessionId: string; error?: string }> {
  const c = cfg();
  const r = await post("/sessions/getOrCreateByNumber", {
    instanceId: c.instanceId,
    number,
    provider: c.provider,
  });
  if (!r.ok) return { sessionId: "", error: r.error };
  const j = r.json ?? {};
  const data = (j.data && typeof j.data === "object" ? (j.data as Record<string, unknown>) : {}) as Record<string, unknown>;
  const sessionId = j.id ?? j.session_id ?? j.sessionId ?? data.id ?? data.session_id;
  if (!sessionId) return { sessionId: "", error: `session_id ausente: ${JSON.stringify(j).slice(0, 200)}` };
  return { sessionId: String(sessionId) };
}

/**
 * Envia mensagem de texto pra um número (cria/reusa a sessão).
 * Retorna { ok } ou { ok:false, error } — nunca lança.
 */
export async function sendWhatsAppText(phone: string, message: string): Promise<ChatProResult> {
  if (!chatproConfigured()) return { ok: false, error: "chatpro_not_configured" };
  const number = normalizeWaNumber(phone);
  if (number.length < 10) return { ok: false, error: `telefone_invalido: ${phone}` };

  const session = await getOrCreateSession(number);
  if (!session.sessionId) return { ok: false, error: session.error || "no_session" };

  const c = cfg();
  const r = await post("/messages/sendMessage", {
    instanceId: c.instanceId,
    sessionId: session.sessionId,
    provider: c.provider,
    message,
  });
  if (!r.ok) return { ok: false, error: r.error, raw: r.json };
  return { ok: true, raw: r.json };
}

/**
 * Envia um TEMPLATE aprovado (Meta/HSM) — obrigatório pra mensagem proativa
 * em número oficial fora da janela de 24h.
 *
 * Endpoint confirmado com o suporte ChatPro + doc (chatpro.readme.io):
 *   POST /waba/sendTemplate  { instanceId, number, name, languageCode, variables }
 * Vai direto no número (sem sessão) e NÃO aceita `provider`/`components`/
 * `params` (validador rejeita) — o campo de variáveis do body é `variables`.
 * Override do endpoint via CHATPRO_TEMPLATE_ENDPOINT se o ChatPro mudar.
 */
export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  params: string[],
  languageCode = "pt_BR"
): Promise<ChatProResult> {
  if (!chatproConfigured()) return { ok: false, error: "chatpro_not_configured" };
  const number = normalizeWaNumber(phone);
  if (number.length < 10) return { ok: false, error: `telefone_invalido: ${phone}` };

  const c = cfg();
  const endpoint = process.env.CHATPRO_TEMPLATE_ENDPOINT || "/waba/sendTemplate";
  const r = await post(endpoint, {
    instanceId: c.instanceId,
    number,
    name: templateName,
    languageCode,
    ...(params.length > 0 ? { variables: params } : {}),
  });
  if (!r.ok) return { ok: false, error: r.error, raw: r.json };
  return { ok: true, raw: r.json };
}
