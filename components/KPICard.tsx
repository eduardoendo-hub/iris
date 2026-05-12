import type { ReactNode } from "react";

type Format = "number" | "currency" | "percent";

export type KpiSplit = { label: string; value: number; color?: string };

export function KPICard({
  label,
  value,
  delta,
  format = "number",
  hint,
  icon,
  splits,
  emphasis = "normal",
  secondaryValue,
  secondaryLabel,
}: {
  label: string;
  value: number | null;
  delta?: number | null;
  format?: Format;
  hint?: string;
  icon?: ReactNode;
  splits?: KpiSplit[];
  /** "strong" deixa a cor de fundo mais clara — usado no bloco de Vendas pra dar destaque executivo */
  emphasis?: "normal" | "strong";
  /** Segundo valor mostrado embaixo do valor principal — ex: "no mes: R$ 1.234,56". */
  secondaryValue?: number | null;
  secondaryLabel?: string;
}) {
  const formatted = value === null ? "—" : formatValue(value, format);
  const deltaColor =
    delta == null
      ? "var(--delta-flat)"
      : delta > 0
      ? "var(--delta-up)"
      : delta < 0
      ? "var(--delta-down)"
      : "var(--delta-flat)";
  const deltaArrow =
    delta == null ? "" : delta > 0 ? "▲" : delta < 0 ? "▼" : "→";

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-2"
      style={{
        background: emphasis === "strong" ? "var(--cockpit-card-strong)" : "var(--cockpit-card)",
        border: "1px solid var(--cockpit-border)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <div
        className="flex items-center gap-2"
        style={{
          color: "var(--brand-soft)",
          fontSize: "var(--fs-caption)",
          textTransform: "uppercase",
          letterSpacing: "var(--ls-eyebrow)",
          fontWeight: 700,
          opacity: 0.95,
        }}
      >
        {icon && (
          <span style={{ display: "inline-flex", alignItems: "center", color: "var(--brand)" }}>
            {icon}
          </span>
        )}
        <span>{label}</span>
      </div>
      <div className="flex items-baseline gap-3">
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: emphasis === "strong" ? 36 : 30,
            fontWeight: 700,
            color: "var(--fg1)",
            lineHeight: 1,
          }}
        >
          {formatted}
        </span>
        {delta != null && (
          <span
            style={{
              color: deltaColor,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: "var(--font-mono)",
            }}
          >
            {deltaArrow} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
      {hint && <span style={{ color: "var(--fg2)", fontSize: 11 }}>{hint}</span>}

      {secondaryValue != null && (
        <div className="flex items-baseline gap-2">
          {secondaryLabel && (
            <span
              style={{
                color: "var(--fg2)",
                fontSize: 11,
                textTransform: "uppercase",
                letterSpacing: "var(--ls-eyebrow)",
                fontWeight: 600,
              }}
            >
              {secondaryLabel}
            </span>
          )}
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              fontWeight: 600,
              color: "var(--fg1)",
            }}
          >
            {formatValue(secondaryValue, format)}
          </span>
        </div>
      )}

      {splits && splits.length > 0 && (
        <div
          className="flex flex-col gap-1 mt-2 pt-2"
          style={{ borderTop: "1px solid var(--cockpit-border)" }}
        >
          {splits.map((s) => (
            <div
              key={s.label}
              className="flex items-center justify-between"
              style={{ fontSize: 12 }}
            >
              <span style={{ color: "var(--fg2)" }}>{s.label}</span>
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontWeight: 700,
                  color: s.color ?? "var(--fg1)",
                }}
              >
                {new Intl.NumberFormat("pt-BR").format(s.value)}
              </span>
            </div>
          ))}
        </div>
      )}
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
