"use client";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyInvestmentPoint } from "@/lib/analytics";

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(n);

export function InvestimentosChart({ data }: { data: DailyInvestmentPoint[] }) {
  const totalSpend = data.reduce((s, d) => s + d.spend, 0);
  const diasComGasto = data.filter((d) => d.spend > 0).length;
  const mediaDiaria = diasComGasto > 0 ? totalSpend / diasComGasto : 0;

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
            Investimento de mídia por dia
          </span>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>
            <span style={{ color: "#FF9F0A", fontFamily: "var(--font-mono)" }}>
              {formatBRL(totalSpend)}
            </span>
            <span style={{ fontSize: 12, color: "var(--fg2)", fontWeight: 400 }}>
              {" "}
              acumulado
              {diasComGasto > 0 && ` · média ${formatBRL(mediaDiaria)}/dia`}
            </span>
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--fg2)" }}>
          <Legend color="#FF9F0A" label="Investido/dia" shape="bar" />
          <Legend color="#D97757" label="Investido acumulado" shape="line" />
        </div>
      </header>

      <div style={{ width: "100%", height: 280 }}>
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--cockpit-border)" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fill: "var(--fg2)", fontSize: 11, fontFamily: "var(--font-mono)" }}
              tickFormatter={tickDate}
              axisLine={{ stroke: "var(--cockpit-border)" }}
              tickLine={false}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: "var(--fg2)", fontSize: 11, fontFamily: "var(--font-mono)" }}
              axisLine={{ stroke: "var(--cockpit-border)" }}
              tickLine={false}
              tickFormatter={(v) => formatBRL(Number(v))}
              width={70}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: "var(--fg2)", fontSize: 11, fontFamily: "var(--font-mono)" }}
              axisLine={{ stroke: "var(--cockpit-border)" }}
              tickLine={false}
              tickFormatter={(v) => formatBRL(Number(v))}
              width={70}
            />
            <Tooltip
              cursor={{ fill: "rgba(255,159,10,0.06)" }}
              contentStyle={{
                background: "var(--cockpit-card-strong)",
                border: "1px solid var(--cockpit-border-strong)",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelFormatter={(d) => tickDate(String(d))}
              formatter={(v, name) => {
                const num = Number(v);
                if (name === "spend") return [formatBRL(num), "Investido no dia"];
                if (name === "cumulativeSpend") return [formatBRL(num), "Investido acumulado"];
                return [num, String(name)];
              }}
            />
            <Bar yAxisId="left" dataKey="spend" fill="#FF9F0A" radius={[3, 3, 0, 0]} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulativeSpend"
              stroke="#D97757"
              strokeWidth={2.5}
              dot={{ fill: "#D97757", r: 3 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function Legend({
  color,
  label,
  shape,
}: {
  color: string;
  label: string;
  shape: "bar" | "line";
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {shape === "bar" ? (
        <span style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
      ) : (
        <span
          style={{
            width: 14,
            height: 0,
            borderTop: `2.5px solid ${color}`,
            display: "inline-block",
          }}
        />
      )}
      <span>{label}</span>
    </span>
  );
}

function tickDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
