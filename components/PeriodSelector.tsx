import Link from "next/link";

const OPTIONS = [10, 30, 60] as const;

export function PeriodSelector({
  current,
  productSlug,
  campaignSlug,
}: {
  current: number;
  productSlug: string;
  campaignSlug?: string | null;
}) {
  // Preserva a campanha selecionada ao trocar de periodo.
  const scope = campaignSlug
    ? `campaign=${encodeURIComponent(campaignSlug)}`
    : `product=${encodeURIComponent(productSlug)}`;
  return (
    <div className="flex items-center gap-1">
      <span
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "var(--ls-eyebrow)",
          color: "var(--brand-soft)",
          fontWeight: 700,
          marginRight: 8,
        }}
      >
        Período
      </span>
      {OPTIONS.map((d) => {
        const isActive = d === current;
        return (
          <Link
            key={d}
            href={`/analytics?${scope}&days=${d}`}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              background: isActive ? "var(--brand)" : "var(--cockpit-card-strong)",
              color: isActive ? "var(--fg-on-brand)" : "var(--fg2)",
              border: "1px solid var(--cockpit-border)",
              textDecoration: "none",
              fontFamily: "var(--font-mono)",
            }}
          >
            {d}d
          </Link>
        );
      })}
    </div>
  );
}
