"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TrackedItem = {
  id: string;
  platform: string;
  accountId: string;
  externalId: string | null;
  nameFilter: string | null;
  productSlug: string | null;
  label: string;
  objective: string | null;
  targetCpl: number | null;
  targetRoas: number | null;
  active: boolean;
};

const empty = {
  platform: "META",
  accountId: "",
  externalId: "",
  nameFilter: "",
  productSlug: "",
  label: "",
  objective: "trafego",
  targetCpl: "",
  targetRoas: "",
};

export function TrackedCampaignManager({ initial }: { initial: TrackedItem[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ ...empty });
  const [busy, setBusy] = useState(false);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function add() {
    if (!form.accountId || !form.label) {
      alert("Preencha pelo menos: conta e nome amigável.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/tracked-campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        alert("Erro ao salvar: " + (await res.text()));
        return;
      }
      setForm({ ...empty, platform: form.platform });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, active: boolean) {
    await fetch(`/api/admin/tracked-campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !active }),
    });
    router.refresh();
  }

  async function remove(id: string) {
    if (!confirm("Remover esta campanha rastreada?")) return;
    await fetch(`/api/admin/tracked-campaigns/${id}`, { method: "DELETE" });
    router.refresh();
  }

  const inputCls =
    "w-full rounded-md border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-blue-400";

  return (
    <div className="flex flex-col gap-8">
      {/* Form */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide opacity-70">
          Adicionar campanha
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="text-xs">
            Plataforma
            <select
              className={inputCls}
              value={form.platform}
              onChange={(e) => set("platform", e.target.value)}
            >
              <option value="META">Meta</option>
              <option value="GOOGLE">Google</option>
            </select>
          </label>
          <label className="text-xs">
            Conta (account/customer id) *
            <input className={inputCls} value={form.accountId} onChange={(e) => set("accountId", e.target.value)} />
          </label>
          <label className="text-xs">
            Nome amigável *
            <input className={inputCls} value={form.label} onChange={(e) => set("label", e.target.value)} placeholder="ex: Hub Corporativo - Search" />
          </label>
          <label className="text-xs">
            ID da campanha (externalId)
            <input className={inputCls} value={form.externalId} onChange={(e) => set("externalId", e.target.value)} placeholder="opcional (atribuição precisa)" />
          </label>
          <label className="text-xs">
            Filtro por nome (alternativa ao ID)
            <input className={inputCls} value={form.nameFilter} onChange={(e) => set("nameFilter", e.target.value)} placeholder="ex: CORPORATIVO" />
          </label>
          <label className="text-xs">
            Produto IRIS (slug)
            <input className={inputCls} value={form.productSlug} onChange={(e) => set("productSlug", e.target.value)} placeholder="ex: corporativo" />
          </label>
          <label className="text-xs">
            Objetivo
            <input className={inputCls} value={form.objective} onChange={(e) => set("objective", e.target.value)} placeholder="trafego | conversao" />
          </label>
          <label className="text-xs">
            Meta de CPL (R$)
            <input className={inputCls} value={form.targetCpl} onChange={(e) => set("targetCpl", e.target.value)} placeholder="ex: 30" inputMode="decimal" />
          </label>
          <label className="text-xs">
            Meta de ROAS (×)
            <input className={inputCls} value={form.targetRoas} onChange={(e) => set("targetRoas", e.target.value)} placeholder="ex: 5" inputMode="decimal" />
          </label>
        </div>
        <button
          onClick={add}
          disabled={busy}
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? "Salvando…" : "Adicionar campanha"}
        </button>
      </div>

      {/* List */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide opacity-70">
          Rastreando ({initial.length})
        </h2>
        {initial.length === 0 ? (
          <p className="text-sm opacity-60">Nenhuma campanha rastreada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase opacity-50">
                <tr>
                  <th className="py-2 pr-3">Plat.</th>
                  <th className="py-2 pr-3">Nome</th>
                  <th className="py-2 pr-3">Conta / ID / Filtro</th>
                  <th className="py-2 pr-3">Produto</th>
                  <th className="py-2 pr-3">Meta CPL</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3"></th>
                </tr>
              </thead>
              <tbody>
                {initial.map((it) => (
                  <tr key={it.id} className="border-t border-white/5">
                    <td className="py-2 pr-3">{it.platform === "META" ? "Meta" : "Google"}</td>
                    <td className="py-2 pr-3 font-medium">{it.label}</td>
                    <td className="py-2 pr-3 opacity-70">
                      {it.accountId}
                      {it.externalId ? ` · ${it.externalId}` : ""}
                      {it.nameFilter ? ` · "${it.nameFilter}"` : ""}
                    </td>
                    <td className="py-2 pr-3 opacity-70">{it.productSlug ?? "—"}</td>
                    <td className="py-2 pr-3 opacity-70">{it.targetCpl != null ? `R$ ${it.targetCpl}` : "—"}</td>
                    <td className="py-2 pr-3">
                      <button
                        onClick={() => toggle(it.id, it.active)}
                        className={
                          "rounded-full px-2 py-0.5 text-xs font-semibold " +
                          (it.active ? "bg-green-500/15 text-green-400" : "bg-white/10 text-white/50")
                        }
                      >
                        {it.active ? "Ativa" : "Pausada"}
                      </button>
                    </td>
                    <td className="py-2 pr-3">
                      <button onClick={() => remove(it.id)} className="text-xs text-red-400 hover:underline">
                        remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
