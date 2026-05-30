"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** Hoje em horario de Sao Paulo no formato YYYY-MM-DD (pro <input type=date>). */
function todaySP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function InvestmentFormModal({
  productSlug,
  onClose,
  onSuccess,
}: {
  productSlug: string;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string>(() => {
    try {
      return localStorage.getItem("iris_admin_secret") || "";
    } catch {
      return "";
    }
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const metaRaw = (fd.get("meta") as string | null)?.trim() || "";
    const googleRaw = (fd.get("google") as string | null)?.trim() || "";
    if (!metaRaw && !googleRaw) {
      setError("Informe ao menos um valor (Meta ou Google).");
      setSubmitting(false);
      return;
    }
    const payload: Record<string, unknown> = {
      productSlug,
      date: fd.get("date"),
      notes: fd.get("notes") || null,
    };
    if (metaRaw) payload.meta = metaRaw;
    if (googleRaw) payload.google = googleRaw;
    try {
      const r = await fetch("/api/investments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-Secret": secret,
        },
        body: JSON.stringify(payload),
      });
      if (r.status === 401) {
        setError("Secret inválido");
        setSubmitting(false);
        return;
      }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.message || j.error || `HTTP ${r.status}`);
        setSubmitting(false);
        return;
      }
      try {
        localStorage.setItem("iris_admin_secret", secret);
      } catch {}
      onClose();
      onSuccess?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 20,
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--cockpit-border-strong)",
          borderRadius: 12,
          padding: 24,
          width: "100%",
          maxWidth: 460,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div className="flex items-center justify-between">
          <h2 style={{ fontWeight: 700, fontSize: 18 }}>Registrar investimento de mídia</h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--fg2)",
              fontSize: 22,
              cursor: "pointer",
            }}
          >
            ×
          </button>
        </div>

        <p style={{ fontSize: 12, color: "var(--fg2)", marginTop: -4 }}>
          Valor investido no dia por plataforma. Re-enviar o mesmo dia <b>substitui</b> os valores
          anteriores. Informe ao menos um (Meta ou Google).
        </p>

        <Field label="Dia *">
          <input
            name="date"
            type="date"
            required
            defaultValue={todaySP()}
            className="iris-input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Meta Ads (R$)">
            <input
              name="meta"
              type="number"
              step="0.01"
              min="0"
              placeholder="650.00"
              className="iris-input"
            />
          </Field>
          <Field label="Google Ads (R$)">
            <input
              name="google"
              type="number"
              step="0.01"
              min="0"
              placeholder="420.00"
              className="iris-input"
            />
          </Field>
        </div>
        <Field label="Observações (opcional)">
          <input
            name="notes"
            maxLength={500}
            className="iris-input"
            placeholder="ex.: Meta + Google · campanha topo de funil"
          />
        </Field>
        <Field label="Secret de admin (cole 1x — fica salvo no browser)">
          <input
            type="password"
            required
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="IRIS_WEBHOOK_SECRET"
            className="iris-input"
          />
        </Field>

        {error && (
          <div
            style={{
              background: "rgba(231,76,60,0.15)",
              color: "#e74c3c",
              padding: 10,
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div className="flex gap-3 justify-end mt-2">
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 16px",
              borderRadius: 6,
              background: "transparent",
              color: "var(--fg2)",
              border: "1px solid var(--cockpit-border)",
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: "10px 18px",
              borderRadius: 6,
              background: submitting ? "rgba(10,186,181,0.5)" : "var(--brand)",
              color: "var(--fg-on-brand)",
              border: "none",
              cursor: submitting ? "wait" : "pointer",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {submitting ? "Salvando..." : "Registrar investimento"}
          </button>
        </div>
      </form>

      <style>{`
        .iris-input {
          width: 100%; padding: 10px 12px; border-radius: 6px;
          background: var(--cockpit-card-strong); color: var(--fg1);
          border: 1px solid var(--cockpit-border); font-size: 14px;
          font-family: inherit;
        }
        .iris-input:focus { outline: 2px solid var(--brand); border-color: var(--brand); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: "var(--brand-soft)",
          textTransform: "uppercase",
          letterSpacing: "var(--ls-eyebrow)",
          fontWeight: 700,
          opacity: 0.95,
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}
