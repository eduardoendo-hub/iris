import type { CampaignResults } from "@/lib/analytics";

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

const formatInt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

/** "2026-05-11" -> "11/05/2026"; null -> "—" */
function formatDateBR(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Quadro "Resultados" — sumário executivo da campanha. Primeiro bloco da aba
 * analítica. Mostra Vendas Totais, Receita, Investimento (mídia e total) e o
 * ROAS (resultado final = Receita / Investimento Total), além da janela da
 * campanha (data de ativação → desativação prevista).
 */
export function ResultadosPanel({ results }: { results: CampaignResults }) {
  const {
    salesCount,
    revenue,
    mediaInvestment,
    mediaMeta,
    mediaGoogle,
    totalInvestment,
    roas,
    campaignStart,
    campaignEnd,
  } = results;

  const roasLabel = totalInvestment > 0 ? `${roas.toFixed(2)}×` : "—";
  const roasColor = roas >= 1 ? "#30D158" : roas > 0 ? "#FF9F0A" : "var(--fg2)";

  return (
    <section
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{
        background: "var(--cockpit-card)",
        border: "1px solid var(--cockpit-border-strong)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-col gap-0.5">
          <span
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "var(--ls-eyebrow)",
              color: "var(--brand)",
              fontWeight: 700,
            }}
          >
            Resultados
          </span>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--fg1)" }}>
            Resultado final da campanha
          </h2>
        </div>
        <div
          className="flex items-center gap-4"
          style={{ fontSize: 11, color: "var(--fg2)", fontFamily: "var(--font-mono)" }}
        >
          <span className="flex flex-col">
            <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.7 }}>
              Ativada
            </span>
            <span style={{ color: "var(--fg1)", fontWeight: 700 }}>
              {formatDateBR(campaignStart)}
            </span>
          </span>
          <span style={{ opacity: 0.4 }}>→</span>
          <span className="flex flex-col">
            <span style={{ textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.7 }}>
              Encerra
            </span>
            <span style={{ color: "var(--fg1)", fontWeight: 700 }}>
              {formatDateBR(campaignEnd)}
            </span>
          </span>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Stat label="Vendas Totais" value={formatInt(salesCount)} />
        <Stat label="Receita" value={formatBRL(revenue)} valueColor="#30D158" />
        <Stat
          label="Investimento Mídia"
          value={formatBRL(mediaInvestment)}
          valueColor="#FF9F0A"
          breakdown={[
            { label: "Meta", value: formatBRL(mediaMeta), color: "#0A84FF" },
            { label: "Google", value: formatBRL(mediaGoogle), color: "#FFD60A" },
          ]}
        />
        <Stat label="Investimento Total" value={formatBRL(totalInvestment)} valueColor="#D97757" />
        <Stat label="ROAS" value={roasLabel} valueColor={roasColor} emphasis />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  valueColor = "var(--fg1)",
  emphasis = false,
  breakdown,
}: {
  label: string;
  value: string;
  valueColor?: string;
  emphasis?: boolean;
  breakdown?: Array<{ label: string; value: string; color: string }>;
}) {
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-1"
      style={{
        background: "var(--cockpit-card-strong)",
        border: emphasis ? "1px solid var(--brand)" : "1px solid var(--cockpit-border)",
      }}
    >
      <span
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "var(--ls-eyebrow)",
          color: "var(--brand-soft)",
          fontWeight: 700,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: emphasis ? 24 : 20,
          fontWeight: 700,
          color: valueColor,
          fontFamily: "var(--font-mono)",
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      {breakdown && breakdown.length > 0 && (
        <div className="flex flex-col gap-0.5 mt-1">
          {breakdown.map((b) => (
            <span
              key={b.label}
              className="flex items-center justify-between"
              style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--fg2)" }}
            >
              <span className="flex items-center gap-1.5">
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    background: b.color,
                    display: "inline-block",
                  }}
                />
                {b.label}
              </span>
              <span style={{ color: "var(--fg1)", fontWeight: 600 }}>{b.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
