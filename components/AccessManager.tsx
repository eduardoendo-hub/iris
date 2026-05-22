"use client";

/**
 * AccessManager — gerencia AllowedEmail (com campanhas linkadas) +
 * AllowedDomain.
 *
 * Para email: ao cadastrar, admin escolhe quais campanhas o user vê.
 * Vazio = vê todas (admin). Lista nao vazia = restrito. Edição inline.
 *
 * Para domínio: bypass total (vê todas). Sem opção de restringir.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type EmailEntry = {
  id: string;
  email: string;
  note: string | null;
  addedAt: string;
  campaignSlugs: string[];
};

type DomainEntry = {
  id: string;
  domain: string;
  note: string | null;
  addedAt: string;
};

type CampaignOption = {
  slug: string;
  name: string;
  productSlug: string;
  isActive: boolean;
};

export function AccessManager({
  initialEmails,
  initialDomains,
  allCampaigns,
}: {
  initialEmails: EmailEntry[];
  initialDomains: DomainEntry[];
  allCampaigns: CampaignOption[];
}) {
  const router = useRouter();
  const [type, setType] = useState<"email" | "domain">("email");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggleSlug(slug: string) {
    setSelectedSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }

  async function add() {
    setError(null);
    if (!value.trim()) return;
    const payload: Record<string, unknown> = {
      type,
      value: value.trim(),
      note: note.trim() || undefined,
    };
    if (type === "email") {
      payload.campaignSlugs = selectedSlugs;
    }
    const res = await fetch("/api/admin/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.message || json.error || "Falha ao adicionar");
      return;
    }
    setValue("");
    setNote("");
    setSelectedSlugs([]);
    startTransition(() => router.refresh());
  }

  async function remove(t: "email" | "domain", id: string) {
    if (!confirm(`Remover este ${t}?`)) return;
    const res = await fetch(`/api/admin/access?type=${t}&id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(`Erro: ${json.message || json.error || "falha"}`);
      return;
    }
    startTransition(() => router.refresh());
  }

  async function patchEmail(id: string, campaignSlugs: string[]) {
    const res = await fetch(`/api/admin/access/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignSlugs }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      alert(`Erro ao atualizar: ${json.message || json.error || "falha"}`);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Form de adicionar */}
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--cockpit-card)", border: "1px solid var(--cockpit-border)" }}
      >
        <h3
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "var(--ls-eyebrow)",
            color: "var(--brand-soft)",
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          Adicionar acesso
        </h3>
        {error && (
          <div
            className="rounded-md px-3 py-2 mb-3"
            style={{ background: "rgba(236,96,136,0.15)", color: "#EC6088", fontSize: 12 }}
          >
            {error}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 items-end">
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 600 }}>Tipo</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as "email" | "domain")}
              style={input}
            >
              <option value="email">Email individual</option>
              <option value="domain">Domínio inteiro</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 600 }}>
              {type === "email" ? "Email" : "Domínio"}
            </span>
            <input
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === "email" ? "usuario@gmail.com" : "impacta.com.br"}
              style={input}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 600 }}>Nota (opcional)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ex: SDR Ana"
              style={input}
            />
          </label>
        </div>

        {type === "email" && (
          <div className="mt-3">
            <CampaignPicker
              allCampaigns={allCampaigns}
              selectedSlugs={selectedSlugs}
              onToggle={toggleSlug}
            />
          </div>
        )}

        <button
          type="button"
          onClick={add}
          disabled={pending}
          style={{
            marginTop: 12,
            fontSize: 13,
            padding: "8px 20px",
            borderRadius: 6,
            background: "var(--brand)",
            color: "var(--fg-on-brand)",
            border: "none",
            fontWeight: 700,
            cursor: pending ? "not-allowed" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "Adicionando..." : "Adicionar"}
        </button>
      </div>

      {/* Listas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EmailList
          emails={initialEmails}
          allCampaigns={allCampaigns}
          onRemove={(id) => remove("email", id)}
          onPatch={patchEmail}
        />
        <DomainList rows={initialDomains} onRemove={(id) => remove("domain", id)} />
      </div>
    </div>
  );
}

function CampaignPicker({
  allCampaigns,
  selectedSlugs,
  onToggle,
}: {
  allCampaigns: CampaignOption[];
  selectedSlugs: string[];
  onToggle: (slug: string) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 600 }}>
          Campanhas que esse email pode ver
        </span>
        <span style={{ fontSize: 10, color: "var(--fg2)", fontStyle: "italic" }}>
          {selectedSlugs.length === 0
            ? "nenhuma marcada = acesso a TODAS (admin)"
            : `${selectedSlugs.length} marcada${selectedSlugs.length === 1 ? "" : "s"}`}
        </span>
      </div>
      <div
        className="rounded-md p-2 flex flex-wrap gap-1.5"
        style={{
          background: "var(--cockpit-card-strong)",
          border: "1px solid var(--cockpit-border)",
          maxHeight: 200,
          overflowY: "auto",
        }}
      >
        {allCampaigns.length === 0 ? (
          <span style={{ fontSize: 11, color: "var(--fg2)", padding: 4 }}>
            Nenhuma campanha cadastrada. Crie uma em /admin/campaigns.
          </span>
        ) : (
          allCampaigns.map((c) => {
            const checked = selectedSlugs.includes(c.slug);
            return (
              <label
                key={c.slug}
                className="cursor-pointer"
                style={{
                  fontSize: 12,
                  padding: "5px 9px",
                  borderRadius: 6,
                  border: "1px solid",
                  borderColor: checked ? "var(--brand)" : "var(--cockpit-border)",
                  background: checked ? "rgba(217,119,87,0.15)" : "transparent",
                  color: checked ? "var(--brand)" : "var(--fg1)",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(c.slug)}
                  style={{ accentColor: "var(--brand)", width: 12, height: 12 }}
                />
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                {c.isActive && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      padding: "1px 5px",
                      borderRadius: 3,
                      background: "rgba(48,209,88,0.15)",
                      color: "#30D158",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    ativa
                  </span>
                )}
                <span style={{ fontSize: 10, color: "var(--fg2)", fontFamily: "var(--font-mono)" }}>
                  {c.slug}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

function EmailList({
  emails,
  allCampaigns,
  onRemove,
  onPatch,
}: {
  emails: EmailEntry[];
  allCampaigns: CampaignOption[];
  onRemove: (id: string) => void;
  onPatch: (id: string, campaignSlugs: string[]) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSlugs, setEditSlugs] = useState<string[]>([]);

  function startEdit(e: EmailEntry) {
    setEditingId(e.id);
    setEditSlugs(e.campaignSlugs);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditSlugs([]);
  }
  function toggleSlug(slug: string) {
    setEditSlugs((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug],
    );
  }
  async function saveEdit(id: string) {
    await onPatch(id, editSlugs);
    setEditingId(null);
    setEditSlugs([]);
  }

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--cockpit-card)", border: "1px solid var(--cockpit-border)" }}
    >
      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--cockpit-border)" }}
      >
        <h3
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "var(--ls-eyebrow)",
            color: "var(--brand-soft)",
            fontWeight: 700,
          }}
        >
          Emails individuais
        </h3>
        <span style={{ fontSize: 11, color: "var(--fg2)", fontFamily: "var(--font-mono)" }}>
          {emails.length} liberado{emails.length === 1 ? "" : "s"}
        </span>
      </div>
      {emails.length === 0 ? (
        <div className="px-4 py-6 text-center" style={{ color: "var(--fg2)", fontSize: 12 }}>
          Nada cadastrado
        </div>
      ) : (
        <ul>
          {emails.map((e) => {
            const isEditing = editingId === e.id;
            return (
              <li
                key={e.id}
                className="px-4 py-2.5 flex flex-col gap-2"
                style={{ borderTop: "1px solid var(--cockpit-border)", fontSize: 13 }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span style={{ color: "var(--fg1)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                      {e.email}
                    </span>
                    {e.note && <span style={{ fontSize: 11, color: "var(--fg2)" }}>{e.note}</span>}
                  </div>
                  <div className="flex gap-2">
                    {!isEditing && (
                      <button
                        onClick={() => startEdit(e)}
                        style={iconBtn}
                      >
                        campanhas
                      </button>
                    )}
                    <button onClick={() => onRemove(e.id)} style={iconBtn}>
                      remover
                    </button>
                  </div>
                </div>

                {/* Campanhas linkadas (read-only mode) */}
                {!isEditing && (
                  <div className="flex flex-wrap gap-1">
                    {e.campaignSlugs.length === 0 ? (
                      <span style={{ fontSize: 11, color: "var(--fg2)", fontStyle: "italic" }}>
                        vê TODAS as campanhas (sem restrição)
                      </span>
                    ) : (
                      e.campaignSlugs.map((slug) => {
                        const camp = allCampaigns.find((c) => c.slug === slug);
                        return (
                          <span
                            key={slug}
                            style={{
                              fontSize: 11,
                              padding: "2px 7px",
                              borderRadius: 3,
                              background: "rgba(217,119,87,0.12)",
                              color: "var(--brand)",
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {camp?.name || slug}
                          </span>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Editor de campanhas (edit mode) */}
                {isEditing && (
                  <div className="flex flex-col gap-2">
                    <CampaignPicker
                      allCampaigns={allCampaigns}
                      selectedSlugs={editSlugs}
                      onToggle={toggleSlug}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => saveEdit(e.id)}
                        style={{
                          fontSize: 12,
                          padding: "6px 14px",
                          borderRadius: 5,
                          background: "var(--brand)",
                          color: "var(--fg-on-brand)",
                          border: "none",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Salvar
                      </button>
                      <button onClick={cancelEdit} style={iconBtn}>
                        cancelar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DomainList({ rows, onRemove }: { rows: DomainEntry[]; onRemove: (id: string) => void }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--cockpit-card)", border: "1px solid var(--cockpit-border)" }}
    >
      <div
        className="px-4 py-2.5 flex items-center justify-between"
        style={{ borderBottom: "1px solid var(--cockpit-border)" }}
      >
        <h3
          style={{
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "var(--ls-eyebrow)",
            color: "var(--brand-soft)",
            fontWeight: 700,
          }}
        >
          Domínios inteiros
        </h3>
        <span style={{ fontSize: 11, color: "var(--fg2)", fontFamily: "var(--font-mono)" }}>
          {rows.length} liberado{rows.length === 1 ? "" : "s"}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-6 text-center" style={{ color: "var(--fg2)", fontSize: 12 }}>
          Nada cadastrado
        </div>
      ) : (
        <ul>
          {rows.map((r) => (
            <li
              key={r.id}
              className="px-4 py-2.5 flex items-center justify-between gap-3"
              style={{ borderTop: "1px solid var(--cockpit-border)", fontSize: 13 }}
            >
              <div className="flex flex-col">
                <span style={{ color: "var(--fg1)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  {r.domain}
                </span>
                {r.note && <span style={{ fontSize: 11, color: "var(--fg2)" }}>{r.note}</span>}
              </div>
              <button onClick={() => onRemove(r.id)} style={iconBtn}>
                remover
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const input: React.CSSProperties = {
  width: "100%",
  background: "var(--cockpit-card-strong)",
  border: "1px solid var(--cockpit-border)",
  borderRadius: 6,
  padding: "8px 10px",
  color: "var(--fg1)",
  fontSize: 13,
  outline: "none",
};

const iconBtn: React.CSSProperties = {
  fontSize: 11,
  padding: "4px 10px",
  borderRadius: 4,
  background: "transparent",
  border: "1px solid var(--cockpit-border)",
  color: "var(--fg2)",
  cursor: "pointer",
};
