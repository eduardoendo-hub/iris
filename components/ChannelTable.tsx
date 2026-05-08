type Row = {
  channel: string;
  cost: number | null;
  sessions: number | null;
  ctaClicks: number | null;
  cpc: number | null;
};

export function ChannelTable({ rows }: { rows: Row[] }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--cockpit-card)", border: "1px solid var(--cockpit-border)" }}
    >
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--cockpit-border)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--fg1)" }}>Por canal</h3>
      </div>
      <table className="w-full" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--fg2)", fontWeight: 700 }}>
            <th className="text-left px-5 py-2">Canal</th>
            <th className="text-right px-5 py-2">Custo</th>
            <th className="text-right px-5 py-2">Visitas</th>
            <th className="text-right px-5 py-2">Cliques CTA</th>
            <th className="text-right px-5 py-2">CPC</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="text-center px-5 py-6" style={{ color: "var(--fg2)" }}>
                Sem dados nesse período.
              </td>
            </tr>
          ) : rows.map((r) => (
            <tr key={r.channel} style={{ borderTop: "1px solid var(--cockpit-border)", fontSize: 13 }}>
              <td className="px-5 py-3" style={{ color: "var(--fg1)", fontWeight: 500 }}>{r.channel}</td>
              <td className="px-5 py-3 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}>{fmtCurrency(r.cost)}</td>
              <td className="px-5 py-3 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}>{fmtNum(r.sessions)}</td>
              <td className="px-5 py-3 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--brand)" }}>{fmtNum(r.ctaClicks)}</td>
              <td className="px-5 py-3 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}>{fmtCurrency(r.cpc)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtCurrency(n: number | null) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}
function fmtNum(n: number | null) {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("pt-BR").format(n);
}
