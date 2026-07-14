/**
 * EngagedLeadsTable — leads de checkout Engaged em status pre-venda.
 *
 * Mostra rows onde status != PAID. Quando uma compra vira PAID, ela some
 * daqui (a UI filtra) e aparece na tabela de Vendas acima.
 *
 * Status renderizados (do mais frio pro mais quente):
 *   DRAFT             — Lead capturado (modal de captura, sem checkout)
 *   WAITING_PAYMENT   — Aguardando pagto (boleto/PIX gerado)
 *   CANCELED          — Cancelado (cancelou apos gerar boleto/PIX)
 *   REFUSED           — Recusado (cartao recusado)
 *   EXPIRED           — Expirado (boleto/PIX expirou)
 */
type Row = {
  id: string;
  /** Tipo da fonte: engaged (checkout iniciou), whatsapp (clicou/preencheu
   *  barreira do WA), form (formulário "falar com consultor"). */
  kind?: "engaged" | "whatsapp" | "form";
  externalId: string;
  status: string;
  lastEventType: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  amount: number | null;
  currency: string | null;
  eventAt: Date | string;
  firstSeenAt: Date | string;
  lastUpdatedAt: Date | string;
  /** UTMs (utm_source/medium/campaign/content/term). Engaged: vem do
   *  queryParams do webhook. WhatsApp: vem dos campos utm* do Lead. */
  attribution?: Record<string, string | null> | null;
  /** URL da LP de origem — só preenchido pra WhatsApp Lead. */
  sourcePage?: string | null;
  /** Toques da cadência de recuperação (WhatsApp automático) já enviados. */
  recoveryTouches?: Array<{
    step: number;
    status: string; // "sent" | "error"
    sentAt: Date | string;
    templateKey: string;
    message: string;
  }>;
};

type StatusStyle = { label: string; color: string; bg: string };
const STATUS_STYLE: Record<string, StatusStyle> = {
  DRAFT: { label: "Lead capturado", color: "#9ABABA", bg: "rgba(154,186,186,0.15)" },
  WAITING_PAYMENT: { label: "Aguardando pagto", color: "#F7C948", bg: "rgba(247,201,72,0.15)" },
  CANCELED: { label: "Cancelado", color: "#EC6088", bg: "rgba(236,96,136,0.15)" },
  REFUSED: { label: "Recusado", color: "#EC6088", bg: "rgba(236,96,136,0.15)" },
  EXPIRED: { label: "Expirado", color: "#D97757", bg: "rgba(217,119,87,0.15)" },
  WHATSAPP_CLICK: { label: "WhatsApp click", color: "#25D366", bg: "rgba(37,211,102,0.15)" },
  WHATSAPP_LEAD: { label: "WhatsApp lead", color: "#25D366", bg: "rgba(37,211,102,0.15)" },
  FORM_SUBMIT: { label: "Formulário", color: "#0ABAB5", bg: "rgba(10,186,181,0.15)" },
};

/** Resumo legível das UTMs pra mostrar na coluna Origem. */
function formatOrigem(
  attr: Record<string, string | null> | null | undefined,
  sourcePage: string | null | undefined,
): { primary: string; secondary: string | null; tooltip: string } | null {
  if (!attr || Object.values(attr).every((v) => !v)) {
    // Sem UTM. Se tem sourcePage (WhatsApp), mostra ele.
    if (sourcePage) {
      let host: string;
      try { host = new URL(sourcePage).hostname; } catch { host = sourcePage.slice(0, 40); }
      return { primary: host, secondary: "sem UTM", tooltip: `sourcePage: ${sourcePage}` };
    }
    return null;
  }
  const src = attr.utm_source;
  const med = attr.utm_medium;
  const camp = attr.utm_campaign;
  const cnt = attr.utm_content;
  const term = attr.utm_term;
  const channel = src && med ? `${src} / ${med}` : src || med || null;
  const primary = channel || camp || "—";
  const secondary = channel && camp ? camp : term || cnt || null;
  const tooltipParts = [
    channel ? `Canal: ${channel}` : null,
    camp ? `Campanha: ${camp}` : null,
    term ? `Keyword: ${term}` : null,
    cnt ? `Anúncio: ${cnt}` : null,
    sourcePage ? `Origem: ${sourcePage}` : null,
  ].filter(Boolean) as string[];
  return { primary, secondary, tooltip: tooltipParts.join("\n") };
}

function styleFor(status: string): StatusStyle {
  return STATUS_STYLE[status] ?? { label: status, color: "#9ABABA", bg: "rgba(154,186,186,0.10)" };
}

const STATUS_PRIORITY: Record<string, number> = {
  WAITING_PAYMENT: 1, // mais quente — pode converter ainda
  DRAFT: 2,
  REFUSED: 3,
  CANCELED: 4,
  EXPIRED: 5,
};

function statusPriority(status: string): number {
  return STATUS_PRIORITY[status] ?? 99;
}

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function formatBRL(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(n);
}

export function EngagedLeadsTable({ rows, totalCount }: { rows: Row[]; totalCount: number }) {
  // Ordena: status mais quente primeiro, depois eventAt desc (evento mais recente)
  const sorted = [...rows].sort((a, b) => {
    const pa = statusPriority(a.status);
    const pb = statusPriority(b.status);
    if (pa !== pb) return pa - pb;
    const da = typeof a.eventAt === "string" ? new Date(a.eventAt) : a.eventAt;
    const db = typeof b.eventAt === "string" ? new Date(b.eventAt) : b.eventAt;
    return db.getTime() - da.getTime();
  });

  // Contadores por status pra header
  const counts = sorted.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--cockpit-card)", border: "1px solid var(--cockpit-border)" }}
    >
      <div
        className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-3"
        style={{ borderBottom: "1px solid var(--cockpit-border)" }}
      >
        <div className="flex items-center gap-3">
          <h3
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--fg1)",
              textTransform: "uppercase",
              letterSpacing: "var(--ls-eyebrow)",
            }}
          >
            Leads (Engaged / WhatsApp)
          </h3>
          <span style={{ fontSize: 11, color: "var(--fg2)", fontFamily: "var(--font-mono)" }}>
            {totalCount} {totalCount === 1 ? "lead" : "leads"} (sem pagamento)
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {Object.entries(counts).map(([status, count]) => {
            const s = styleFor(status);
            return (
              <span
                key={status}
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: s.bg,
                  color: s.color,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {s.label}: {count}
              </span>
            );
          })}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "var(--ls-eyebrow)",
                color: "var(--brand-soft)",
                fontWeight: 700,
                opacity: 0.95,
              }}
            >
              <th className="text-left px-4 py-2">Data</th>
              <th className="text-left px-4 py-2">Tipo</th>
              <th className="text-left px-4 py-2">Cliente</th>
              <th className="text-left px-4 py-2">Contato</th>
              <th className="text-left px-4 py-2">Origem</th>
              <th className="text-right px-4 py-2">Valor</th>
              <th className="text-left px-4 py-2">Status</th>
              <th className="text-left px-4 py-2">Recuperação</th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center px-4 py-6" style={{ color: "var(--fg2)" }}>
                  Nenhum lead Engaged ou WhatsApp em status pré-venda. Compras pagas ficam no bloco
                  de Vendas acima.
                </td>
              </tr>
            ) : (
              sorted.map((r) => {
                const s = styleFor(r.status);
                const kind = r.kind ?? "engaged";
                const kindBadge =
                  kind === "whatsapp"
                    ? { label: "WHATS", color: "#25D366", bg: "rgba(37,211,102,0.15)" }
                    : kind === "form"
                    ? { label: "FORM", color: "#0ABAB5", bg: "rgba(10,186,181,0.15)" }
                    : { label: "ENGAGED", color: "#30D158", bg: "rgba(48,209,88,0.15)" };
                const origem = formatOrigem(r.attribution, r.sourcePage);
                return (
                  <tr
                    key={r.id}
                    style={{ borderTop: "1px solid var(--cockpit-border)", fontSize: 13 }}
                  >
                    <td
                      className="px-4 py-2.5"
                      style={{
                        color: "var(--fg1)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDate(r.eventAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 800,
                          padding: "2px 6px",
                          borderRadius: 3,
                          background: kindBadge.bg,
                          color: kindBadge.color,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {kindBadge.label}
                      </span>
                    </td>
                    <td
                      className="px-4 py-2.5"
                      style={{ color: "var(--fg1)", fontWeight: 600 }}
                    >
                      {r.customerName || (
                        <span style={{ color: "var(--fg2)" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5" style={{ color: "var(--fg1)", fontSize: 12 }}>
                      {r.customerEmail && <div>{r.customerEmail}</div>}
                      {r.customerPhone && (
                        <div style={{ color: "var(--fg2)", fontSize: 11 }}>{r.customerPhone}</div>
                      )}
                      {!r.customerEmail && !r.customerPhone && (
                        <span style={{ color: "var(--fg2)" }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5" style={{ fontSize: 11 }} title={origem?.tooltip}>
                      {origem ? (
                        <div style={{ cursor: "help" }}>
                          <div style={{
                            color: "var(--fg1)",
                            fontFamily: "var(--font-mono)",
                            fontWeight: 500,
                          }}>
                            {origem.primary}
                          </div>
                          {origem.secondary && (
                            <div style={{ color: "var(--fg2)", fontSize: 10, marginTop: 2 }}>
                              {origem.secondary}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: "#D97757", fontSize: 10, fontStyle: "italic" }}>
                          sem origem
                        </span>
                      )}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right"
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: "var(--fg1)",
                        fontSize: 12,
                      }}
                    >
                      {formatBRL(r.amount)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "3px 8px",
                          borderRadius: 4,
                          background: s.bg,
                          color: s.color,
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                        }}
                        title={r.lastEventType}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {r.recoveryTouches && r.recoveryTouches.length > 0 ? (
                        <div className="flex items-center gap-1 flex-wrap">
                          {[...r.recoveryTouches]
                            .sort((a, b) => a.step - b.step)
                            .map((t) => {
                              const ok = t.status === "sent";
                              return (
                                <span
                                  key={t.step}
                                  title={`WhatsApp ${ok ? "enviado" : "FALHOU"} em ${formatDate(t.sentAt)} (${t.templateKey})\n\n${t.message}`}
                                  style={{
                                    fontSize: 9,
                                    fontWeight: 800,
                                    padding: "2px 6px",
                                    borderRadius: 3,
                                    background: ok ? "rgba(37,211,102,0.15)" : "rgba(236,96,136,0.15)",
                                    color: ok ? "#25D366" : "#EC6088",
                                    whiteSpace: "nowrap",
                                    cursor: "help",
                                  }}
                                >
                                  {ok ? "✓" : "✗"} WA {t.step} · {formatDate(t.sentAt)}
                                </span>
                              );
                            })}
                        </div>
                      ) : (
                        <span style={{ fontSize: 10, color: "var(--fg2)" }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
