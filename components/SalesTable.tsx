"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { SaleFormModal, type SaleFormInitial } from "./SaleFormModal";
import { CartIcon, ConsultorIcon, PencilIcon, TrashIcon } from "./icons";

type SaleRow = {
  id: string;
  source: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  amount: number | string;
  currency: string;
  notes: string | null;
  saleDate: Date | string;
};

function formatDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}
function formatBRL(v: number | string): string {
  const n = typeof v === "string" ? parseFloat(v) : v;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
}

const SOURCE_META: Record<
  string,
  { label: string; color: string; bg: string; icon: React.ReactNode }
> = {
  ENGAGED:   { label: "Engaged",   color: "#30D158", bg: "rgba(48,209,88,0.15)",   icon: <CartIcon size={11} /> },
  DIRETA:    { label: "Direta",    color: "#0ABAB5", bg: "rgba(10,186,181,0.15)", icon: <CartIcon size={11} /> },
  CONSULTOR: { label: "Consultor", color: "#D97757", bg: "rgba(217,119,87,0.15)", icon: <ConsultorIcon size={11} /> },
  MANUAL:    { label: "Manual",    color: "#9ABABA", bg: "rgba(154,186,186,0.15)", icon: null },
  OTHER:     { label: "Outro",     color: "#9ABABA", bg: "rgba(154,186,186,0.15)", icon: null },
};

export function SalesTable({
  productSlug,
  sales,
  totalCount,
  totalAmount,
}: {
  productSlug: string;
  sales: SaleRow[];
  totalCount: number;
  totalAmount: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<SaleRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleDelete(sale: SaleRow) {
    const confirmed = window.confirm(
      `Apagar a venda de ${sale.customerName} (${formatBRL(sale.amount)})? Essa ação não pode ser desfeita.`
    );
    if (!confirmed) return;
    let secret = "";
    try {
      secret = localStorage.getItem("iris_admin_secret") || "";
    } catch {}
    if (!secret) {
      const s = window.prompt("Cole o IRIS_WEBHOOK_SECRET pra apagar:");
      if (!s) return;
      secret = s;
      try {
        localStorage.setItem("iris_admin_secret", secret);
      } catch {}
    }
    setDeletingId(sale.id);
    setErrorMsg(null);
    try {
      const r = await fetch(`/api/sales/${sale.id}`, {
        method: "DELETE",
        headers: { "X-Admin-Secret": secret },
      });
      if (r.status === 401) {
        try {
          localStorage.removeItem("iris_admin_secret");
        } catch {}
        setErrorMsg("Secret inválido. Tente de novo.");
        return;
      }
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setErrorMsg(j.message || j.error || `HTTP ${r.status}`);
        return;
      }
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <section
        className="rounded-lg overflow-hidden"
        style={{
          background: "var(--cockpit-card)",
          border: "1px solid var(--cockpit-border)",
          boxShadow: "var(--shadow-1)",
        }}
      >
        <header
          className="px-5 py-3 flex items-center justify-between flex-wrap gap-2"
          style={{ borderBottom: "1px solid var(--cockpit-border)" }}
        >
          <div className="flex items-center gap-3">
            <h3 style={{ fontWeight: 700, fontSize: 14 }}>Vendas registradas</h3>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 999,
                background: "rgba(48,209,88,0.10)",
                color: "#30D158",
                border: "1px solid rgba(48,209,88,0.25)",
                fontWeight: 600,
              }}
            >
              {totalCount} {totalCount === 1 ? "venda" : "vendas"} · {formatBRL(totalAmount)}
            </span>
          </div>
          <span
            style={{
              fontSize: 10,
              color: "var(--fg2)",
              textTransform: "uppercase",
              letterSpacing: "var(--ls-eyebrow)",
              fontWeight: 700,
            }}
          >
            Direta · Consultor · Engaged (auto)
          </span>
        </header>

        {errorMsg && (
          <div
            className="px-5 py-2"
            style={{
              background: "rgba(231,76,60,0.10)",
              color: "#e74c3c",
              fontSize: 12,
              borderBottom: "1px solid rgba(231,76,60,0.25)",
            }}
          >
            {errorMsg}
          </div>
        )}

        {sales.length === 0 ? (
          <div className="px-5 py-10 text-center" style={{ color: "var(--fg2)", fontSize: 13 }}>
            Nenhuma venda registrada ainda.
            <div style={{ fontSize: 11, marginTop: 6, opacity: 0.7 }}>
              Use o botão &quot;Registrar venda manual&quot; acima, ou aguarde o webhook do Engaged.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
              <thead>
                <tr
                  style={{
                    color: "var(--brand-soft)",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: "var(--ls-eyebrow)",
                    fontWeight: 700,
                    opacity: 0.95,
                  }}
                >
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>Data</th>
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>Cliente</th>
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>Contato</th>
                  <th style={{ textAlign: "left", padding: "10px 16px" }}>Origem</th>
                  <th style={{ textAlign: "right", padding: "10px 16px" }}>Valor</th>
                  <th style={{ textAlign: "right", padding: "10px 16px" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => {
                  const src = SOURCE_META[s.source] || SOURCE_META.OTHER;
                  const isDeleting = deletingId === s.id;
                  return (
                    <tr key={s.id} style={{ borderTop: "1px solid var(--cockpit-border)" }}>
                      <td
                        style={{
                          padding: "12px 16px",
                          fontFamily: "var(--font-mono)",
                          color: "var(--fg2)",
                          fontSize: 12,
                        }}
                      >
                        {formatDate(s.saleDate)}
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--fg1)", fontWeight: 600 }}>
                        {s.customerName}
                        {s.notes && (
                          <div style={{ fontSize: 10, opacity: 0.5, fontWeight: 400, marginTop: 2 }}>
                            {s.notes.slice(0, 80)}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px", color: "var(--fg2)", fontSize: 12 }}>
                        {s.customerEmail && <div>{s.customerEmail}</div>}
                        {s.customerPhone && <div style={{ opacity: 0.7 }}>{s.customerPhone}</div>}
                        {!s.customerEmail && !s.customerPhone && (
                          <span style={{ opacity: 0.4 }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "12px 16px" }}>
                        <span
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: 10,
                            padding: "2px 8px",
                            borderRadius: 4,
                            background: src.bg,
                            color: src.color,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}
                        >
                          {src.icon}
                          {src.label}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "12px 16px",
                          textAlign: "right",
                          color: "#30D158",
                          fontWeight: 700,
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {formatBRL(s.amount)}
                      </td>
                      <td style={{ padding: "12px 16px", textAlign: "right" }}>
                        <div className="flex items-center justify-end gap-1">
                          <IconButton
                            title="Editar venda"
                            onClick={() => setEditing(s)}
                            disabled={isDeleting}
                          >
                            <PencilIcon size={14} />
                          </IconButton>
                          <IconButton
                            title="Apagar venda"
                            onClick={() => handleDelete(s)}
                            disabled={isDeleting}
                            danger
                          >
                            <TrashIcon size={14} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <SaleFormModal
          productSlug={productSlug}
          initial={editing as SaleFormInitial}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function IconButton({
  title,
  onClick,
  children,
  disabled,
  danger,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 28,
        height: 28,
        borderRadius: 6,
        background: "transparent",
        border: "1px solid var(--cockpit-border)",
        color: danger ? "#e74c3c" : "var(--brand-soft)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "all 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = danger ? "rgba(231,76,60,0.10)" : "rgba(10,186,181,0.10)";
          e.currentTarget.style.borderColor = danger ? "rgba(231,76,60,0.5)" : "var(--brand)";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor = "var(--cockpit-border)";
      }}
    >
      {children}
    </button>
  );
}
