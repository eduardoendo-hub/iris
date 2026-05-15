/**
 * DailyInsightCard — card da análise estratégica diária gerada pelo agente.
 *
 * Mostra:
 *   - badge severidade + data analisada + modelo usado
 *   - headline (1 linha em destaque)
 *   - summary (markdown narrativo)
 *   - lista de recomendações priorizadas
 */
type Recommendation = {
  priority: number;
  action: string;
  expected_impact: string;
};

type Severity = "INFO" | "WARN" | "HIGH" | "CRITICAL";

const SEVERITY_STYLE: Record<Severity, { color: string; bg: string; label: string }> = {
  INFO: { color: "var(--brand-soft)", bg: "rgba(129,216,208,0.15)", label: "INFO" },
  WARN: { color: "#F7C948", bg: "rgba(247,201,72,0.15)", label: "ATENÇÃO" },
  HIGH: { color: "#D97757", bg: "rgba(217,119,87,0.18)", label: "AÇÃO NECESSÁRIA" },
  CRITICAL: { color: "#EC6088", bg: "rgba(236,96,136,0.18)", label: "CRÍTICO" },
};

function severityOrInfo(s: string): Severity {
  return (["INFO", "WARN", "HIGH", "CRITICAL"] as const).includes(s as Severity)
    ? (s as Severity)
    : "INFO";
}

export function DailyInsightCard({
  analysisDate,
  generatedAt,
  headline,
  summary,
  severity,
  recommendations,
  model,
}: {
  analysisDate: Date | string;
  generatedAt: Date | string;
  headline: string;
  summary: string;
  severity: string;
  recommendations: Recommendation[];
  model?: string;
}) {
  const sev = severityOrInfo(severity);
  const style = SEVERITY_STYLE[sev];
  const ad = typeof analysisDate === "string" ? new Date(analysisDate) : analysisDate;
  const ga = typeof generatedAt === "string" ? new Date(generatedAt) : generatedAt;

  const dateLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "America/Sao_Paulo",
  }).format(ad);

  const sortedRecs = [...recommendations].sort((a, b) => a.priority - b.priority);

  return (
    <article
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--cockpit-card)",
        border: "1px solid var(--cockpit-border)",
        borderLeft: `4px solid ${style.color}`,
      }}
    >
      <header
        className="px-5 py-4 flex items-center gap-3 flex-wrap"
        style={{ borderBottom: "1px solid var(--cockpit-border)" }}
      >
        <span
          style={{
            color: style.color,
            background: style.bg,
            padding: "3px 10px",
            borderRadius: 4,
            fontSize: 10,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: "var(--ls-eyebrow)",
          }}
        >
          {style.label}
        </span>
        <span
          style={{
            color: "var(--fg1)",
            fontSize: 13,
            fontWeight: 600,
            textTransform: "capitalize",
          }}
        >
          {dateLabel}
        </span>
        <span style={{ color: "var(--fg2)", fontSize: 11, marginLeft: "auto" }}>
          {model ?? "agente"} · gerado{" "}
          {new Intl.DateTimeFormat("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "America/Sao_Paulo",
          }).format(ga)}
        </span>
      </header>

      <div className="px-5 py-4 flex flex-col gap-3">
        <h3
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--fg1)",
            lineHeight: 1.35,
          }}
        >
          {headline}
        </h3>
        <p
          style={{
            fontSize: 13,
            color: "var(--fg1)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}
        >
          {summary}
        </p>
      </div>

      <div
        className="px-5 py-4 flex flex-col gap-2"
        style={{ borderTop: "1px dashed var(--cockpit-border)", background: "rgba(10,186,181,0.03)" }}
      >
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "var(--ls-eyebrow)",
            fontWeight: 700,
            color: "var(--brand)",
          }}
        >
          Próximas ações
        </span>
        {sortedRecs.length === 0 ? (
          <span
            style={{
              fontSize: 12,
              color: "var(--fg2)",
              fontStyle: "italic",
              marginTop: 4,
            }}
          >
            O agente não gerou ações para este dia (re-rode o cron para forçar a regeneração).
          </span>
        ) : (
          <ol className="flex flex-col gap-3" style={{ paddingLeft: 0, marginTop: 4 }}>
            {sortedRecs.map((r, i) => (
              <li
                key={i}
                className="flex gap-3"
                style={{
                  listStyle: "none",
                  background: "var(--cockpit-card)",
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--cockpit-border)",
                }}
              >
                <span
                  style={{
                    minWidth: 22,
                    height: 22,
                    borderRadius: "50%",
                    background: r.priority === 1 ? "var(--brand)" : "var(--cockpit-border)",
                    color: r.priority === 1 ? "var(--fg-on-brand)" : "var(--fg1)",
                    fontSize: 11,
                    fontWeight: 800,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-mono)",
                  }}
                  title={`Prioridade ${r.priority}`}
                >
                  {r.priority}
                </span>
                <div className="flex flex-col gap-1 flex-1">
                  <span style={{ fontSize: 13, color: "var(--fg1)", fontWeight: 600 }}>
                    {r.action}
                  </span>
                  <span style={{ fontSize: 11, color: "var(--fg2)", lineHeight: 1.45 }}>
                    Impacto esperado: {r.expected_impact}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </article>
  );
}
