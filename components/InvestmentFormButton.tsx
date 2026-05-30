"use client";
import { useState } from "react";
import { InvestmentFormModal } from "./InvestmentFormModal";
import { PlusIcon } from "./icons";

export function InvestmentFormButton({ productSlug }: { productSlug: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          borderRadius: 6,
          background: "var(--brand)",
          color: "var(--fg-on-brand)",
          fontWeight: 700,
          fontSize: 13,
          border: "none",
          cursor: "pointer",
        }}
      >
        <PlusIcon size={14} />
        Registrar investimento
      </button>
      {open && (
        <InvestmentFormModal productSlug={productSlug} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
