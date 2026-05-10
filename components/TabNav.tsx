import Link from "next/link";

/**
 * Switcher de abas no topo do cockpit.
 * Usa Link do Next pra navegacao client-side rapida.
 */
export function TabNav({
  active,
  productSlug,
}: {
  active: "cockpit" | "analytics";
  productSlug: string;
}) {
  const tabs = [
    { id: "cockpit" as const, label: "Cockpit", href: `/?product=${productSlug}` },
    { id: "analytics" as const, label: "Visão analítica", href: `/analytics?product=${productSlug}` },
  ];
  return (
    <nav
      className="flex items-center gap-1 px-6"
      style={{ borderBottom: "1px solid var(--cockpit-border)" }}
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <Link
            key={t.id}
            href={t.href}
            style={{
              padding: "12px 18px",
              fontSize: 13,
              fontWeight: 600,
              color: isActive ? "var(--brand)" : "var(--fg2)",
              borderBottom: isActive
                ? "2px solid var(--brand)"
                : "2px solid transparent",
              marginBottom: -1,
              textDecoration: "none",
              transition: "color 0.15s",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
