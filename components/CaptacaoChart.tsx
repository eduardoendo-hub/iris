"use client";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyEventPoint } from "@/lib/analytics";

const METRICS = [
  { key: "lp_view",         label: "Visitas LP",       color: "#0ABAB5" },
  { key: "click_compra",    label: "Clicks Compra",    color: "#30D158" },
  { key: "click_whats",     label: "Clicks WhatsApp",  color: "#25D366" },
  { key: "click_consultor", label: "Clicks Consultor", color: "#D97757" },
  { key: "lead_form",       label: "Leads (form)",     color: "#FFD60A" },
] as const;

type MetricKey = (typeof METRICS)[number]["key"];

export function CaptacaoChart({ data }: { data: DailyEventPoint[] }) {
  const [metric, setMetric] = useState<MetricKey>("lp_view");
  const meta = METRICS.find((m) => m.key === metric)!;

  const total = data.reduce(
    (sum, d) => sum + (d as unknown as Record<string, number>)[metric],
    0
  );

  return (
    <section
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{
        background: "var(--cockpit-card)",
        border: "1px solid var(--cockpit-border)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex flex-col gap-0.5">
          <span
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "var(--ls-eyebrow)",
              color: "var(--brand-soft)",
              fontWeight: 700,
            }}
          >
            Captação por dia
          </span>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>
            {meta.label} ·{" "}
            <span style={{ color: meta.color, fontFamily: "var(--font-mono)" }}>
              {total.toLocaleString("pt-BR")}
            </span>{" "}
            <span style={{ fontSize: 11, color: "var(--fg2)", fontWeight: 400 }}>
              no período
            </span>
          </h3>
        </div>
        <select
          value={metric}
          onChange={(e) => setMetric(e.target.value as MetricKey)}
          className="iris-select"
        >
          {METRICS.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
      </header>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--cockpit-border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--fg2)", fontSize: 11, fontFamily: "var(--font-mono)" }}
              tickFormatter={tickDate}
              axisLine={{ stroke: "var(--cockpit-border)" }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "var(--fg2)", fontSize: 11, fontFamily: "var(--font-mono)" }}
              axisLine={{ stroke: "var(--cockpit-border)" }}
              tickLine={false}
              width={36}
            />
            <Tooltip
              cursor={{ fill: "rgba(10,186,181,0.08)" }}
              contentStyle={{
                background: "var(--cockpit-card-strong)",
                border: "1px solid var(--cockpit-border-strong)",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelFormatter={(d) => `${tickDate(String(d))}`}
              formatter={(v) => [v as number, meta.label]}
            />
            <Bar dataKey={metric} fill={meta.color} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <style>{`
        .iris-select {
          padding: 6px 10px; border-radius: 6px;
          background: var(--cockpit-card-strong); color: var(--fg1);
          border: 1px solid var(--cockpit-border); font-size: 13px;
          font-family: inherit; cursor: pointer;
        }
        .iris-select:focus { outline: 2px solid var(--brand); border-color: var(--brand); }
      `}</style>
    </section>
  );
}

function tickDate(iso: string): string {
  // YYYY-MM-DD → DD/MM
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
