/**
 * MetasCard — card compacto mostrando metas da campanha + status atual.
 *
 * Layout: cabecalho fino com contexto (dia da campanha, dias ate fim) +
 * uma row por meta com 4 colunas:
 *   [Label]  [Atual / Alvo]  [Barra de progresso]  [Status icon]
 *
 * Status:
 *   ✓  verde   — bom (atingiu/superou)
 *   ⚠  amarelo — atencao (70-100% do caminho ou no limite)
 *   ⨯  vermelho — fora do target
 *
 * "Direcao" da meta:
 *   - "min" → quer atingir OU superar o alvo (matriculas, receita, ROAS)
 *   - "max" → alvo eh um LIMITE; quer ficar abaixo (CAC, CPL, spend total)
 */

type Direction = "min" | "max";
type Format = "currency" | "number" | "percent" | "multiplier";

export type Meta = {
  label: string;
  atual: number;
  alvo: number;
  format: Format;
  direction: Direction;
  /** Texto extra opcional ao lado da meta (ex: "≤ R$ 300") */
  hint?: string;
};

export function MetasCard({
  metas,
  campaignDay,
  daysToEnd,
  budgetTotal,
}: {
  metas: Meta[];
  campaignDay: number | null;
  daysToEnd: number | null;
  budgetTotal?: number;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--cockpit-card)",
        border: "1px solid var(--cockpit-border)",
      }}
    >
      <div
        className="px-4 py-2.5 flex items-center justify-between flex-wrap gap-2"
        style={{ borderBottom: "1px solid var(--cockpit-border)" }}
      >
        <div className="flex items-center gap-3">
          <span
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "var(--ls-eyebrow)",
              color: "var(--brand)",
              fontWeight: 800,
            }}
          >
            Metas da campanha
          </span>
          {campaignDay !== null && (
            <span style={{ fontSize: 11, color: "var(--fg2)", fontFamily: "var(--font-mono)" }}>
              dia {campaignDay}
              {daysToEnd !== null && daysToEnd >= 0 ? ` · ${daysToEnd}d restantes` : ""}
            </span>
          )}
        </div>
        {budgetTotal !== undefined && (
          <span style={{ fontSize: 11, color: "var(--fg2)", fontFamily: "var(--font-mono)" }}>
            budget {fmt(budgetTotal, "currency")}
          </span>
        )}
      </div>
      <div className="flex flex-col">
        {metas.map((m, i) => (
          <MetaRow key={i} {...m} />
        ))}
      </div>
    </div>
  );
}

function MetaRow({ label, atual, alvo, format, direction, hint }: Meta) {
  // progress = quao perto/longe estamos
  // Pra direction "min": progress = atual/alvo (>=1 atingiu)
  // Pra direction "max": progress = 1 - atual/alvo (1 = no zero, 0 = no limite)
  const ratio = alvo > 0 ? atual / alvo : 0;

  let statusKind: "good" | "warn" | "bad";
  if (direction === "min") {
    if (ratio >= 1.0) statusKind = "good";
    else if (ratio >= 0.7) statusKind = "warn";
    else statusKind = "bad";
  } else {
    // max: melhor quando atual <= alvo
    if (ratio <= 1.0) statusKind = "good";
    else if (ratio <= 1.3) statusKind = "warn";
    else statusKind = "bad";
  }

  const STATUS = {
    good: { icon: "✓", color: "#30D158", barColor: "#30D158" },
    warn: { icon: "⚠", color: "#F7C948", barColor: "#F7C948" },
    bad: { icon: "✕", color: "#EC6088", barColor: "#EC6088" },
  } as const;
  const s = STATUS[statusKind];

  // Barra: pra "min" mostra progresso ate alvo; pra "max" mostra "consumo do limite"
  const barFill = Math.min(Math.max(ratio, 0), 1.5); // cap a 1.5 pra nao explodir
  const barPercent = Math.min(barFill / 1.5, 1) * 100; // normaliza pra 0-100% da largura

  // Percent label: pra min=quanto do alvo atingiu; pra max=quanto do limite consumiu
  const percent = ratio * 100;
  const percentLabel = `${percent >= 1000 ? Math.round(percent) : percent.toFixed(percent >= 100 ? 0 : 1)}%`;
  const percentTooltip =
    direction === "min" ? "do alvo atingido" : "do limite consumido";

  return (
    <div
      className="grid items-center gap-3 px-4 py-2"
      style={{
        gridTemplateColumns: "minmax(110px, 1fr) minmax(170px, auto) minmax(80px, 2fr) 56px auto",
        borderTop: "1px solid var(--cockpit-border)",
        fontSize: 12,
      }}
    >
      <span style={{ color: "var(--fg1)", fontWeight: 500 }}>{label}</span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          color: "var(--fg1)",
          fontSize: 12,
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
      >
        <span style={{ fontWeight: 700 }}>{fmt(atual, format)}</span>
        <span style={{ color: "var(--fg2)" }}> {direction === "min" ? "/" : direction === "max" ? "≤" : "/"} </span>
        <span style={{ color: "var(--fg2)" }}>{fmt(alvo, format)}</span>
        {hint && <span style={{ color: "var(--fg2)", marginLeft: 6 }}>{hint}</span>}
      </span>
      <div
        style={{
          height: 5,
          background: "var(--cockpit-border)",
          borderRadius: 3,
          overflow: "hidden",
          minWidth: 60,
        }}
        title={`${percent.toFixed(0)}% ${percentTooltip}`}
      >
        <div
          style={{
            width: `${barPercent}%`,
            height: "100%",
            background: s.barColor,
            transition: "width 0.3s",
          }}
        />
      </div>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          color: s.color,
          textAlign: "right",
          whiteSpace: "nowrap",
        }}
        title={percentTooltip}
      >
        {percentLabel}
      </span>
      <span
        style={{
          color: s.color,
          fontWeight: 700,
          fontSize: 14,
          width: 18,
          textAlign: "center",
        }}
        title={statusKind === "good" ? "dentro do alvo" : statusKind === "warn" ? "atenção" : "fora do alvo"}
      >
        {s.icon}
      </span>
    </div>
  );
}

function fmt(n: number, format: Format): string {
  if (format === "currency") {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      maximumFractionDigits: n >= 10000 ? 0 : 2,
    }).format(n);
  }
  if (format === "percent") return `${n.toFixed(1)}%`;
  if (format === "multiplier") return `${n.toFixed(1)}×`;
  return new Intl.NumberFormat("pt-BR").format(Math.round(n));
}
