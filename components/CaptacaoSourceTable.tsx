/**
 * CaptacaoSourceTable — visitas e cliques agrupados por canal + campanha + anuncio.
 *
 * Server component: recebe rows ja agregados pelo /api/captacao (ou query
 * direta do server component). Mostra origem do trafego pra responder
 * "de onde vem cada lead?" e "qual peca esta performando melhor?".
 *
 * Colunas:
 *   Canal    — formato "utm_source / utm_medium" (ex: "meta / cpc")
 *   Campanha — utm_campaign (ex: "M1-PROSP-CLAUDEPRO-MAI26")
 *   Anuncio  — utm_content (ex: "M1-VIDEO-CLAUDEPRO-PARE-PERGUNTAR")
 *   Visitas  — count de lp_view
 *   Compra   — count de click_compra
 *   Conv %   — clickCompra / visits
 *
 * Ordenacao: campanha asc → visits desc (rows da mesma campanha ficam
 * agrupados visualmente — sem precisar de nested rows).
 *
 * Detecta tambem macros nao-substituidas tipo "{{ad.name}}" (sinal que o
 * Meta nao processou a URL — config errada na campanha).
 */
type Row = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  visits: number;
  clickCompra: number;
  clickConsultor: number;
  clickWhats: number;
  leadForm: number;
};

export function CaptacaoSourceTable({ rows, days }: { rows: Row[]; days: number }) {
  const totals = rows.reduce(
    (acc, r) => {
      acc.visits += r.visits;
      acc.clickCompra += r.clickCompra;
      acc.clickConsultor += r.clickConsultor;
      acc.clickWhats += r.clickWhats;
      return acc;
    },
    { visits: 0, clickCompra: 0, clickConsultor: 0, clickWhats: 0 }
  );

  // Detecta macros nao-substituidas pelo Meta (config errada) — vamos avisar no UI
  const macroLeaks = rows.filter((r) =>
    [r.utmContent, r.utmCampaign].some((v) => v && /^\{\{.+\}\}$/.test(v))
  ).length;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--cockpit-card)", border: "1px solid var(--cockpit-border)" }}
    >
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--cockpit-border)" }}
      >
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--fg1)" }}>
          Por fonte (UTM) — últimos {days} dias
        </h3>
        <span style={{ fontSize: 11, color: "var(--fg2)", fontFamily: "var(--font-mono)" }}>
          {fmtNum(totals.visits)} visitas · {fmtNum(totals.clickCompra)} cliques compra
        </span>
      </div>
      {macroLeaks > 0 && (
        <div
          className="px-5 py-2"
          style={{
            background: "rgba(247,201,72,0.08)",
            borderBottom: "1px solid var(--cockpit-border)",
            color: "var(--tn-gold)",
            fontSize: 11,
          }}
        >
          ⚠️ {macroLeaks} {macroLeaks === 1 ? "linha contém" : "linhas contêm"} macro não substituída
          ({"{{...}}"}) — confirme tracking template no Meta/Google Ads.
        </div>
      )}
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
              <th className="text-left px-5 py-2">Canal</th>
              <th className="text-left px-5 py-2">Campanha</th>
              <th className="text-left px-5 py-2">Anúncio</th>
              <th className="text-right px-5 py-2">Visitas</th>
              <th className="text-right px-5 py-2">Compra</th>
              <th className="text-right px-5 py-2">Consultor</th>
              <th className="text-right px-5 py-2">WhatsApp</th>
              <th className="text-right px-5 py-2">Conv %</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center px-5 py-6" style={{ color: "var(--fg2)" }}>
                  Sem visitas registradas no período. Aguardando primeiro lp_view com UTM.
                </td>
              </tr>
            ) : (
              rows.map((r, i) => {
                const channel = formatChannel(r.utmSource, r.utmMedium);
                const conv = r.visits > 0 ? (r.clickCompra / r.visits) * 100 : 0;
                const isMacroLeak =
                  (r.utmContent && /^\{\{.+\}\}$/.test(r.utmContent)) ||
                  (r.utmCampaign && /^\{\{.+\}\}$/.test(r.utmCampaign));
                return (
                  <tr
                    key={`${r.utmSource}|${r.utmMedium}|${r.utmCampaign}|${r.utmContent}|${i}`}
                    style={{
                      borderTop: "1px solid var(--cockpit-border)",
                      fontSize: 13,
                      background: isMacroLeak ? "rgba(247,201,72,0.04)" : undefined,
                    }}
                  >
                    <td className="px-5 py-3" style={{ color: "var(--fg1)", fontWeight: 500 }}>
                      {channel}
                    </td>
                    <td
                      className="px-5 py-3"
                      style={{ color: "var(--fg1)", fontFamily: "var(--font-mono)", fontSize: 12 }}
                    >
                      {r.utmCampaign || <span style={{ color: "var(--fg2)" }}>—</span>}
                    </td>
                    <td
                      className="px-5 py-3"
                      style={{
                        color: isMacroLeak ? "var(--tn-gold)" : "var(--fg1)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        maxWidth: 260,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={r.utmContent || ""}
                    >
                      {r.utmContent || <span style={{ color: "var(--fg2)" }}>—</span>}
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}
                    >
                      {fmtNum(r.visits)}
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: r.clickCompra > 0 ? "var(--brand)" : "var(--fg2)",
                        fontWeight: r.clickCompra > 0 ? 600 : 400,
                      }}
                    >
                      {fmtNum(r.clickCompra)}
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}
                    >
                      {fmtNum(r.clickConsultor)}
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}
                    >
                      {fmtNum(r.clickWhats)}
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: conv > 0 ? "var(--brand)" : "var(--fg2)",
                      }}
                    >
                      {r.visits > 0 ? `${conv.toFixed(1)}%` : "—"}
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

function formatChannel(source: string | null, medium: string | null): string {
  if (!source && !medium) return "Direto / orgânico";
  const s = source || "?";
  const m = medium || "?";
  return `${s} / ${m}`;
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n);
}
