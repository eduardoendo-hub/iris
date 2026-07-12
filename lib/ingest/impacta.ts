/**
 * lib/ingest/impacta — cliente da API interna de matrículas da Impacta.
 *
 * Endpoint (por turma):
 *   GET {IMPACTA_API_URL}?turma_id=<turmaId>
 *   → { success: true, data: [ { aluno_nome, aluno_email, aluno_cpf,
 *        curso, valor_pago, status, pagamento_via_engaged, cadastrado_em,
 *        id, codigo_aluno, ... } ] }
 *
 * A API às vezes demora / dá timeout na primeira chamada (cold), por isso
 * fazemos 1 retry. Cada linha é uma matrícula da turma; usamos isto pra
 * conciliar contra as vendas que a IRIS já tem (Sale/EngagedPurchase) e
 * importar as que faltam — tipicamente vendas fechadas por fora do Engaged.
 */

const DEFAULT_BASE =
  "https://apiv2.impacta.com.br/api/v1/webhook/engaged/treinamentos/pagamentos/list";

export type ImpactaEnrollment = {
  /** id da matrícula na API (chave de idempotência do import). */
  externalId: string;
  name: string;
  email: string | null;
  /** CPF só dígitos (11), ou null. */
  cpf: string | null;
  curso: string | null;
  /** valor pago em reais (a API manda number, ora int ora decimal). */
  valorPago: number | null;
  /** status textual da API (ex.: "Pago"). */
  status: string | null;
  /** true = pago via checkout Engaged (a IRIS provavelmente já tem). */
  viaEngaged: boolean;
  /** data da matrícula (cadastrado_em), interpretada em America/Sao_Paulo. */
  enrolledAt: Date | null;
  codigoAluno: string | null;
};

function onlyDigits(s: unknown): string | null {
  if (typeof s !== "string" && typeof s !== "number") return null;
  const d = String(s).replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

/** "2026-07-01 18:06:00" (horário SP) -> Date. Brasil é UTC-3 (sem DST). */
function parseSpDate(s: unknown): Date | null {
  if (typeof s !== "string" || !s.trim()) return null;
  const iso = s.trim().replace(" ", "T");
  const d = new Date(/[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}-03:00`);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeRow(r: Record<string, unknown>): ImpactaEnrollment | null {
  const externalId =
    r.id != null ? String(r.id) : typeof r.codigo_aluno === "string" ? r.codigo_aluno : null;
  if (!externalId) return null;
  const rawValor = r.valor_pago;
  const valorPago =
    typeof rawValor === "number"
      ? rawValor
      : typeof rawValor === "string" && rawValor.trim() !== ""
        ? Number(rawValor.replace(",", "."))
        : null;
  return {
    externalId,
    name: typeof r.aluno_nome === "string" ? r.aluno_nome.trim() : "",
    email: typeof r.aluno_email === "string" && r.aluno_email.trim() ? r.aluno_email.trim() : null,
    cpf: onlyDigits(r.aluno_cpf),
    curso: typeof r.curso === "string" ? r.curso : null,
    valorPago: valorPago != null && !isNaN(valorPago) ? valorPago : null,
    status: typeof r.status === "string" ? r.status : null,
    viaEngaged: r.pagamento_via_engaged === true,
    enrolledAt: parseSpDate(r.cadastrado_em),
    codigoAluno: typeof r.codigo_aluno === "string" ? r.codigo_aluno : null,
  };
}

/** true se a matrícula está paga (status "Pago" / "paid"). */
export function isPaidEnrollment(e: ImpactaEnrollment): boolean {
  const s = (e.status || "").toLowerCase();
  return s.includes("pag") || s.includes("paid");
}

export type ImpactaFetchResult = {
  ok: boolean;
  turmaId: string;
  count: number;
  enrollments: ImpactaEnrollment[];
  error?: string;
};

/**
 * Busca as matrículas de uma turma. Faz 1 retry se a primeira chamada
 * estourar timeout (a API tem cold start). timeoutMs por tentativa.
 */
export async function fetchImpactaTurma(
  turmaId: string,
  opts: { timeoutMs?: number; attempts?: number } = {}
): Promise<ImpactaFetchResult> {
  const base = process.env.IMPACTA_API_URL || DEFAULT_BASE;
  const url = `${base}?turma_id=${encodeURIComponent(turmaId)}`;
  const timeoutMs = opts.timeoutMs ?? 30000;
  const attempts = opts.attempts ?? 2;

  let lastErr = "unknown";
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      if (!res.ok) {
        lastErr = `http_${res.status}`;
        continue;
      }
      const json = (await res.json()) as { success?: boolean; data?: unknown };
      if (!json || json.success !== true || !Array.isArray(json.data)) {
        lastErr = "unexpected_shape";
        continue;
      }
      const enrollments = json.data
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .map(normalizeRow)
        .filter((x): x is ImpactaEnrollment => x !== null);
      return { ok: true, turmaId, count: enrollments.length, enrollments };
    } catch (err) {
      lastErr = err instanceof Error ? err.message : String(err);
    }
  }
  return { ok: false, turmaId, count: 0, enrollments: [], error: lastErr };
}
