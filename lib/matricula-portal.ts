/**
 * Repasse dos avisos de compra da Taxa de Matrícula do MBA para o portal de
 * documentos da matrícula (site do MBA, /api/matricula/engaged).
 *
 * O IRIS não acompanha a matrícula do MBA como produto (ver o filtro
 * product_not_tracked no webhook do Engaged), mas é ele que recebe todos os
 * eventos da conta. O portal precisa saber quem pagou para liberar o envio de
 * documentos e para montar o cadastro que vai à secretaria da Impacta.
 *
 * Liga sozinho quando as três variáveis existem:
 *   MATRICULA_PORTAL_URL       ex.: https://mba.impacta.edu.br/api/matricula/engaged
 *   MATRICULA_PORTAL_USER      usuário do Basic Auth (ENGAGED_ENTRADA_USUARIO no portal)
 *   MATRICULA_PORTAL_PASSWORD  senha do Basic Auth (ENGAGED_ENTRADA_SENHA no portal)
 *
 * O corpo vai como chegou do Engaged, sem alteração. Não registra dados
 * pessoais em log.
 */

const MATRICULA_MBA_RE = /matr[ií]cula\s+mba/i;

export function matriculaPortalConfigured(): boolean {
  return Boolean(
    process.env.MATRICULA_PORTAL_URL &&
      process.env.MATRICULA_PORTAL_USER &&
      process.env.MATRICULA_PORTAL_PASSWORD
  );
}

/** True quando o evento do Engaged é de um produto "Taxa de Matrícula MBA …". */
export function isMbaMatriculaPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = payload as Record<string, any>;
  const itens = [
    ...(Array.isArray(p.invoice?.items) ? p.invoice.items : []),
    ...(Array.isArray(p.checkout?.invoiceItems) ? p.checkout.invoiceItems : []),
  ];
  return itens.some(
    (i) => typeof i?.product?.name === "string" && MATRICULA_MBA_RE.test(i.product.name)
  );
}

/** Envia o corpo bruto do evento ao portal. Nunca lança. */
export async function forwardToMatriculaPortal(
  rawBody: string
): Promise<{ ok: boolean; status?: number; detail?: string }> {
  if (!matriculaPortalConfigured()) return { ok: false, detail: "not_configured" };
  const auth = Buffer.from(
    `${process.env.MATRICULA_PORTAL_USER}:${process.env.MATRICULA_PORTAL_PASSWORD}`
  ).toString("base64");
  try {
    const res = await fetch(process.env.MATRICULA_PORTAL_URL as string, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
      body: rawBody,
      signal: AbortSignal.timeout(8000),
    });
    return res.ok ? { ok: true, status: res.status } : { ok: false, status: res.status };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.name : "error" };
  }
}
