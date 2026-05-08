export function CTAPositionTable({ rows }: { rows: { position: string; clicks: number }[] }) {
  const total = rows.reduce((sum, r) => sum + r.clicks, 0);
  const max = Math.max(1, ...rows.map((r) => r.clicks));

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: "var(--cockpit-card)", border: "1px solid var(--cockpit-border)" }}
    >
      <div className="flex items-baseline justify-between mb-4">
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--fg1)" }}>Por posição do CTA</h3>
        <span style={{ fontSize: 11, color: "var(--fg2)" }}>{total} cliques no período</span>
      </div>
      {rows.length === 0 ? (
        <div className="py-6 text-center" style={{ color: "var(--fg2)", fontSize: 13 }}>
          Sem cliques rastreados ainda.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((r) => (
            <div key={r.position} className="flex items-center gap-3">
              <span className="w-16 shrink-0" style={{ fontSize: 12, color: "var(--fg2)", textTransform: "uppercase", fontWeight: 600 }}>
                {r.position}
              </span>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--cockpit-card-strong)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(r.clicks / max) * 100}%`,
                    background: "var(--grad-brand)",
                  }}
                />
              </div>
              <span className="w-12 text-right" style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--fg1)", fontWeight: 600 }}>
                {r.clicks}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
