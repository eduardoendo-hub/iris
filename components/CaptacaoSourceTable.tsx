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

export function CaptacaoSourceTable({ rows, days }: { rows: Row[]; days: number }) {
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

  const macroLeaks = rows.filter((r) =>
    [r.utmContent, r.utmCampaign].some((v) => v && /^\{\{.+\}\}$/.test(v))
  ).length;

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
              <th className="text-left px-5 py-2" style={{ width: 28 }}></th>
              <th className="text-left px-5 py-2">Canal</th>
              <th className="text-left px-5 py-2">Campanha / Anúncio</th>
              <th className="text-right px-5 py-2">Anúncios</th>
              <th className="text-right px-5 py-2">Visitas</th>
              <th className="text-right px-5 py-2">Compra</th>
              <th className="text-right px-5 py-2">Consultor</th>
              <th className="text-right px-5 py-2">WhatsApp</th>
              <th className="text-right px-5 py-2">Conv %</th>
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
                  const isMacroLeak = !!(
                    (ad.utmContent && /^\{\{.+\}\}$/.test(ad.utmContent)) ||
                    (ad.utmCampaign && /^\{\{.+\}\}$/.test(ad.utmCampaign))
                  );
                  return (
                    <tr
                      key={`g-${rowKey}-ad-${i}`}
                      style={{
                        borderTop: "1px dashed var(--cockpit-border)",
                        fontSize: 12,
                        background: isMacroLeak
                          ? "rgba(247,201,72,0.06)"
                          : "rgba(10,186,181,0.02)",
                      }}
                    >
                      <td className="px-5 py-2"></td>
                      <td className="px-5 py-2" style={{ color: "var(--fg2)" }}>
                        └
                      </td>
                      <td
                        className="px-5 py-2"
                        style={{
                          color: isMacroLeak ? "var(--tn-gold)" : "var(--fg1)",
                          fontFamily: "var(--font-mono)",
                          fontSize: 11,
                          maxWidth: 320,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          paddingLeft: 28,
                        }}
                        title={ad.utmContent || ""}
                      >
                        {ad.utmContent || (
                          <span style={{ color: "var(--fg2)" }}>(sem utm_content)</span>
                        )}
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
