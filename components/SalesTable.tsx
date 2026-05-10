type SaleRow = {
  id: string;
  source: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  amount: number | string;
  currency: string;
  notes: string | null;
  saleDate: Date | string;
};

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
function formatBRL(v: number | string): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

const SOURCE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  ENGAGED: { label: "Engaged", color: "#0ABAB5", bg: "rgba(10,186,181,0.15)" },
  MANUAL:  { label: "Manual",  color: "#D97757", bg: "rgba(217,119,87,0.15)" },
  OTHER:   { label: "Outro",   color: "#9ABABA", bg: "rgba(154,186,186,0.15)" },
};

export function SalesTable({ sales, totalCount, totalAmount }: {
  sales: SaleRow[];
  totalCount: number;
  totalAmount: number;
}) {
  return (
    <section
      className="rounded-lg overflow-hidden"
      style={{
        background: "var(--cockpit-card)",
        border: "1px solid var(--cockpit-border)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <header
        className="px-5 py-3 flex items-center justify-between flex-wrap gap-2"
        style={{ borderBottom: "1px solid var(--cockpit-border)" }}
      >
        <div className="flex items-center gap-3">
          <h3 style={{ fontWeight: 700, fontSize: 14 }}>Vendas confirmadas</h3>
          <span
            style={{
              fontSize: 11, padding: "2px 8px", borderRadius: 999,
              background: "rgba(48,209,88,0.10)", color: "#30D158",
              border: "1px solid rgba(48,209,88,0.25)", fontWeight: 600,
            }}
          >
            {totalCount} {totalCount === 1 ? "venda" : "vendas"} · {formatBRL(totalAmount)}
          </span>
        </div>
        <span style={{ fontSize: 10, color: "var(--fg2)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", fontWeight: 700 }}>
          Engaged (auto) · Manual (interna)
        </span>
      </header>

      {sales.length === 0 ? (
        <div className="px-5 py-10 text-center" style={{ color: "var(--fg2)", fontSize: 13 }}>
          Nenhuma venda registrada ainda.
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.7 }}>
            Use o botão &quot;Registrar venda manual&quot; abaixo, ou aguarde o webhook do Engaged.
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "var(--brand-soft)", fontSize: 10, textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", fontWeight: 700, opacity: 0.95 }}>
                <th style={{ textAlign: "left",  padding: "10px 16px" }}>Data</th>
                <th style={{ textAlign: "left",  padding: "10px 16px" }}>Cliente</th>
                <th style={{ textAlign: "left",  padding: "10px 16px" }}>Contato</th>
                <th style={{ textAlign: "left",  padding: "10px 16px" }}>Origem</th>
                <th style={{ textAlign: "right", padding: "10px 16px" }}>Valor</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => {
                const src = SOURCE_LABEL[s.source] || SOURCE_LABEL.OTHER;
                return (
                  <tr key={s.id} style={{ borderTop: "1px solid var(--cockpit-border)" }}>
                    <td style={{ padding: "12px 16px", fontFamily: "var(--font-mono)", color: "var(--fg2)", fontSize: 12 }}>
                      {formatDate(s.saleDate)}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--fg1)", fontWeight: 600 }}>
                      {s.customerName}
                      {s.notes && <div style={{ fontSize: 10, opacity: 0.5, fontWeight: 400, marginTop: 2 }}>{s.notes.slice(0, 80)}</div>}
                    </td>
                    <td style={{ padding: "12px 16px", color: "var(--fg2)", fontSize: 12 }}>
                      {s.customerEmail && <div>{s.customerEmail}</div>}
                      {s.customerPhone && <div style={{ opacity: 0.7 }}>{s.customerPhone}</div>}
                      {!s.customerEmail && !s.customerPhone && <span style={{ opacity: 0.4 }}>—</span>}
                    </td>
                    <td style={{ padding: "12px 16px" }}>
                      <span
                        style={{
                          fontSize: 10, padding: "2px 8px", borderRadius: 4,
                          background: src.bg, color: src.color,
                          fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em",
                        }}
                      >
                        {src.label}
                      </span>
                    </td>
                    <td style={{ padding: "12px 16px", textAlign: "right", color: "#30D158", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                      {formatBRL(s.amount)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
