/**
 * Helpers de bucket temporal em America/Sao_Paulo.
 *
 * PROBLEMA antes: bucket DAY salvava `Day X 00:00 UTC` no startsAt.
 * Como o display formata em SP (UTC-3), `Day X 00:00 UTC` vira
 * `Day X-1 21:00 SP` → dados de hoje apareciam no grafico do dia anterior.
 *
 * SOLUCAO: bucket DAY agora salva `Day X 00:00 SP` (= `Day X 03:00 UTC`).
 * Quando o display formata em SP, da `Day X` direitinho.
 *
 * SP eh UTC-3 fixo (Brasil aboliu DST em 2019), entao podemos hard-codar.
 */

const SP_UTC_OFFSET_HOURS = 3; // SP = UTC-3 fixo

/** Aceita "YYYY-MM-DD" (interpreta como dia SP) e devolve `Day X 00:00 SP` em UTC. */
export function spDayBucketFromYMD(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  // Date.UTC(Y, M, D, H) — queremos `Day X 00:00 SP` = `Day X 03:00 UTC`
  return new Date(Date.UTC(y, m - 1, d, SP_UTC_OFFSET_HOURS, 0, 0));
}

/**
 * Aceita instante absoluto (Date) e devolve o bucket DAY SP que ele
 * pertence. Ex: evento as 10:00 SP do dia 12 → bucket "Day 12 SP".
 *               evento as 22:00 SP do dia 12 → bucket "Day 12 SP" (mesmo dia).
 *               evento as 23:30 SP do dia 12 → bucket "Day 12 SP".
 *               evento as 02:30 SP do dia 13 → bucket "Day 13 SP".
 */
export function spDayBucketFromInstant(at: Date): Date {
  // Subtrai offset, pega o ano/mes/dia em UTC ja convertido pra SP, monta de volta.
  const spLocal = new Date(at.getTime() - SP_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  const y = spLocal.getUTCFullYear();
  const m = spLocal.getUTCMonth();
  const d = spLocal.getUTCDate();
  return new Date(Date.UTC(y, m, d, SP_UTC_OFFSET_HOURS, 0, 0));
}
