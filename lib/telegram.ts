/**
 * lib/telegram — cliente simples da Bot API do Telegram.
 *
 * Usado pelo sumario diario (/api/cron/telegram-daily-summary) e pelos
 * alertas em tempo real (nova venda · webhook falhando em serie) do
 * webhook do Engaged.
 *
 * Env vars obrigatorias (Coolify):
 *   TELEGRAM_BOT_TOKEN   — token do bot @BotFather
 *   TELEGRAM_CHAT_ID     — chat_id destino (pessoal ou grupo; negativo p/ grupos)
 *
 * Se qualquer uma faltar, as funcoes retornam { ok:false } sem lancar —
 * o IRIS continua funcional mesmo sem Telegram configurado.
 */

const TG_API = "https://api.telegram.org";

type SendResult = { ok: boolean; status?: number; description?: string };

function cfg() {
  return {
    token: process.env.TELEGRAM_BOT_TOKEN || "",
    chatId: process.env.TELEGRAM_CHAT_ID || "",
  };
}

export function telegramConfigured(): boolean {
  const c = cfg();
  return !!(c.token && c.chatId);
}

/**
 * Envia mensagem markdown pro chat configurado. Fire-and-forget safe:
 * se timeout ou erro HTTP, retorna { ok:false } sem lancar.
 *
 * Suporta MarkdownV2 do Telegram — escapar caracteres especiais com
 * escapeMd() antes de concatenar dados dinamicos (R$, valores, etc).
 */
export async function sendTelegramMessage(
  markdown: string,
  opts: { disable_notification?: boolean } = {}
): Promise<SendResult> {
  const c = cfg();
  if (!c.token || !c.chatId) {
    return { ok: false, description: "telegram_not_configured" };
  }
  try {
    const res = await fetch(`${TG_API}/bot${c.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: c.chatId,
        text: markdown,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
        disable_notification: opts.disable_notification ?? false,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      description?: string;
    };
    return { ok: !!json.ok, status: res.status, description: json.description };
  } catch (err) {
    return { ok: false, description: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Escapa caracteres especiais do MarkdownV2 do Telegram.
 * Especiais: _ * [ ] ( ) ~ ` > # + - = | { } . !
 */
export function escapeMd(s: string | number | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

/** Formata BRL com escape MarkdownV2. Ex: 1359 → "R$ 1\\.359,00" */
export function formatBRL(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return escapeMd("R$ 0,00");
  return escapeMd(
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
  );
}
