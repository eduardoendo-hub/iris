"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CartIcon, ConsultorIcon } from "./icons";
import { toSpDatetimeLocalValue, spDatetimeLocalToUtcISO } from "@/lib/datetime";

export type SaleSourceManual = "DIRETA" | "CONSULTOR";

export type SaleFormInitial = {
  id?: string;
  source?: string;
  customerName?: string;
  customerEmail?: string | null;
  customerPhone?: string | null;
  amount?: number | string;
  saleDate?: Date | string;
  notes?: string | null;
};

export function SaleFormModal({
  productSlug,
  initial,
  onClose,
  onSuccess,
}: {
  productSlug: string;
  initial?: SaleFormInitial;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(initial?.id);

  const [source, setSource] = useState<SaleSourceManual>(
    initial?.source === "CONSULTOR" ? "CONSULTOR" : "DIRETA"
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secret, setSecret] = useState<string>(() => {
    try {
      return localStorage.getItem("iris_admin_secret") || "";
    } catch {
      return "";
    }
  });

  // Default datetime-local: usa a data da venda original ou agora, sempre como
  // horario de parede de Sao Paulo (independente do fuso do navegador).
  const defaultDate = toSpDatetimeLocalValue(
    initial?.saleDate ? new Date(initial.saleDate) : new Date()
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    // O <input datetime-local> devolve horario de parede sem fuso. Tratamos como
    // horario de Sao Paulo e convertemos para um instante UTC explicito, senao o
    // servidor (UTC) interpretaria a hora literal como UTC e gravaria -3h errado.
    const rawSaleDate = (fd.get("saleDate") as string | null) || "";
    const saleDate = rawSaleDate ? spDatetimeLocalToUtcISO(rawSaleDate) : undefined;
    const payload = {
      productSlug,
      source,
      customerName: fd.get("customerName"),
      customerEmail: fd.get("customerEmail") || null,
      customerPhone: fd.get("customerPhone") || null,
      amount: fd.get("amount"),
      saleDate,
      notes: fd.get("notes") || null,
    };
    try {
      const url = isEdit ? `/api/sales/${initial!.id}` : "/api/sales";
      const method = isEdit ? "PATCH" : "POST";
      const r = await fetch(url, {
        method,
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
          maxWidth: 520,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div className="flex items-center justify-between">
          <h2 style={{ fontWeight: 700, fontSize: 18 }}>
            {isEdit ? "Editar venda" : "Nova venda manual"}
          </h2>
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

        {/* Selector de origem com icones */}
        <Field label="Origem da venda *">
          <div className="flex gap-3">
            <SourceButton
              active={source === "DIRETA"}
              onClick={() => setSource("DIRETA")}
              color="var(--brand)"
              icon={<CartIcon size={18} />}
              label="Direta"
              hint="checkout, transferência, cartão"
            />
            <SourceButton
              active={source === "CONSULTOR"}
              onClick={() => setSource("CONSULTOR")}
              color="#D97757"
              icon={<ConsultorIcon size={18} />}
              label="Consultor"
              hint="fechada via WhatsApp/ligação"
            />
          </div>
        </Field>

        <Field label="Nome do cliente *">
          <input
            name="customerName"
            required
            maxLength={200}
            defaultValue={initial?.customerName ?? ""}
            className="iris-input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="E-mail">
            <input
              name="customerEmail"
              type="email"
              defaultValue={initial?.customerEmail ?? ""}
              className="iris-input"
            />
          </Field>
          <Field label="Telefone">
            <input
              name="customerPhone"
              type="tel"
              placeholder="+55 11 9..."
              defaultValue={initial?.customerPhone ?? ""}
              className="iris-input"
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor (R$) *">
            <input
              name="amount"
              type="number"
              step="0.01"
              required
              min="0"
              placeholder="1499.00"
              defaultValue={initial?.amount?.toString() ?? ""}
              className="iris-input"
            />
          </Field>
          <Field label="Data da venda">
            <input
              name="saleDate"
              type="datetime-local"
              defaultValue={defaultDate}
              className="iris-input"
            />
          </Field>
        </div>
        <Field label="Observações (opcional)">
          <textarea
            name="notes"
            rows={2}
            maxLength={500}
            defaultValue={initial?.notes ?? ""}
            className="iris-input"
            placeholder="ex.: vendido pelo João via WhatsApp comercial"
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
            {submitting ? "Salvando..." : isEdit ? "Salvar alterações" : "Registrar venda"}
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

function SourceButton({
  active,
  onClick,
  color,
  icon,
  label,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 4,
        padding: "10px 12px",
        borderRadius: 8,
        background: active ? `${color}22` : "var(--cockpit-card-strong)",
        border: active ? `2px solid ${color}` : "1px solid var(--cockpit-border)",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.15s",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color, fontWeight: 700, fontSize: 14 }}>
        {icon}
        {label}
      </span>
      <span style={{ fontSize: 11, color: "var(--fg2)" }}>{hint}</span>
    </button>
  );
}
