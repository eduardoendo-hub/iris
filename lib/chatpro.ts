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
  // endpoint absoluto (http...) usa como está; relativo prefixa o baseUrl (sparks)
  const url = endpoint.startsWith("http") ? endpoint : `${c.baseUrl}${endpoint}`;
  try {
    const res = await fetch(url, {
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

// DDDs válidos do Brasil (Anatel). Fora dessa lista = número inventado.
const VALID_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37,
  38, 41, 42, 43, 44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66,
  67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92,
  93, 94, 95, 96, 97, 98, 99,
]);

/**
 * Heurística "esse número parece lixo?" — cliente digita qualquer coisa no
 * cadastro (0000000, 11111111, número de teste, telefone fixo, etc). Como
 * WhatsApp exige CELULAR válido, exigimos o formato BR completo:
 *   55 (DDI) + DDD(2) + 9 + 8 dígitos = 13 dígitos.
 * Retorna o MOTIVO (string curta) se suspeito, ou null se parece legítimo.
 * Espera o número já normalizado (normalizeWaNumber).
 */
export function looksSuspiciousPhone(normalized: string): string | null {
  const d = (normalized || "").replace(/\D/g, "");
  if (!d.startsWith("55")) return "sem_ddi_br";
  if (d.length !== 13) return `tamanho_${d.length}`; // celular BR = 13 (fixo/curto sai)
  const ddd = d.slice(2, 4);
  if (!VALID_DDD.has(Number(ddd))) return `ddd_${ddd}`;
  const sub = d.slice(4); // 9 dígitos do assinante
  if (sub[0] !== "9") return "sem_9_celular"; // celular pós-2016 começa com 9
  if (/(\d)\1{5,}/.test(d)) return "digitos_repetidos"; // 6+ iguais em sequência
  if (/^(\d)\1+$/.test(sub)) return "assinante_monotonico";
  if (/(012345|123456|234567|345678|456789|567890|987654|876543|765432|654321)/.test(sub)) {
    return "sequencia";
  }
  return null;
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
  const suspicious = looksSuspiciousPhone(number);
  if (suspicious) return { ok: false, error: `numero_suspeito:${suspicious} (${phone})` };

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
 * Formato confirmado pelo cURL do painel ChatPro (Configurações →
 * Mensagens modelo → Código para disparo) + validação do endpoint:
 *   POST https://chat-api.chatpro.com.br/messages/sendTemplate
 *   { instanceId, number, provider: "cloud", name, languageCode,
 *     variables: [{ type: "text", text: "<valor>" }, ...] }
 * Vai direto no número (sem sessão). `variables` na ordem dos {{1}},{{2}}…
 * Override da URL via CHATPRO_TEMPLATE_URL se o ChatPro mudar.
 */
export async function sendWhatsAppTemplate(
  phone: string,
  templateName: string,
  params: string[],
  languageCode = "pt_BR"
): Promise<ChatProResult> {
  if (!chatproConfigured()) return { ok: false, error: "chatpro_not_configured" };
  const number = normalizeWaNumber(phone);
  const suspicious = looksSuspiciousPhone(number);
  if (suspicious) return { ok: false, error: `numero_suspeito:${suspicious} (${phone})` };

  const c = cfg();
  const url =
    process.env.CHATPRO_TEMPLATE_URL || "https://chat-api.chatpro.com.br/messages/sendTemplate";
  const r = await post(url, {
    instanceId: c.instanceId,
    number,
    provider: c.provider,
    name: templateName,
    languageCode,
    ...(params.length > 0
      ? { variables: params.map((v) => ({ type: "text", text: v })) }
      : {}),
  });
  if (!r.ok) return { ok: false, error: r.error, raw: r.json };
  return { ok: true, raw: r.json };
}
