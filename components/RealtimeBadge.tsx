"use client";
import { useEffect, useState } from "react";

export function RealtimeBadge() {
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setSecondsAgo((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const stale = secondsAgo > 120;
  const color = stale ? "var(--live-stale-color)" : "var(--live-pulse-color)";
  const label = stale
    ? `aguardando · ${formatAgo(secondsAgo)}`
    : `ao vivo · ${formatAgo(secondsAgo)}`;

  return (
    <div className="flex items-center gap-2 text-xs" aria-live="polite" style={{ color: "var(--fg2)" }}>
      <span
        className="inline-block rounded-full"
        style={{
          width: 8, height: 8,
          background: color,
          boxShadow: `0 0 0 4px ${color}22`,
          animation: stale ? "none" : "iris-pulse 1.6s ease-in-out infinite",
        }}
      />
      <span style={{ fontFamily: "var(--font-mono)" }}>{label}</span>
      <style>{`
        @keyframes iris-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50%      { transform: scale(1.4); opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

function formatAgo(s: number) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m`;
}
