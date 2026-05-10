import Link from "next/link";
import { RealtimeBadge } from "./RealtimeBadge";

export function Topbar() {
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-4 px-6 py-2 backdrop-blur-md"
      style={{
        background: "rgba(8, 15, 15, 0.85)",
        borderBottom: "1px solid var(--cockpit-border)",
      }}
    >
      <Link href="/" className="flex items-center gap-2.5 shrink-0">
        <div
          className="rounded-md grid place-items-center"
          style={{
            width: 28, height: 28,
            background: "var(--grad-brand)",
            boxShadow: "var(--glow-tiffany)",
          }}
        >
          <span style={{ fontWeight: 900, fontSize: 13, color: "var(--fg-on-brand)" }}>I</span>
        </div>
        <span style={{ fontWeight: 900, fontSize: 15, letterSpacing: "var(--ls-headline)" }}>IRIS</span>
      </Link>

      <div className="flex items-center gap-3">
        <RealtimeBadge />
        <button
          className="relative grid place-items-center rounded-full"
          style={{ width: 30, height: 30, background: "var(--cockpit-card)", border: "1px solid var(--cockpit-border)" }}
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
