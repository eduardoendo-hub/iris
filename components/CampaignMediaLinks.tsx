"use client";

/**
 * CampaignMediaLinks — seção "Mídia paga (Meta + Google)" dentro da tela de
 * uma campanha da IRIS. Lista as campanhas de mídia atreladas e permite
 * vincular novas via o picker (puxa da conta). O Gestor de Tráfego agrupa
 * por estas campanhas (campaignId).
 */
import { useEffect, useState, useCallback } from "react";

type Linked = {
  id: string;
  platform: string;
  accountId: string;
  externalId: string | null;
  label: string;
  utmCampaign: string | null;
  targetCpl: number | null;
  active: boolean;
};

type PickerCampaign = { id: string; name: string; status: string };
type PickerSide = { accountId: string; campaigns: PickerCampaign[]; error?: string };
type PickerData = { meta: PickerSide; google: PickerSide };

export function CampaignMediaLinks({ campaignId, goalCpl }: { campaignId: string; goalCpl: number | null }) {
  const [linked, setLinked] = useState<Linked[]>([]);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState<PickerData | null>(null);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerErr, setPickerErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/admin/tracked-campaigns?campaignId=${campaignId}`);
    const data = await res.json();
    setLinked(
      (data.items ?? []).map((i: Record<string, unknown>) => ({
        id: i.id as string,
        platform: i.platform as string,
        accountId: i.accountId as string,
        externalId: (i.externalId as string) ?? null,
        label: i.label as string,
        utmCampaign: (i.utmCampaign as string) ?? null,
        targetCpl: i.targetCpl != null ? Number(i.targetCpl) : null,
        active: i.active as boolean,
      })),
    );
    setLoading(false);
  }, [campaignId]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function loadPicker() {
    setPickerBusy(true);
    setPickerErr(null);
    try {
      const res = await fetch("/api/admin/ad-campaigns");
      const data = await res.json();
      if (!res.ok) {
        setPickerErr(data.error || res.statusText);
        return;
      }
      setPicker(data as PickerData);
    } catch (e) {
      setPickerErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPickerBusy(false);
    }
  }

  const linkedIds = new Set(linked.map((l) => l.externalId));

  async function link(platform: "META" | "GOOGLE", accountId: string, c: PickerCampaign) {
    await fetch("/api/admin/tracked-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, accountId, externalId: c.id, label: c.name.slice(0, 120), campaignId, productSlug: "" }),
    });
    await reload();
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch(`/api/admin/tracked-campaigns/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await reload();
  }

  async function unlink(id: string) {
    if (!confirm("Desvincular esta campanha de mídia?")) return;
    await fetch(`/api/admin/tracked-campaigns/${id}`, { method: "DELETE" });
    await reload();
  }

  return (
    <section
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{ background: "var(--cockpit-card)", border: "1px solid var(--cockpit-border)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: "var(--fg1)" }}>Mídia paga (Meta + Google)</h2>
          <p style={{ fontSize: 12, color: "var(--fg2)" }}>
            Campanhas de Meta/Google atreladas a esta campanha. O Gestor de Tráfego analisa estas e usa o
            CPL meta {goalCpl != null ? `(R$ ${goalCpl})` : "(defina goalCpl acima)"} como referência.
          </p>
        </div>
        <button
          onClick={loadPicker}
          disabled={pickerBusy}
          className="rounded-md px-3 py-1.5 text-xs font-semibold"
          style={{ background: "var(--cockpit-card)", border: "1px solid var(--cockpit-border-strong)", color: "var(--fg1)" }}
        >
          {pickerBusy ? "Buscando…" : picker ? "Atualizar lista" : "+ Vincular campanha (puxar da conta)"}
        </button>
      </div>

      {/* Linked list */}
      {loading ? (
        <p style={{ fontSize: 12, color: "var(--fg2)" }}>carregando…</p>
      ) : linked.length === 0 ? (
        <p style={{ fontSize: 12, color: "var(--fg2)" }}>Nenhuma campanha de mídia vinculada ainda.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {linked.map((l) => (
            <div
              key={l.id}
              className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: "var(--cockpit-bg)", border: "1px solid var(--cockpit-border)" }}
            >
              <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold" style={{ background: "var(--cockpit-card)", color: "var(--fg2)" }}>
                {l.platform === "META" ? "Meta" : "Google"}
              </span>
              <span className="flex-1 truncate text-sm" style={{ color: "var(--fg1)" }} title={l.externalId ?? ""}>
                {l.label}
              </span>
              <input
                defaultValue={l.utmCampaign ?? ""}
                placeholder="utm_campaign (opcional)"
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v !== (l.utmCampaign ?? "")) patch(l.id, { utmCampaign: v || null });
                }}
                className="w-44 rounded border bg-transparent px-2 py-1 text-xs"
                style={{ borderColor: "var(--cockpit-border)", color: "var(--fg1)" }}
              />
              <button
                onClick={() => patch(l.id, { active: !l.active })}
                className="rounded-full px-2 py-0.5 text-[11px] font-semibold"
                style={{ background: "var(--cockpit-card)", color: l.active ? "var(--brand)" : "var(--fg2)" }}
              >
                {l.active ? "ativa" : "pausada"}
              </button>
              <button onClick={() => unlink(l.id)} className="text-[11px]" style={{ color: "var(--danger, #ff6b6b)" }}>
                desvincular
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Picker */}
      {pickerErr && <p style={{ fontSize: 12, color: "var(--danger, #ff6b6b)" }}>Erro: {pickerErr}</p>}
      {picker && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {(["META", "GOOGLE"] as const).map((plat) => {
            const side = plat === "META" ? picker.meta : picker.google;
            const active = side.campaigns.filter((c) => c.status === "ENABLED" || c.status === "ACTIVE");
            const others = side.campaigns.filter((c) => !(c.status === "ENABLED" || c.status === "ACTIVE"));
            const ordered = [...active, ...others];
            return (
              <div key={plat} className="rounded-lg p-3" style={{ background: "var(--cockpit-bg)", border: "1px solid var(--cockpit-border)" }}>
                <div className="mb-2 flex items-center justify-between">
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--fg1)" }}>{plat === "META" ? "Meta" : "Google"}</span>
                  <span style={{ fontSize: 11, color: "var(--fg2)" }}>{side.accountId || "—"}</span>
                </div>
                {side.error ? (
                  <p style={{ fontSize: 11, color: "var(--danger, #ff6b6b)" }}>
                    {side.error.startsWith("missing_") ? "credenciais não configuradas no env" : side.error}
                  </p>
                ) : ordered.length === 0 ? (
                  <p style={{ fontSize: 11, color: "var(--fg2)" }}>nenhuma campanha</p>
                ) : (
                  <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
                    {ordered.map((c) => {
                      const isActive = c.status === "ENABLED" || c.status === "ACTIVE";
                      const already = linkedIds.has(c.id);
                      return (
                        <li key={c.id} className="flex items-center gap-2 rounded px-1.5 py-1">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: isActive ? "var(--brand)" : "var(--fg3, #888)" }} title={c.status} />
                          <span className="flex-1 truncate text-xs" style={{ color: "var(--fg1)" }} title={c.name}>
                            {c.name}
                          </span>
                          {already ? (
                            <span style={{ fontSize: 11, color: "var(--fg2)" }}>vinculada ✓</span>
                          ) : (
                            <button
                              onClick={() => link(plat, side.accountId, c)}
                              className="shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold"
                              style={{ background: "var(--brand)", color: "var(--fg-on-brand)" }}
                            >
                              vincular
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
