"use client";

/**
 * CampaignSelector — combo no topo do cockpit que controla qual campanha
 * o dashboard ta visualizando. Substitui o antigo ProductSelector (que
 * mostrava produtos), agora mostra campanhas cadastradas via /admin.
 *
 * URL: ?campaign=<slug>
 *
 * Cada item mostra:
 *   - nome da campanha (bold)
 *   - slug em mono pequeno (referencia tecnica)
 *   - badge "ATIVA" verde se isActive
 */
import Link from "next/link";
import { useState } from "react";

export type CampaignOption = {
  slug: string;
  name: string;
  productSlug: string;
  isActive: boolean;
};

export function CampaignSelector({
  currentSlug,
  campaigns,
}: {
  currentSlug: string | null;
  campaigns: CampaignOption[];
}) {
  const [open, setOpen] = useState(false);
  if (campaigns.length === 0) return null;
  const current =
    campaigns.find((c) => c.slug === currentSlug) ??
    campaigns.find((c) => c.isActive) ??
    campaigns[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-md"
        style={{
          background: "var(--cockpit-card-strong)",
          border: "1px solid var(--cockpit-border)",
          color: "var(--fg1)",
          maxWidth: 420,
        }}
      >
        <div className="flex flex-col items-start text-left">
          <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.15 }}>
            {current.name}
          </span>
          <span
            style={{
              fontSize: 10,
              color: "var(--fg2)",
              fontFamily: "var(--font-mono)",
              lineHeight: 1.1,
            }}
          >
            {current.slug}
          </span>
        </div>
        {current.isActive && (
          <span
            style={{
              fontSize: 9,
              fontWeight: 800,
              padding: "1px 6px",
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
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          style={{ marginLeft: 4 }}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div
            className="absolute top-full mt-2 left-0 z-20 min-w-[320px] rounded-md overflow-hidden"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--cockpit-border-strong)",
              boxShadow: "var(--shadow-2)",
            }}
          >
            {campaigns.map((c) => (
              <Link
                key={c.slug}
                href={`/?campaign=${c.slug}`}
                className="flex items-center gap-2 px-4 py-2.5 hover:bg-white/5 transition-colors"
                style={{
                  color: c.slug === current.slug ? "var(--brand)" : "var(--fg1)",
                }}
                onClick={() => setOpen(false)}
              >
                <div className="flex flex-col flex-1">
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: c.slug === current.slug ? 700 : 500,
                    }}
                  >
                    {c.name}
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      color: "var(--fg2)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    {c.slug} · {c.productSlug}
                  </span>
                </div>
                {c.isActive && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      padding: "1px 6px",
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
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
