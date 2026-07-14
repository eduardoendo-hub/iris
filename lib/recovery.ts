/**
 * lib/recovery — cadência de recuperação de checkout abandonado.
 *
 * Templates de WhatsApp por (passo, status do EngagedPurchase) + montagem do
 * link de checkout da campanha (sharedId + ?turma= + UTMs de recuperação).
 *
 * Cadência (relativa ao firstSeenAt do lead):
 *   step 1 — 30 min  · mensagem contextual por status
 *   step 2 — 24 h    · lembrete + oferta de ajuda
 *   step 3 — 72 h    · última chamada (com cupom, se RECOVERY_VOUCHER_CODE)
 *
 * Pra editar as mensagens: altere os textos abaixo e redeploy. Placeholders:
 *   {nome}  — primeiro nome do lead (ou "tudo bem" se ausente, via saudação)
 *   {curso} — nome do produto (lib/products.ts)
 *   {link}  — checkout com turma + utm_source=whatsapp&utm_medium=recovery
 *   {cupom} — código do cupom (só step 3, se configurado)
 */

export const RECOVERY_STEPS = [
  { step: 1, afterMinutes: 30 },
  { step: 2, afterMinutes: 24 * 60 },
  { step: 3, afterMinutes: 72 * 60 },
] as const;

export const MAX_STEPS = 3;

/** Statuses de EngagedPurchase elegíveis pra recuperação. */
export const RECOVERABLE_STATUSES = ["DRAFT", "WAITING_PAYMENT", "REFUSED", "EXPIRED"] as const;

// ─── Templates ─────────────────────────────────────────────────────────

const T = {
  // ── Passo 1 (30 min) — contextual por status ──
  step1_draft:
    "Oi {nome}! 👋 Aqui é da Impacta. Vi que você começou sua inscrição no {curso} e faltou só o pagamento. Ficou alguma dúvida sobre o curso? Me chama que eu te ajudo! Seu link pra finalizar: {link}",
  step1_waiting_payment:
    "Oi {nome}! Aqui é da Impacta 😊 Seu pedido do {curso} está quase concluído — só falta a confirmação do pagamento. Se o PIX ou boleto expirou, é só gerar um novo por aqui: {link}. Qualquer dificuldade, me chama!",
  step1_refused:
    "Oi {nome}, tudo bem? Aqui é da Impacta. O pagamento da sua inscrição no {curso} não foi aprovado pela operadora do cartão 😕 Isso acontece! Você pode tentar outro cartão ou pagar no PIX por aqui: {link} — me avisa se precisar de ajuda.",
  step1_expired:
    "Oi {nome}! Aqui é da Impacta. O prazo do pagamento da sua inscrição no {curso} expirou, mas a sua vaga ainda está disponível ✅ É só gerar um novo pagamento aqui: {link}",

  // ── Passo 2 (24 h) — lembrete + ajuda ──
  step2_default:
    "Oi {nome}! Passando pra lembrar que a sua vaga no {curso} ainda está reservada 😉 A turma está fechando e as vagas são limitadas. Finalize por aqui: {link}\n\nSe travou em alguma coisa (pagamento, dúvida sobre o conteúdo, datas), me responde aqui que eu resolvo com você!",
  step2_refused:
    "Oi {nome}! Ontem o pagamento do {curso} não passou no cartão — pode ter sido limite ou trava do banco. No PIX aprova na hora: {link} 😉 Se preferir tentar outro cartão, também funciona. Qualquer coisa me chama!",

  // ── Passo 3 (72 h) — última chamada ──
  step3_com_cupom:
    "{nome}, última chamada! 🎯 A turma do {curso} está fechando e consegui liberar uma condição especial pra você: usa o cupom *{cupom}* neste link que o desconto já entra aplicado: {link}\n\nVale só pelos próximos dias — depois disso a condição sai do ar. Bora garantir sua vaga?",
  step3_sem_cupom:
    "{nome}, última chamada! A turma do {curso} começa em breve e essa é minha última mensagem por aqui 🙂 Se quiser garantir sua vaga: {link}\n\nSe ficou alguma dúvida ou dificuldade, me responde que eu te ajudo pessoalmente.",
} as const;

export type TemplateKey = keyof typeof T;

/** Escolhe o template pra (step, status). */
export function pickTemplate(step: number, status: string, hasCoupon: boolean): TemplateKey {
  if (step === 1) {
    const key = `step1_${status.toLowerCase()}` as TemplateKey;
    return key in T ? key : "step1_draft";
  }
  if (step === 2) return status === "REFUSED" ? "step2_refused" : "step2_default";
  return hasCoupon ? "step3_com_cupom" : "step3_sem_cupom";
}

/** Primeiro nome, capitalizado. Vazio se não der. */
export function firstName(fullName: string | null | undefined): string {
  const t = (fullName || "").trim().split(/\s+/)[0] || "";
  if (!t || t.length < 2) return "";
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/**
 * Monta o link do checkout da campanha com turma + UTMs de recuperação
 * (+ cupom no passo 3). As UTMs marcam a venda recuperada no cockpit:
 * utm_source=whatsapp / utm_medium=recovery / utm_campaign=<campaignSlug>.
 */
export function buildRecoveryLink(opts: {
  sharedId: string;
  turmaId?: string | null;
  campaignSlug?: string | null;
  step: number;
  voucherCode?: string | null;
}): string {
  const url = new URL(`https://impacta.site.engaged.com.br/p/checkout/${opts.sharedId}`);
  if (opts.turmaId) url.searchParams.set("turma", opts.turmaId);
  url.searchParams.set("utm_source", "whatsapp");
  url.searchParams.set("utm_medium", "recovery");
  if (opts.campaignSlug) url.searchParams.set("utm_campaign", opts.campaignSlug);
  url.searchParams.set("utm_content", `step${opts.step}`);
  if (opts.step === 3 && opts.voucherCode) url.searchParams.set("voucher_code", opts.voucherCode);
  return url.toString();
}

/** Renderiza o template com as variáveis. */
export function renderTemplate(
  key: TemplateKey,
  vars: { nome: string; curso: string; link: string; cupom?: string }
): string {
  let msg: string = T[key];
  // Sem nome: tira o "{nome}, " / "Oi {nome}!" fica "Oi!" — trata os dois casos
  if (!vars.nome) {
    msg = msg
      .replace(/\{nome\}, /g, "")
      .replace(/Oi \{nome\}!/g, "Oi!")
      .replace(/\{nome\}/g, "");
  }
  return msg
    .replace(/\{nome\}/g, vars.nome)
    .replace(/\{curso\}/g, vars.curso)
    .replace(/\{link\}/g, vars.link)
    .replace(/\{cupom\}/g, vars.cupom || "")
    .trim();
}
