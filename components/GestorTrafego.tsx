"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type RecItem = {
  id: string;
  scope: string;
  platform: string | null;
  campaignRef: string | null;
  entityRef: string | null;
  priority: string;
  category: string;
  problem: string;
  action: string;
  expectedImpact: string | null;
  evidence: Record<string, unknown> | null;
  status: string;
};

export type ChildRow = {
  platform: string;
  label: string;
  campaignName: string | null;
  spend7d: number;
  spendMTD: number;
  impressions7d: number;
  clicks7d: number;
  ctr7d: number;
  cpc7d: number;
  daysWithData: number;
};

export type IrisRow = {
  name: string;
  productSlug: string;
  status: string;
  goalCpl: number | null;
  spend7d: number;
  spendMTD: number;
  visits7d: number;
  leads7d: number;
  cpl7d: number | null;
  cplVsGoalPct: number | null;
  visitsMTD: number;
  leadsMTD: number;
  cplMTD: number | null;
  children: ChildRow[];
};

const fmtBRL = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat("pt-BR").format(Math.round(n));

const PRIO_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const PRIO_STYLE: Record<string, string> = {
  CRITICAL: "bg-red-500/15 text-red-400 border-red-500/30",
  HIGH: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  MEDIUM: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30",
  LOW: "bg-white/10 text-white/60 border-white/15",
};
const PRIO_LABEL: Record<string, string> = { CRITICAL: "Crítico", HIGH: "Alto", MEDIUM: "Médio", LOW: "Baixo" };

type ApplySpec =
  | { type: "ADD_NEGATIVES"; campaignId: string; negatives: Array<{ text: string; matchType: string }> }
  | { type: "LINK_LIST"; campaignId: string; listName: string };

/** Extrai a ação executável da recomendação (evidence.apply), se houver. */
function applySpec(r: RecItem): ApplySpec | null {
  const ap = (r.evidence as { apply?: ApplySpec } | null)?.apply;
  return ap && (ap.type === "ADD_NEGATIVES" || ap.type === "LINK_LIST") ? ap : null;
}

function applyLabel(r: RecItem): string {
  const ap = applySpec(r);
  if (!ap) return "Aplicar";
  if (ap.type === "ADD_NEGATIVES") {
    const terms = ap.negatives.map((n) => `"${n.text}" [${n.matchType}]`).join(", ");
    return `Negativar ${ap.negatives.length} termo(s): ${terms}`;
  }
  return `Vincular lista "${ap.listName}"`;
}

/** Uma recomendação pertence à campanha IRIS selecionada? (PORTFOLIO sempre; senão casa por nome). */
function recMatchesCampaign(r: RecItem, ic: IrisRow): boolean {
  if (r.scope === "PORTFOLIO") return true;
  const ref = (r.campaignRef ?? "").toLowerCase().trim();
  if (!ref) return false;
  const name = ic.name.toLowerCase();
  if (ref.includes(name) || name.includes(ref)) return true;
  return ic.children.some((ch) => {
    const l = ch.label.toLowerCase();
    return l.length > 2 && (ref.includes(l) || l.includes(ref));
  });
}

export function GestorTrafego({
  analysisDate,
  recommendations,
  carteira,
  notes,
  totals,
}: {
  analysisDate: string | null;
  recommendations: RecItem[];
  carteira: IrisRow[];
  notes: string[];
  totals: { irisCampaigns: number; platformCampaigns: number; spend7d: number; spendMTD: number; leads7d: number; leadsMTD: number; blendedCpl: number | null };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>("all");
  const [applying, setApplying] = useState<string | null>(null);

  async function runNow() {
    setBusy(true);
    setMsg("Analisando a carteira… (pode levar até 1 min)");
    try {
      const res = await fetch("/api/admin/gestor-trafego/run", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        setMsg("Erro: " + (data.recs?.reason || data.error || res.statusText));
        return;
      }
      const ig = data.ingest;
      const side = (x: unknown) => {
        const s = x as { campaignsMatched?: number; samplesUpserted?: number; skipped?: boolean; skipReason?: string; error?: string } | undefined;
        if (!s) return "—";
        if (s.error) return `erro: ${s.error}`;
        if (s.skipped) return `skip (${s.skipReason})`;
        return `${s.campaignsMatched ?? 0} camp · ${s.samplesUpserted ?? 0} amostras`;
      };
      const ingestMsg = ig ? ` | Ingestão → Meta: ${side(ig.meta)} · Google: ${side(ig.google)}` : "";
      setMsg(`Análise atualizada: ${data.recs?.count ?? 0} recomendações.${ingestMsg}`);
      router.refresh();
    } catch (e) {
      setMsg("Erro: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(id: string, status: "DONE" | "DISMISSED" | "OPEN") {
    await fetch(`/api/admin/recommendations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  async function applyRec(r: RecItem) {
    const ap = applySpec(r);
    if (!ap) return;
    if (!confirm(`Aplicar no Google Ads agora?\n\n${applyLabel(r)}\n\nIsso escreve na conta real (reversível).`)) return;
    setApplying(r.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/recommendations/${r.id}/apply`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        setMsg("Erro ao aplicar: " + (data.message || data.error || res.statusText));
        return;
      }
      setMsg(`✓ Aplicado: ${applyLabel(r)}`);
      router.refresh();
    } catch (e) {
      setMsg("Erro ao aplicar: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setApplying(null);
    }
  }

  const selectedIc = selected === "all" ? null : carteira.find((c) => c.name === selected) ?? null;
  const shownCarteira = selectedIc ? [selectedIc] : carteira;
  const openAll = recommendations
    .filter((r) => r.status === "OPEN")
    .sort((a, b) => (PRIO_ORDER[a.priority] ?? 9) - (PRIO_ORDER[b.priority] ?? 9));
  const open = selectedIc ? openAll.filter((r) => recMatchesCampaign(r, selectedIc)) : openAll;
  const handled = recommendations.filter((r) => r.status !== "OPEN");

  return (
    <div className="flex flex-col gap-8">
      {/* Header / ação */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gestor de Tráfego</h1>
          <p className="text-sm opacity-60">
            {analysisDate ? `Análise de ${analysisDate}` : "Nenhuma análise ainda"} · {totals.irisCampaigns} campanhas IRIS ({totals.platformCampaigns} de mídia) ·
            spend 7d {fmtBRL(totals.spend7d)} · <span className="opacity-90">spend mês {fmtBRL(totals.spendMTD)}</span> · {fmtNum(totals.leads7d)} leads (7d) ·
            CPL {totals.blendedCpl != null ? fmtBRL(totals.blendedCpl) : "—"}
          </p>
        </div>
        <button
          onClick={runNow}
          disabled={busy}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? "Analisando…" : "Atualizar análise"}
        </button>
      </div>
      {msg && <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm opacity-80">{msg}</div>}

      {/* Seletor de campanha */}
      {carteira.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs uppercase tracking-wide opacity-50">Campanha:</label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded-md border border-white/15 bg-black/20 px-3 py-1.5 text-sm text-white outline-none focus:border-blue-400"
          >
            <option value="all">Todas as campanhas</option>
            {carteira.map((c, i) => (
              <option key={i} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* DADOS (em cima) — Carteira por campanha da IRIS */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-70">Carteira (por campanha da IRIS)</h2>
        {shownCarteira.length === 0 ? (
          <p className="text-sm opacity-60">
            Nenhuma campanha IRIS ativa com mídia vinculada. Vincule as campanhas de Meta/Google na tela de cada campanha.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {shownCarteira.map((ic, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-white/10">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 bg-white/[0.03] px-3 py-2">
                  <span className="font-semibold">{ic.name}</span>
                  <span className="text-xs opacity-50">{ic.productSlug} · {ic.status}</span>
                  <div className="ml-auto flex flex-col items-end gap-0.5 text-xs">
                    <div className="opacity-85">
                      <span className="opacity-50">7d:</span> spend {fmtBRL(ic.spend7d)} · {fmtNum(ic.visits7d)} vis · {fmtNum(ic.leads7d)} leads · CPL{" "}
                      {ic.cpl7d != null ? (
                        <span className={ic.goalCpl != null && ic.cpl7d > ic.goalCpl ? "text-orange-300" : "text-green-400"}>{fmtBRL(ic.cpl7d)}</span>
                      ) : (
                        <span className="opacity-40">{ic.leads7d === 0 ? "0 lead" : "—"}</span>
                      )}
                      {ic.goalCpl != null && <span className="opacity-40"> / {fmtBRL(ic.goalCpl)}</span>}
                      {ic.cplVsGoalPct != null && (
                        <span className={ic.cplVsGoalPct > 0 ? "text-orange-300" : "text-green-400"}> ({ic.cplVsGoalPct >= 0 ? "+" : ""}{ic.cplVsGoalPct.toFixed(0)}%)</span>
                      )}
                    </div>
                    <div className="opacity-70">
                      <span className="opacity-50">mês:</span> spend {fmtBRL(ic.spendMTD)} · {fmtNum(ic.visitsMTD)} vis · {fmtNum(ic.leadsMTD)} leads · CPL{" "}
                      {ic.cplMTD != null ? (
                        <span className={ic.goalCpl != null && ic.cplMTD > ic.goalCpl ? "text-orange-300" : "text-green-400"}>{fmtBRL(ic.cplMTD)}</span>
                      ) : (
                        <span className="opacity-40">{ic.leadsMTD === 0 ? "0 lead" : "—"}</span>
                      )}
                    </div>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase opacity-40">
                    <tr>
                      <th className="px-3 py-1.5">Mídia</th>
                      <th className="px-3 py-1.5">Plat.</th>
                      <th className="px-3 py-1.5">Spend 7d</th>
                      <th className="px-3 py-1.5">Spend mês</th>
                      <th className="px-3 py-1.5">Impr</th>
                      <th className="px-3 py-1.5">Cliq</th>
                      <th className="px-3 py-1.5">CTR</th>
                      <th className="px-3 py-1.5">CPC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ic.children.map((c, j) => (
                      <tr key={j} className="border-t border-white/5">
                        <td className="px-3 py-1.5">
                          {c.label}
                          {c.daysWithData === 0 && <span className="ml-1 text-[11px] text-yellow-400/70">(sem dados)</span>}
                        </td>
                        <td className="px-3 py-1.5 opacity-70">{c.platform === "META" ? "Meta" : "Google"}</td>
                        <td className="px-3 py-1.5">{fmtBRL(c.spend7d)}</td>
                        <td className="px-3 py-1.5 opacity-70">{fmtBRL(c.spendMTD)}</td>
                        <td className="px-3 py-1.5 opacity-70">{fmtNum(c.impressions7d)}</td>
                        <td className="px-3 py-1.5 opacity-70">{fmtNum(c.clicks7d)}</td>
                        <td className="px-3 py-1.5 opacity-70">{c.ctr7d.toFixed(2)}%</td>
                        <td className="px-3 py-1.5 opacity-70">{fmtBRL(c.cpc7d)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* DIAGNÓSTICO (embaixo) */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-70">
          🎯 O que fazer hoje ({open.length}){selectedIc ? ` · ${selectedIc.name}` : ""}
        </h2>
        {open.length === 0 ? (
          <p className="text-sm opacity-60">
            Nenhuma recomendação aberta. Clique em “Atualizar análise” pra gerar (precisa de campanhas cadastradas e com dados).
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {open.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={"rounded-full border px-2 py-0.5 text-xs font-semibold " + (PRIO_STYLE[r.priority] ?? PRIO_STYLE.LOW)}>
                    {PRIO_LABEL[r.priority] ?? r.priority}
                  </span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-medium opacity-80">{r.category}</span>
                  {r.platform && <span className="text-xs opacity-60">{r.platform === "META" ? "Meta" : "Google"}</span>}
                  {r.campaignRef && <span className="text-xs opacity-60">· {r.campaignRef}</span>}
                </div>
                <p className="mb-1 text-sm opacity-80">{r.problem}</p>
                <p className="text-sm font-medium">→ {r.action}</p>
                {r.expectedImpact && <p className="mt-1 text-xs text-green-400/90">Impacto: {r.expectedImpact}</p>}
                {typeof (r.evidence as { nota?: string } | null)?.nota === "string" && (
                  <div className="mt-2">
                    <span className="rounded bg-black/30 px-1.5 py-0.5 text-[11px] opacity-60">
                      {(r.evidence as { nota?: string }).nota}
                    </span>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {applySpec(r) && (
                    <button
                      onClick={() => applyRec(r)}
                      disabled={applying === r.id}
                      className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      title={applyLabel(r)}
                    >
                      {applying === r.id ? "Aplicando…" : "⚡ Aplicar"}
                    </button>
                  )}
                  <button onClick={() => setStatus(r.id, "DONE")} className="text-xs font-semibold text-green-400 hover:underline">
                    ✓ feito
                  </button>
                  <button onClick={() => setStatus(r.id, "DISMISSED")} className="text-xs text-white/50 hover:underline">
                    ignorar
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {handled.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs opacity-50">Resolvidas/ignoradas ({handled.length})</summary>
            <div className="mt-2 flex flex-col gap-1">
              {handled.map((r) => (
                <div key={r.id} className="flex items-center gap-2 text-xs opacity-50">
                  <span>{r.status === "DONE" ? "✓" : "✗"}</span>
                  <span className="line-through">{r.action}</span>
                  <button onClick={() => setStatus(r.id, "OPEN")} className="ml-auto hover:underline">reabrir</button>
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

      {notes.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide opacity-50">A cadastrar / dados faltando</h2>
          <ul className="list-disc pl-5 text-xs opacity-60">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
