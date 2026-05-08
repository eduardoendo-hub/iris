"use client";
import Link from "next/link";
import { useState } from "react";

export function ProductSelector({ currentSlug, products }: {
  currentSlug: string;
  products: { slug: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const current = products.find((p) => p.slug === currentSlug) ?? products[0];

  if (!current) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-4 py-2 rounded-md text-sm"
        style={{
          background: "var(--cockpit-card-strong)",
          border: "1px solid var(--cockpit-border)",
          color: "var(--fg1)",
        }}
      >
        <span style={{ fontWeight: 600 }}>{current.name}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute top-full mt-2 left-0 z-20 min-w-[220px] rounded-md overflow-hidden"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--cockpit-border-strong)",
              boxShadow: "var(--shadow-2)",
            }}
          >
            {products.map((p) => (
              <Link
                key={p.slug}
                href={`/?product=${p.slug}`}
                className="block px-4 py-2.5 text-sm hover:bg-white/5 transition-colors"
                style={{
                  color: p.slug === currentSlug ? "var(--brand)" : "var(--fg1)",
                  fontWeight: p.slug === currentSlug ? 600 : 400,
                }}
                onClick={() => setOpen(false)}
              >
                {p.name}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
