type Severity = "INFO" | "WARN" | "HIGH" | "CRITICAL";
type Category = "ANOMALY" | "OPPORTUNITY" | "SUMMARY" | "FORECAST";

export function InsightItem({
  severity,
  category,
  title,
  body,
  recommendation,
  generatedAt,
}: {
  severity: Severity;
  category: Category;
  title: string;
  body: string;
  recommendation?: string | null;
  generatedAt: Date | string;
}) {
  const color = SEVERITY_COLOR[severity];
  const bg = SEVERITY_BG[severity];

  return (
    <article
      className="relative rounded-lg p-4 pl-5"
      style={{
        background: "var(--cockpit-card)",
        border: "1px solid var(--cockpit-border)",
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className="flex items-center gap-2 mb-2" style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", fontWeight: 700 }}>
        <span style={{ color, padding: "2px 8px", borderRadius: 4, background: bg }}>{severity}</span>
        <span style={{ color: "var(--fg2)" }}>· {category}</span>
        <span style={{ color: "var(--fg2)", marginLeft: "auto" }}>{formatTime(generatedAt)}</span>
      </div>
      <h4 style={{ fontSize: 15, fontWeight: 700, color: "var(--fg1)", marginBottom: 6, lineHeight: 1.3 }}>
        {title}
      </h4>
      <p style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>
        {body}
      </p>
      {recommendation && (
        <div className="mt-3 pt-3" style={{ borderTop: "1px dashed var(--cockpit-border-strong)" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--brand)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)" }}>
            Sugestão
          </span>
          <p style={{ fontSize: 13, color: "var(--fg1)", marginTop: 4, lineHeight: 1.5 }}>{recommendation}</p>
        </div>
      )}
    </article>
  );
}

const SEVERITY_COLOR: Record<Severity, string> = {
  INFO: "var(--status-info)",
  WARN: "var(--status-warn)",
  HIGH: "var(--status-high)",
  CRITICAL: "var(--status-critical)",
};

const SEVERITY_BG: Record<Severity, string> = {
  INFO: "var(--status-info-bg)",
  WARN: "var(--status-warn-bg)",
  HIGH: "var(--status-high-bg)",
  CRITICAL: "var(--status-critical-bg)",
};

function formatTime(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  const now = Date.now();
  const diff = Math.floor((now - date.getTime()) / 1000);
  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return date.toLocaleString("pt-BR");
}
