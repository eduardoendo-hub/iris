/**
 * Helpers de fuso horario para o painel IRIS.
 *
 * Problema que resolvem: o <input type="datetime-local"> trabalha com horario
 * de parede (sem fuso). Se a string crua ("2026-05-29T14:30") for parseada no
 * servidor (container em UTC), vira 14:30 UTC — e a tabela, que formata em
 * America/Sao_Paulo, mostra 11:30 (3h a menos). A correcao e tratar o input
 * SEMPRE como horario de Sao Paulo e converter para um instante UTC explicito.
 *
 * Brasil nao tem mais horario de verao desde 2019, mas calculamos o offset
 * dinamicamente via Intl pra ficar correto mesmo se isso mudar.
 */
const SP_TZ = "America/Sao_Paulo";

/**
 * Offset (em minutos) de um timezone num dado instante. Positivo = a frente de
 * UTC; Sao Paulo retorna -180 (UTC-3).
 */
function tzOffsetMinutes(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  const asUTC = Date.UTC(
    map.year,
    map.month - 1,
    map.day,
    map.hour % 24,
    map.minute,
    map.second
  );
  return (asUTC - date.getTime()) / 60000;
}

/**
 * Converte um Date (instante UTC) para o valor de horario de parede de Sao
 * Paulo no formato "YYYY-MM-DDTHH:mm" aceito pelo <input type="datetime-local">.
 */
export function toSpDatetimeLocalValue(d: Date = new Date()): string {
  const off = tzOffsetMinutes(d, SP_TZ); // ex: -180
  return new Date(d.getTime() + off * 60000).toISOString().slice(0, 16);
}

/**
 * Converte uma string de <input datetime-local> ("YYYY-MM-DDTHH:mm"),
 * interpretada como horario de parede de Sao Paulo, para um ISO em UTC.
 * Ex: "2026-05-29T14:30" (SP) -> "2026-05-29T17:30:00.000Z".
 */
export function spDatetimeLocalToUtcISO(localStr: string): string {
  // Aproxima tratando a string como UTC pra descobrir o offset de SP naquele
  // instante; depois subtrai o offset (utc = parede - offset).
  const approx = new Date(localStr.length === 16 ? `${localStr}:00Z` : `${localStr}Z`);
  const off = tzOffsetMinutes(approx, SP_TZ);
  return new Date(approx.getTime() - off * 60000).toISOString();
}
