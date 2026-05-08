import Link from "next/link";
import { ProductSelector } from "./ProductSelector";
import { RealtimeBadge } from "./RealtimeBadge";

export function Topbar({ productSlug, products }: {
  productSlug: string;
  products: { slug: string; name: string }[];
}) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-4 px-6 py-4 backdrop-blur-md"
      style={{
        background: "rgba(8, 15, 15, 0.72)",
        borderBottom: "1px solid var(--cockpit-border)",
      }}
    >
      <Link href="/" className="flex items-center gap-3 shrink-0">
        <div
          className="rounded-md grid place-items-center"
          style={{
            width: 32, height: 32,
            background: "var(--grad-brand)",
            boxShadow: "var(--glow-tiffany)",
          }}
        >
          <span style={{ fontWeight: 900, fontSize: 14, color: "var(--fg-on-brand)" }}>I</span>
        </div>
        <div className="flex flex-col leading-tight">
          <span style={{ fontWeight: 900, fontSize: 14, letterSpacing: "var(--ls-headline)" }}>IRIS</span>
          <span style={{ fontSize: 10, color: "var(--fg2)", letterSpacing: "var(--ls-eyebrow)", textTransform: "uppercase" }}>
            TechNow Cockpit
          </span>
        </div>
      </Link>

      <div className="flex items-center gap-3">
        <ProductSelector currentSlug={productSlug} products={products} />
      </div>

      <div className="flex items-center gap-4">
        <RealtimeBadge />
        <button
          className="relative grid place-items-center rounded-full"
          style={{ width: 36, height: 36, background: "var(--cockpit-card)", border: "1px solid var(--cockpit-border)" }}
          aria-label="Notificações"
        >
          <BellIcon />
        </button>
      </div>
    </header>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}
