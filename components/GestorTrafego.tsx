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
  visits7d: number;
  leads7d: number;
  cpl7d: number | null;
  cplVsGoalPct: number | null;
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
  totals: { irisCampaigns: number; platformCampaigns: number; spend7d: number; leads7d: number; blendedCpl: number | null };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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

  const open = recommendations
    .filter((r) => r.status === "OPEN")
    .sort((a, b) => (PRIO_ORDER[a.priority] ?? 9) - (PRIO_ORDER[b.priority] ?? 9));
  const handled = recommendations.filter((r) => r.status !== "OPEN");

  return (
    <div className="flex flex-col gap-8">
      {/* Header / ação */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Gestor de Tráfego</h1>
          <p className="text-sm opacity-60">
            {analysisDate ? `Análise de ${analysisDate}` : "Nenhuma análise ainda"} · {totals.irisCampaigns} campanhas IRIS ({totals.platformCampaigns} de mídia) ·
            spend 7d {fmtBRL(totals.spend7d)} · {fmtNum(totals.leads7d)} leads ·
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

      {/* O que fazer hoje */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-70">
          🎯 O que fazer hoje ({open.length})
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
                {r.evidence && Object.keys(r.evidence).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {Object.entries(r.evidence).map(([k, v]) => (
                      <span key={k} className="rounded bg-black/30 px-1.5 py-0.5 text-[11px] opacity-60">
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex gap-3">
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

      {/* Carteira — agrupada por campanha da IRIS */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide opacity-70">Carteira (por campanha da IRIS)</h2>
        {carteira.length === 0 ? (
          <p className="text-sm opacity-60">
            Nenhuma campanha IRIS ativa com mídia vinculada. Vincule as campanhas de Meta/Google na tela de cada campanha.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {carteira.map((ic, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-white/10">
                {/* Header da campanha IRIS */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 bg-white/[0.03] px-3 py-2">
                  <span className="font-semibold">{ic.name}</span>
                  <span className="text-xs opacity-50">{ic.productSlug} · {ic.status}</span>
                  <span className="ml-auto text-xs opacity-80">spend {fmtBRL(ic.spend7d)}</span>
                  <span className="text-xs opacity-80">{fmtNum(ic.visits7d)} visitas</span>
                  <span className="text-xs opacity-80">{fmtNum(ic.leads7d)} leads</span>
                  <span className="text-xs">
                    CPL{" "}
                    {ic.cpl7d != null ? (
                      <span className={ic.goalCpl != null && ic.cpl7d > ic.goalCpl ? "text-orange-300" : "text-green-400"}>{fmtBRL(ic.cpl7d)}</span>
                    ) : (
                      <span className="opacity-40">{ic.leads7d === 0 ? "0 lead" : "—"}</span>
                    )}
                    {ic.goalCpl != null && <span className="opacity-40"> / {fmtBRL(ic.goalCpl)}</span>}
                    {ic.cplVsGoalPct != null && (
                      <span className={ic.cplVsGoalPct > 0 ? "text-orange-300" : "text-green-400"}>
                        {" "}({ic.cplVsGoalPct >= 0 ? "+" : ""}{ic.cplVsGoalPct.toFixed(0)}%)
                      </span>
                    )}
                  </span>
                </div>
                {/* Mídia atrelada */}
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase opacity-40">
                    <tr>
                      <th className="px-3 py-1.5">Mídia</th>
                      <th className="px-3 py-1.5">Plat.</th>
                      <th className="px-3 py-1.5">Spend 7d</th>
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
