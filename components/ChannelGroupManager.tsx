"use client";

/**
 * ChannelGroupManager — CRUD dos grupos de canal (Orgânico/Meta/Google/...).
 * Regra global: classifica o tráfego por utm_source/utm_medium. Inclui um
 * testador rápido (digita source/medium → mostra o grupo que cairia).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { classifyChannel, type ChannelRule } from "@/lib/channel-groups";

export type GroupItem = {
  id: string;
  name: string;
  ordem: number;
  color: string | null;
  sources: string[];
  mediums: string[];
  matchEmptySource: boolean;
};

const inputCls =
  "w-full rounded-md border border-white/15 bg-black/20 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:border-blue-400";

export function ChannelGroupManager({ initial }: { initial: GroupItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [testSrc, setTestSrc] = useState("");
  const [testMed, setTestMed] = useState("");

  const rules: ChannelRule[] = initial.map((g) => ({
    name: g.name,
    color: g.color,
    ordem: g.ordem,
    sources: g.sources,
    mediums: g.mediums,
    matchEmptySource: g.matchEmptySource,
  }));
  const testResult = classifyChannel(testSrc, testMed, rules);

  async function save(id: string, patch: Partial<GroupItem>) {
    setBusy(true);
    try {
      await fetch(`/api/admin/channel-groups/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remover o grupo "${name}"?`)) return;
    await fetch(`/api/admin/channel-groups/${id}`, { method: "DELETE" });
    router.refresh();
  }

  async function add() {
    const name = prompt("Nome do novo grupo (ex: TikTok):")?.trim();
    if (!name) return;
    await fetch("/api/admin/channel-groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, ordem: initial.length + 1, sources: [], mediums: [] }),
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Testador */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide opacity-70">Testar classificação</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            utm_source
            <input className={inputCls} value={testSrc} onChange={(e) => setTestSrc(e.target.value)} placeholder="ex: meta" />
          </label>
          <label className="text-xs">
            utm_medium
            <input className={inputCls} value={testMed} onChange={(e) => setTestMed(e.target.value)} placeholder="ex: paid_social" />
          </label>
          <div className="text-sm">
            → cai em{" "}
            <span className="rounded-full px-2 py-0.5 text-xs font-semibold" style={{ background: (testResult.color ?? "#6B7280") + "33", color: testResult.color ?? "#9CA3AF" }}>
              {testResult.name}
            </span>
          </div>
        </div>
      </div>

      {/* Lista de grupos */}
      <div className="flex flex-col gap-3">
        {initial.map((g) => (
          <div key={g.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <span className="h-3 w-3 rounded-full" style={{ background: g.color ?? "#6B7280" }} />
              <input
                defaultValue={g.name}
                onBlur={(e) => e.target.value.trim() !== g.name && save(g.id, { name: e.target.value.trim() })}
                className="rounded-md border border-white/15 bg-black/20 px-2 py-1 text-sm font-semibold w-40"
              />
              <label className="text-xs opacity-60">
                ordem
                <input
                  type="number"
                  defaultValue={g.ordem}
                  onBlur={(e) => Number(e.target.value) !== g.ordem && save(g.id, { ordem: Number(e.target.value) })}
                  className="ml-1 w-16 rounded-md border border-white/15 bg-black/20 px-2 py-1 text-sm"
                />
              </label>
              <label className="text-xs opacity-60">
                cor
                <input
                  defaultValue={g.color ?? ""}
                  onBlur={(e) => e.target.value !== (g.color ?? "") && save(g.id, { color: e.target.value || null })}
                  className="ml-1 w-24 rounded-md border border-white/15 bg-black/20 px-2 py-1 text-sm"
                  placeholder="#1877F2"
                />
              </label>
              <label className="ml-auto flex items-center gap-1 text-xs opacity-80">
                <input
                  type="checkbox"
                  defaultChecked={g.matchEmptySource}
                  onChange={(e) => save(g.id, { matchEmptySource: e.target.checked })}
                />
                captura sem utm_source (direto)
              </label>
              <button onClick={() => remove(g.id, g.name)} className="text-xs text-red-400 hover:underline">
                remover
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-xs">
                utm_source (separados por vírgula)
                <input
                  defaultValue={g.sources.join(", ")}
                  onBlur={(e) => save(g.id, { sources: e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) })}
                  className={inputCls}
                  placeholder="meta, facebook, instagram"
                />
              </label>
              <label className="text-xs">
                utm_medium (separados por vírgula)
                <input
                  defaultValue={g.mediums.join(", ")}
                  onBlur={(e) => save(g.id, { mediums: e.target.value.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) })}
                  className={inputCls}
                  placeholder="paid_social, cpc"
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={add} disabled={busy} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50">
          + Novo grupo
        </button>
        <span className="text-xs opacity-50">Os grupos são avaliados por “ordem” (menor primeiro). O que não casar com nenhum cai em “Outros”.</span>
      </div>
    </div>
  );
}
