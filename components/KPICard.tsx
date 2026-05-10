type Format = "number" | "currency" | "percent";

export function KPICard({
  label,
  value,
  delta,
  format = "number",
  hint,
}: {
  label: string;
  value: number | null;
  delta?: number | null;
  format?: Format;
  hint?: string;
}) {
  const formatted = value === null ? "—" : formatValue(value, format);
  const deltaColor = delta == null ? "var(--delta-flat)" : delta > 0 ? "var(--delta-up)" : delta < 0 ? "var(--delta-down)" : "var(--delta-flat)";
  const deltaArrow = delta == null ? "" : delta > 0 ? "▲" : delta < 0 ? "▼" : "→";

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-2"
      style={{
        background: "var(--cockpit-card)",
        border: "1px solid var(--cockpit-border)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div
        className="flex items-center gap-2"
        style={{ color: "var(--brand-soft)", fontSize: "var(--fs-caption)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", fontWeight: 700, opacity: 0.95 }}
      >
        {label}
      </div>
      <div className="flex items-baseline gap-3">
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 30, fontWeight: 700, color: "var(--fg1)", lineHeight: 1 }}>
          {formatted}
        </span>
        {delta != null && (
          <span style={{ color: deltaColor, fontSize: 13, fontWeight: 600, fontFamily: "var(--font-mono)" }}>
            {deltaArrow} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      {hint && <span style={{ color: "var(--fg2)", fontSize: 11 }}>{hint}</span>}
    </div>
  );
}

function formatValue(value: number, format: Format) {
  if (format === "currency") {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  }
  if (format === "percent") {
    return `${value.toFixed(2)}%`;
  }
  return new Intl.NumberFormat("pt-BR").format(value);
}
