/**
 * channel-groups — classificação de tráfego em grupos de canal de negócio
 * (Orgânico, Meta, Google, Mailing, Portal, ...) a partir de utm_source/medium.
 *
 * PURO (sem prisma) — pode ser importado por client component. O carregamento
 * das regras do banco fica no server (página/admin), que passa as regras como
 * prop. Sem regras → usa DEFAULT_CHANNEL_RULES.
 */
export type ChannelRule = {
  name: string;
  color: string | null;
  ordem: number;
  sources: string[];
  mediums: string[];
  matchEmptySource: boolean;
};

export const DEFAULT_CHANNEL_RULES: ChannelRule[] = [
  { name: "Orgânico", color: "#9CA3AF", ordem: 0, sources: ["direct", "(direct)", "none"], mediums: ["organic", "referral", "none"], matchEmptySource: true },
  { name: "Mailing", color: "#F59E0B", ordem: 1, sources: ["rdstation", "rd", "mailchimp"], mediums: ["email"], matchEmptySource: false },
  { name: "Meta", color: "#1877F2", ordem: 2, sources: ["meta", "facebook", "fb", "instagram", "ig"], mediums: [], matchEmptySource: false },
  { name: "Google", color: "#34A853", ordem: 3, sources: ["google", "google-ads", "googleads", "gads"], mediums: [], matchEmptySource: false },
  { name: "Portal", color: "#A855F7", ordem: 4, sources: ["olhar-digital", "olhardigital", "portal"], mediums: [], matchEmptySource: false },
];

export const OUTROS_GROUP = { name: "Outros", color: "#6B7280" as string | null };

/** Classifica (utm_source, utm_medium) num grupo. Avalia regras por `ordem`. */
export function classifyChannel(
  utmSource: string | null | undefined,
  utmMedium: string | null | undefined,
  rules: ChannelRule[],
): { name: string; color: string | null } {
  const src = (utmSource ?? "").trim().toLowerCase();
  const med = (utmMedium ?? "").trim().toLowerCase();
  const sorted = [...rules].sort((a, b) => a.ordem - b.ordem);
  for (const r of sorted) {
    if (r.matchEmptySource && src === "") return { name: r.name, color: r.color };
    if (src && r.sources.some((s) => s.toLowerCase() === src)) return { name: r.name, color: r.color };
    if (med && r.mediums.some((m) => m.toLowerCase() === med)) return { name: r.name, color: r.color };
  }
  return { name: OUTROS_GROUP.name, color: OUTROS_GROUP.color };
}
