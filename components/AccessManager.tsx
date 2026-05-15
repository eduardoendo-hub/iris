"use client";

/**
 * AccessManager — gerencia AllowedEmail + AllowedDomain via UI.
 *
 * Lista os 2 tipos lado a lado + form pra adicionar. Cada item tem botao
 * de remover. Mutacoes via /api/admin/access.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Entry = {
  id: string;
  email?: string;
  domain?: string;
  note: string | null;
  addedAt: string;
};

export function AccessManager({
  initialEmails,
  initialDomains,
}: {
  initialEmails: Entry[];
  initialDomains: Entry[];
}) {
  const router = useRouter();
  const [type, setType] = useState<"email" | "domain">("email");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function add() {
    setError(null);
    if (!value.trim()) return;
    const res = await fetch("/api/admin/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, value: value.trim(), note: note.trim() || undefined }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.message || json.error || "Falha ao adicionar");
      return;
    }
    setValue("");
    setNote("");
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
        <List
          title="Emails individuais"
          subtitle={`${initialEmails.length} liberado${initialEmails.length === 1 ? "" : "s"}`}
          rows={initialEmails}
          field="email"
          onRemove={(id) => remove("email", id)}
        />
        <List
          title="Domínios inteiros"
          subtitle={`${initialDomains.length} liberado${initialDomains.length === 1 ? "" : "s"}`}
          rows={initialDomains}
          field="domain"
          onRemove={(id) => remove("domain", id)}
        />
      </div>
    </div>
  );
}

function List({
  title,
  subtitle,
  rows,
  field,
  onRemove,
}: {
  title: string;
  subtitle: string;
  rows: Entry[];
  field: "email" | "domain";
  onRemove: (id: string) => void;
}) {
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
          {title}
        </h3>
        <span style={{ fontSize: 11, color: "var(--fg2)", fontFamily: "var(--font-mono)" }}>
          {subtitle}
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
                  {r[field]}
                </span>
                {r.note && <span style={{ fontSize: 11, color: "var(--fg2)" }}>{r.note}</span>}
              </div>
              <button
                onClick={() => onRemove(r.id)}
                style={{
                  fontSize: 11,
                  padding: "4px 10px",
                  borderRadius: 4,
                  background: "transparent",
                  border: "1px solid var(--cockpit-border)",
                  color: "var(--fg2)",
                  cursor: "pointer",
                }}
              >
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
