"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SaleFormButton({ productSlug }: { productSlug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string>(() => {
    try { return localStorage.getItem("iris_admin_secret") || ""; } catch { return ""; }
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = {
      productSlug,
      source: "MANUAL",
      customerName:  fd.get("customerName"),
      customerEmail: fd.get("customerEmail") || null,
      customerPhone: fd.get("customerPhone") || null,
      amount:        fd.get("amount"),
      saleDate:      fd.get("saleDate") || undefined,
      notes:         fd.get("notes") || null,
    };
    try {
      const r = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Secret": secret },
        body: JSON.stringify(payload),
      });
      if (r.status === 401) { setError("Secret inválido"); setSubmitting(false); return; }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setError(j.message || j.error || `HTTP ${r.status}`);
        setSubmitting(false);
        return;
      }
      try { localStorage.setItem("iris_admin_secret", secret); } catch {}
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 6,
          background: "var(--brand)", color: "var(--fg-on-brand)",
          fontWeight: 700, fontSize: 13, border: "none", cursor: "pointer",
        }}
      >
        + Registrar venda manual
      </button>

      {open && (
        <div
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, padding: 20,
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--cockpit-border-strong)",
              borderRadius: 12, padding: 24, width: "100%", maxWidth: 480,
              display: "flex", flexDirection: "column", gap: 14,
            }}
          >
            <div className="flex items-center justify-between">
              <h2 style={{ fontWeight: 700, fontSize: 18 }}>Nova venda manual</h2>
              <button type="button" onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "var(--fg2)", fontSize: 22, cursor: "pointer" }}>×</button>
            </div>

            <Field label="Nome do cliente *">
              <input name="customerName" required maxLength={200} className="iris-input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="E-mail">
                <input name="customerEmail" type="email" className="iris-input" />
              </Field>
              <Field label="Telefone">
                <input name="customerPhone" type="tel" placeholder="+55 11 9..." className="iris-input" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Valor (R$) *">
                <input name="amount" type="number" step="0.01" required min="0" placeholder="1499.00" className="iris-input" />
              </Field>
              <Field label="Data da venda">
                <input
                  name="saleDate"
                  type="datetime-local"
                  defaultValue={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  className="iris-input"
                />
              </Field>
            </div>
            <Field label="Observações (opcional)">
              <textarea name="notes" rows={2} maxLength={500} className="iris-input" placeholder="ex.: vendido pelo João via WhatsApp comercial" />
            </Field>
            <Field label="Secret de admin (cole 1x — fica salvo no browser)">
              <input
                type="password" required value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder="IRIS_WEBHOOK_SECRET" className="iris-input"
              />
            </Field>

            {error && (
              <div style={{ background: "rgba(231,76,60,0.15)", color: "#e74c3c", padding: 10, borderRadius: 6, fontSize: 13 }}>
                {error}
              </div>
            )}

            <div className="flex gap-3 justify-end mt-2">
              <button type="button" onClick={() => setOpen(false)} style={{ padding: "10px 16px", borderRadius: 6, background: "transparent", color: "var(--fg2)", border: "1px solid var(--cockpit-border)", cursor: "pointer", fontSize: 13 }}>
                Cancelar
              </button>
              <button type="submit" disabled={submitting} style={{ padding: "10px 18px", borderRadius: 6, background: submitting ? "rgba(10,186,181,0.5)" : "var(--brand)", color: "var(--fg-on-brand)", border: "none", cursor: submitting ? "wait" : "pointer", fontSize: 13, fontWeight: 700 }}>
                {submitting ? "Salvando..." : "Registrar venda"}
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
      )}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 11, color: "var(--fg2)", textTransform: "uppercase", letterSpacing: "var(--ls-eyebrow)", fontWeight: 700 }}>
        {label}
      </span>
      {children}
    </label>
  );
}
