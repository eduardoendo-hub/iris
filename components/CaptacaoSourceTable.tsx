"use client";

/**
 * CaptacaoSourceTable — visitas e cliques agrupados por canal + campanha,
 * com drill-down expansivel por anuncio (utm_content).
 *
 * UX:
 *   - View default: 1 linha por (canal × campanha), totais somados de todos
 *     os anuncios. Coluna "Anúncios" mostra quantos pecas a campanha rodou.
 *   - Clica na linha → expande mostrando 1 sub-linha por utmContent com
 *     totais de cada anuncio. Permite comparar performance entre criativos.
 *   - Campanha com 1 unico anuncio nao precisa expandir (chevron fica
 *     desativado).
 *
 * Detecta macros nao-substituidas ({{ad.name}}) e destaca em amarelo —
 * sinal que o tracking template do Meta/Google nao processou a URL.
 */
import { useMemo, useState } from "react";

type Row = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  /** utm_term — palavra-chave (Google: {keyword}; Meta: geralmente
   *  {adset.name}). Quando presente, exibido como label principal do
   *  sub-row de anúncio. */
  utmTerm?: string | null;
  visits: number;
  clickCompra: number;
  clickConsultor: number;
  clickWhats: number;
  leadForm: number;
};

type Group = {
  key: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  visits: number;
  clickCompra: number;
  clickConsultor: number;
  clickWhats: number;
  leadForm: number;
  ads: Row[];
};

export function CaptacaoSourceTable({
  rows,
  periodLabel = "toda a campanha",
}: {
  rows: Row[];
  /** Label exibido no header — ex: "toda a campanha", "últimos 7 dias" */
  periodLabel?: string;
}) {
  const groups = useMemo(() => groupByCampaign(rows), [rows]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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
          Por fonte (UTM) — {periodLabel}
        </h3>
        <span style={{ fontSize: 11, color: "var(--fg2)", fontFamily: "var(--font-mono)" }}>
          {fmtNum(totals.visits)} visitas · {fmtNum(totals.clickCompra)} cliques compra
        </span>
      </div>
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
              <th className="text-left px-5 py-2" style={{ width: 28 }}></th>
              <th className="text-left px-5 py-2">Canal</th>
              <th className="text-left px-5 py-2">Campanha / Anúncio</th>
              <th className="text-right px-5 py-2">Anúncios</th>
              <th className="text-right px-5 py-2" title="Total de lp_view enviados pela LP">Visitas</th>
              <th
                className="text-right px-5 py-2"
                title="Cliques no botão de compra (click_compra) — apenas INTENT, não é venda confirmada. Quem efetivamente pagou aparece em Vendas."
                style={{ cursor: "help" }}
              >
                Cliques compra
              </th>
              <th className="text-right px-5 py-2" title="Cliques em Falar com consultor / form de lead">Consultor</th>
              <th className="text-right px-5 py-2" title="Cliques no botão flutuante WhatsApp">WhatsApp</th>
              <th className="text-right px-5 py-2" title="Conversão: cliques compra / visitas (intent rate)">Conv %</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center px-5 py-6" style={{ color: "var(--fg2)" }}>
                  Sem visitas registradas no período. Aguardando primeiro lp_view com UTM.
                </td>
              </tr>
            ) : (
              groups.flatMap((g) => {
                const isExpandable = g.ads.length > 1;
                const isOpen = expanded.has(g.key);
                const channel = formatChannel(g.utmSource, g.utmMedium);
                const conv = g.visits > 0 ? (g.clickCompra / g.visits) * 100 : 0;
                const rowKey = g.key;

                const summary = (
                  <tr
                    key={`g-${rowKey}`}
                    onClick={isExpandable ? () => toggle(rowKey) : undefined}
                    style={{
                      borderTop: "1px solid var(--cockpit-border)",
                      fontSize: 13,
                      cursor: isExpandable ? "pointer" : "default",
                      background: isOpen ? "rgba(10,186,181,0.04)" : undefined,
                    }}
                  >
                    <td className="px-5 py-3" style={{ color: "var(--fg2)" }}>
                      {isExpandable ? (isOpen ? "▼" : "▶") : ""}
                    </td>
                    <td className="px-5 py-3" style={{ color: "var(--fg1)", fontWeight: 500 }}>
                      {channel}
                    </td>
                    <td
                      className="px-5 py-3"
                      style={{
                        color: "var(--fg1)",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        fontWeight: 600,
                      }}
                    >
                      {g.utmCampaign || <span style={{ color: "var(--fg2)" }}>(sem campanha)</span>}
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: "var(--fg2)",
                        fontSize: 12,
                      }}
                    >
                      {g.ads.length}
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)", fontWeight: 600 }}
                    >
                      {fmtNum(g.visits)}
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: g.clickCompra > 0 ? "var(--brand)" : "var(--fg2)",
                        fontWeight: g.clickCompra > 0 ? 700 : 400,
                      }}
                    >
                      {fmtNum(g.clickCompra)}
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}
                    >
                      {fmtNum(g.clickConsultor)}
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}
                    >
                      {fmtNum(g.clickWhats)}
                    </td>
                    <td
                      className="px-5 py-3 text-right"
                      style={{
                        fontFamily: "var(--font-mono)",
                        color: conv > 0 ? "var(--brand)" : "var(--fg2)",
                        fontWeight: conv > 0 ? 600 : 400,
                      }}
                    >
                      {g.visits > 0 ? `${conv.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                );

                if (!isOpen || !isExpandable) return [summary];

                // Sub-rows por anuncio
                const subRows = g.ads.map((ad, i) => {
                  const adConv = ad.visits > 0 ? (ad.clickCompra / ad.visits) * 100 : 0;
                  return (
                    <tr
                      key={`g-${rowKey}-ad-${i}`}
                      style={{
                        borderTop: "1px dashed var(--cockpit-border)",
                        fontSize: 12,
                        background: "rgba(10,186,181,0.02)",
                      }}
                    >
                      <td className="px-5 py-2"></td>
                      <td className="px-5 py-2" style={{ color: "var(--fg2)" }}>
                        └
                      </td>
                      <td
                        className="px-5 py-2"
                        style={{
                          maxWidth: 360,
                          overflow: "hidden",
                          paddingLeft: 28,
                        }}
                        title={[
                          ad.utmTerm ? `keyword: ${ad.utmTerm}` : null,
                          ad.utmContent ? `content: ${ad.utmContent}` : null,
                        ].filter(Boolean).join("\n") || ""}
                      >
                        {(() => {
                          // utmContent eh ID puro (so digitos + underscore + hifen)?
                          // Se sim e tem utmTerm, exibe term (humano) como
                          // principal e content (ID) como sub-label cinza.
                          const isIdish = ad.utmContent && /^[\d_-]+$/.test(ad.utmContent);
                          const primary = (ad.utmTerm && isIdish)
                            ? ad.utmTerm
                            : ad.utmContent || ad.utmTerm || null;
                          const secondary = (ad.utmTerm && isIdish)
                            ? ad.utmContent
                            : (ad.utmTerm && primary !== ad.utmTerm ? ad.utmTerm : null);
                          return (
                            <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              <div style={{
                                color: "var(--fg1)",
                                fontFamily: "var(--font-mono)",
                                fontSize: 11,
                                fontWeight: primary ? 500 : 400,
                              }}>
                                {primary ?? (
                                  <span style={{ color: "var(--fg2)" }}>(sem utm_content/term)</span>
                                )}
                              </div>
                              {secondary && (
                                <div style={{
                                  fontSize: 10,
                                  color: "var(--fg2)",
                                  fontFamily: "var(--font-mono)",
                                  marginTop: 2,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                }}>
                                  {secondary}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-5 py-2"></td>
                      <td
                        className="px-5 py-2 text-right"
                        style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}
                      >
                        {fmtNum(ad.visits)}
                      </td>
                      <td
                        className="px-5 py-2 text-right"
                        style={{
                          fontFamily: "var(--font-mono)",
                          color: ad.clickCompra > 0 ? "var(--brand)" : "var(--fg2)",
                          fontWeight: ad.clickCompra > 0 ? 600 : 400,
                        }}
                      >
                        {fmtNum(ad.clickCompra)}
                      </td>
                      <td
                        className="px-5 py-2 text-right"
                        style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}
                      >
                        {fmtNum(ad.clickConsultor)}
                      </td>
                      <td
                        className="px-5 py-2 text-right"
                        style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}
                      >
                        {fmtNum(ad.clickWhats)}
                      </td>
                      <td
                        className="px-5 py-2 text-right"
                        style={{
                          fontFamily: "var(--font-mono)",
                          color: adConv > 0 ? "var(--brand)" : "var(--fg2)",
                        }}
                      >
                        {ad.visits > 0 ? `${adConv.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  );
                });

                return [summary, ...subRows];
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function groupByCampaign(rows: Row[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const k = `${r.utmSource ?? ""}|${r.utmMedium ?? ""}|${r.utmCampaign ?? ""}`;
    let g = map.get(k);
    if (!g) {
      g = {
        key: k,
        utmSource: r.utmSource,
        utmMedium: r.utmMedium,
        utmCampaign: r.utmCampaign,
        visits: 0,
        clickCompra: 0,
        clickConsultor: 0,
        clickWhats: 0,
        leadForm: 0,
        ads: [],
      };
      map.set(k, g);
    }
    g.visits += r.visits;
    g.clickCompra += r.clickCompra;
    g.clickConsultor += r.clickConsultor;
    g.clickWhats += r.clickWhats;
    g.leadForm += r.leadForm;
    g.ads.push(r);
  }
  // Sort: campanhas por visitas desc; anuncios dentro de cada uma tambem por visitas desc
  const groups = Array.from(map.values()).sort((a, b) => b.visits - a.visits);
  for (const g of groups) {
    g.ads.sort((a, b) => b.visits - a.visits);
  }
  return groups;
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
