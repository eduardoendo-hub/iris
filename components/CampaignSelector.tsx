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

export type CampaignStatus = "DRAFT" | "ACTIVE" | "ENDED";

export type CampaignOption = {
  slug: string;
  name: string;
  productSlug: string;
  isActive: boolean;
  status: CampaignStatus;
};

type FilterMode = "active" | "ended" | "all";

const FILTERS: { key: FilterMode; label: string }[] = [
  { key: "active", label: "Ativas" },
  { key: "ended", label: "Encerradas" },
  { key: "all", label: "Todas" },
];

function matchesFilter(c: CampaignOption, mode: FilterMode): boolean {
  if (mode === "all") return true;
  if (mode === "active") return c.status === "ACTIVE";
  return c.status === "ENDED";
}

export function CampaignSelector({
  currentSlug,
  campaigns,
  basePath = "/",
}: {
  currentSlug: string | null;
  campaigns: CampaignOption[];
  /** Rota onde o selector vive — "/" cockpit ou "/analytics". Trocar de
   *  campanha mantem o usuario na mesma aba em vez de jogar pro cockpit. */
  basePath?: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  if (campaigns.length === 0) return null;
  const current =
    campaigns.find((c) => c.slug === currentSlug) ??
    campaigns.find((c) => c.isActive) ??
    campaigns[0];

  // Lista filtrada pelo toggle (Ativas / Encerradas / Todas). A campanha
  // selecionada no momento aparece sempre, mesmo que nao bata com o filtro,
  // pra nunca "sumir" o item atual do menu.
  const visibleCampaigns = campaigns.filter(
    (c) => c.slug === current.slug || matchesFilter(c, filter)
  );

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
            {/* Toggle Ativas / Encerradas / Todas */}
            <div
              className="flex items-center gap-1 px-2 py-2"
              style={{ borderBottom: "1px solid var(--cockpit-border)" }}
            >
              {FILTERS.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className="flex-1 transition-colors"
                    style={{
                      fontSize: 11,
                      fontWeight: active ? 700 : 500,
                      padding: "4px 8px",
                      borderRadius: 4,
                      background: active ? "var(--cockpit-card-strong)" : "transparent",
                      color: active ? "var(--fg1)" : "var(--fg2)",
                      border: "1px solid",
                      borderColor: active ? "var(--cockpit-border-strong)" : "transparent",
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            {visibleCampaigns.length === 0 && (
              <div
                className="px-4 py-3 text-center"
                style={{ fontSize: 12, color: "var(--fg2)" }}
              >
                Nenhuma campanha nesse filtro
              </div>
            )}
            {visibleCampaigns.map((c) => (
              <Link
                key={c.slug}
                href={`${basePath}?campaign=${encodeURIComponent(c.slug)}`}
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
                {c.status === "ACTIVE" && (
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
                {c.status === "ENDED" && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 800,
                      padding: "1px 6px",
                      borderRadius: 3,
                      background: "rgba(142,142,147,0.18)",
                      color: "var(--fg2)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    encerrada
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
