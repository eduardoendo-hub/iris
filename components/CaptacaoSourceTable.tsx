"use client";

/**
 * CaptacaoSourceTable — visitas e cliques por CANAL DE NEGÓCIO (Orgânico, Meta,
 * Google, Mailing, Portal…), com drill-down: grupo → campanha → anúncio.
 *
 * - Nível 1 (default): 1 linha por grupo de canal (regra global, /admin/channel-groups).
 * - Nível 2 (expande o grupo): 1 linha por campanha (utm_campaign).
 * - Nível 3 (expande a campanha): 1 linha por anúncio (utm_content/term).
 */
import { useMemo, useState } from "react";
import { classifyChannel, type ChannelRule } from "@/lib/channel-groups";

type Row = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
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

type ChannelBlock = {
  name: string;
  color: string | null;
  visits: number;
  clickCompra: number;
  clickConsultor: number;
  clickWhats: number;
  adsCount: number;
  campaigns: Group[];
};

export function CaptacaoSourceTable({
  rows,
  periodLabel = "toda a campanha",
  channelRules,
}: {
  rows: Row[];
  periodLabel?: string;
  channelRules: ChannelRule[];
}) {
  const blocks = useMemo(() => buildChannelBlocks(rows, channelRules), [rows, channelRules]);
  const [openChannels, setOpenChannels] = useState<Set<string>>(new Set());
  const [openCampaigns, setOpenCampaigns] = useState<Set<string>>(new Set());

  const totals = rows.reduce(
    (acc, r) => {
      acc.visits += r.visits;
      acc.clickCompra += r.clickCompra;
      return acc;
    },
    { visits: 0, clickCompra: 0 },
  );

  function toggleChannel(k: string) {
    setOpenChannels((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }
  function toggleCampaign(k: string) {
    setOpenCampaigns((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--cockpit-card)", border: "1px solid var(--cockpit-border)" }}>
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--cockpit-border)" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--fg1)" }}>Por canal — {periodLabel}</h3>
        <span style={{ fontSize: 11, color: "var(--fg2)", fontFamily: "var(--font-mono)" }}>
          {fmtNum(totals.visits)} visitas · {fmtNum(totals.clickCompra)} cliques compra
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", color: "var(--brand-soft)", fontWeight: 700, opacity: 0.95 }}>
              <th className="text-left px-5 py-2" style={{ width: 28 }}></th>
              <th className="text-left px-5 py-2">Canal</th>
              <th className="text-left px-5 py-2">Campanha / Anúncio</th>
              <th className="text-right px-5 py-2">Anúncios</th>
              <th className="text-right px-5 py-2" title="Total de lp_view enviados pela LP">Visitas</th>
              <th className="text-right px-5 py-2" title="Cliques no botão de compra — INTENT, não venda confirmada">Cliques compra</th>
              <th className="text-right px-5 py-2">Consultor</th>
              <th className="text-right px-5 py-2">WhatsApp</th>
              <th className="text-right px-5 py-2" title="Cliques compra / visitas">Conv %</th>
            </tr>
          </thead>
          <tbody>
            {blocks.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center px-5 py-6" style={{ color: "var(--fg2)" }}>
                  Sem visitas registradas no período.
                </td>
              </tr>
            ) : (
              blocks.flatMap((b) => {
                const chOpen = openChannels.has(b.name);
                const conv = b.visits > 0 ? (b.clickCompra / b.visits) * 100 : 0;
                const out: React.ReactNode[] = [];

                // Nível 1 — grupo de canal
                out.push(
                  <tr
                    key={`ch-${b.name}`}
                    onClick={() => toggleChannel(b.name)}
                    style={{ borderTop: "1px solid var(--cockpit-border)", fontSize: 13, cursor: "pointer", background: chOpen ? "rgba(10,186,181,0.04)" : undefined }}
                  >
                    <td className="px-5 py-3" style={{ color: "var(--fg2)" }}>{chOpen ? "▼" : "▶"}</td>
                    <td className="px-5 py-3">
                      <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: (b.color ?? "#6B7280") + "26", color: b.color ?? "#9CA3AF" }}>
                        {b.name}
                      </span>
                    </td>
                    <td className="px-5 py-3" style={{ color: "var(--fg2)", fontSize: 12 }}>
                      {b.campaigns.length} campanha{b.campaigns.length === 1 ? "" : "s"}
                    </td>
                    <td className="px-5 py-3 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--fg2)", fontSize: 12 }}>{b.adsCount}</td>
                    <td className="px-5 py-3 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)", fontWeight: 700 }}>{fmtNum(b.visits)}</td>
                    <td className="px-5 py-3 text-right" style={{ fontFamily: "var(--font-mono)", color: b.clickCompra > 0 ? "var(--brand)" : "var(--fg2)", fontWeight: b.clickCompra > 0 ? 700 : 400 }}>{fmtNum(b.clickCompra)}</td>
                    <td className="px-5 py-3 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}>{fmtNum(b.clickConsultor)}</td>
                    <td className="px-5 py-3 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}>{fmtNum(b.clickWhats)}</td>
                    <td className="px-5 py-3 text-right" style={{ fontFamily: "var(--font-mono)", color: conv > 0 ? "var(--brand)" : "var(--fg2)", fontWeight: conv > 0 ? 600 : 400 }}>{b.visits > 0 ? `${conv.toFixed(1)}%` : "—"}</td>
                  </tr>,
                );

                if (!chOpen) return out;

                // Nível 2 — campanhas do grupo
                for (const g of b.campaigns) {
                  const cOpen = openCampaigns.has(g.key);
                  const expandable = g.ads.length > 1;
                  const cConv = g.visits > 0 ? (g.clickCompra / g.visits) * 100 : 0;
                  out.push(
                    <tr
                      key={`cmp-${g.key}`}
                      onClick={expandable ? () => toggleCampaign(g.key) : undefined}
                      style={{ borderTop: "1px dashed var(--cockpit-border)", fontSize: 12.5, cursor: expandable ? "pointer" : "default", background: "rgba(255,255,255,0.015)" }}
                    >
                      <td className="px-5 py-2" style={{ color: "var(--fg2)", paddingLeft: 28 }}>{expandable ? (cOpen ? "▾" : "▸") : ""}</td>
                      <td className="px-5 py-2" style={{ color: "var(--fg2)", fontSize: 11 }}>{formatChannel(g.utmSource, g.utmMedium)}</td>
                      <td className="px-5 py-2" style={{ color: "var(--fg1)", fontFamily: "var(--font-mono)", fontSize: 11.5, fontWeight: 600 }}>
                        {g.utmCampaign || <span style={{ color: "var(--fg2)" }}>(sem campanha)</span>}
                      </td>
                      <td className="px-5 py-2 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--fg2)", fontSize: 11 }}>{g.ads.length}</td>
                      <td className="px-5 py-2 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)", fontWeight: 600 }}>{fmtNum(g.visits)}</td>
                      <td className="px-5 py-2 text-right" style={{ fontFamily: "var(--font-mono)", color: g.clickCompra > 0 ? "var(--brand)" : "var(--fg2)", fontWeight: g.clickCompra > 0 ? 700 : 400 }}>{fmtNum(g.clickCompra)}</td>
                      <td className="px-5 py-2 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}>{fmtNum(g.clickConsultor)}</td>
                      <td className="px-5 py-2 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}>{fmtNum(g.clickWhats)}</td>
                      <td className="px-5 py-2 text-right" style={{ fontFamily: "var(--font-mono)", color: cConv > 0 ? "var(--brand)" : "var(--fg2)" }}>{g.visits > 0 ? `${cConv.toFixed(1)}%` : "—"}</td>
                    </tr>,
                  );

                  // Nível 3 — anúncios da campanha
                  if (cOpen && expandable) {
                    for (let i = 0; i < g.ads.length; i++) {
                      out.push(adRow(g.ads[i], `ad-${g.key}-${i}`));
                    }
                  }
                }

                return out;
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function adRow(ad: Row, key: string): React.ReactNode {
  const adConv = ad.visits > 0 ? (ad.clickCompra / ad.visits) * 100 : 0;
  const isIdish = ad.utmContent && /^[\d_-]+$/.test(ad.utmContent);
  const primary = ad.utmTerm && isIdish ? ad.utmTerm : ad.utmContent || ad.utmTerm || null;
  const secondary = ad.utmTerm && isIdish ? ad.utmContent : ad.utmTerm && primary !== ad.utmTerm ? ad.utmTerm : null;
  return (
    <tr key={key} style={{ borderTop: "1px dotted var(--cockpit-border)", fontSize: 11.5, background: "rgba(10,186,181,0.02)" }}>
      <td className="px-5 py-2"></td>
      <td className="px-5 py-2" style={{ color: "var(--fg2)", paddingLeft: 40 }}>└</td>
      <td className="px-5 py-2" style={{ maxWidth: 360, overflow: "hidden", paddingLeft: 28 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <div style={{ color: "var(--fg1)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
            {primary ?? <span style={{ color: "var(--fg2)" }}>(sem utm_content/term)</span>}
          </div>
          {secondary && (
            <div style={{ fontSize: 10, color: "var(--fg2)", fontFamily: "var(--font-mono)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>{secondary}</div>
          )}
        </div>
      </td>
      <td className="px-5 py-2"></td>
      <td className="px-5 py-2 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}>{fmtNum(ad.visits)}</td>
      <td className="px-5 py-2 text-right" style={{ fontFamily: "var(--font-mono)", color: ad.clickCompra > 0 ? "var(--brand)" : "var(--fg2)", fontWeight: ad.clickCompra > 0 ? 600 : 400 }}>{fmtNum(ad.clickCompra)}</td>
      <td className="px-5 py-2 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}>{fmtNum(ad.clickConsultor)}</td>
      <td className="px-5 py-2 text-right" style={{ fontFamily: "var(--font-mono)", color: "var(--fg1)" }}>{fmtNum(ad.clickWhats)}</td>
      <td className="px-5 py-2 text-right" style={{ fontFamily: "var(--font-mono)", color: adConv > 0 ? "var(--brand)" : "var(--fg2)" }}>{ad.visits > 0 ? `${adConv.toFixed(1)}%` : "—"}</td>
    </tr>
  );
}

function buildChannelBlocks(rows: Row[], rules: ChannelRule[]): ChannelBlock[] {
  const map = new Map<string, { name: string; color: string | null; rows: Row[] }>();
  for (const r of rows) {
    const c = classifyChannel(r.utmSource, r.utmMedium, rules);
    if (!map.has(c.name)) map.set(c.name, { name: c.name, color: c.color, rows: [] });
    map.get(c.name)!.rows.push(r);
  }
  const ordemOf = (name: string) => rules.find((x) => x.name === name)?.ordem ?? 999;
  return Array.from(map.values())
    .map((b) => {
      const campaigns = groupByCampaign(b.rows);
      const t = b.rows.reduce(
        (a, r) => ({ v: a.v + r.visits, cc: a.cc + r.clickCompra, co: a.co + r.clickConsultor, wa: a.wa + r.clickWhats }),
        { v: 0, cc: 0, co: 0, wa: 0 },
      );
      return { name: b.name, color: b.color, visits: t.v, clickCompra: t.cc, clickConsultor: t.co, clickWhats: t.wa, adsCount: b.rows.length, campaigns };
    })
    .sort((a, b) => ordemOf(a.name) - ordemOf(b.name) || b.visits - a.visits);
}

function groupByCampaign(rows: Row[]): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    const k = `${r.utmSource ?? ""}|${r.utmMedium ?? ""}|${r.utmCampaign ?? ""}`;
    let g = map.get(k);
    if (!g) {
      g = { key: k, utmSource: r.utmSource, utmMedium: r.utmMedium, utmCampaign: r.utmCampaign, visits: 0, clickCompra: 0, clickConsultor: 0, clickWhats: 0, leadForm: 0, ads: [] };
      map.set(k, g);
    }
    g.visits += r.visits;
    g.clickCompra += r.clickCompra;
    g.clickConsultor += r.clickConsultor;
    g.clickWhats += r.clickWhats;
    g.leadForm += r.leadForm;
    g.ads.push(r);
  }
  const groups = Array.from(map.values()).sort((a, b) => b.visits - a.visits);
  for (const g of groups) g.ads.sort((a, b) => b.visits - a.visits);
  return groups;
}

function formatChannel(source: string | null, medium: string | null): string {
  if (!source && !medium) return "Direto / orgânico";
  return `${source || "?"} / ${medium || "?"}`;
}

function fmtNum(n: number) {
  return new Intl.NumberFormat("pt-BR").format(n);
}
