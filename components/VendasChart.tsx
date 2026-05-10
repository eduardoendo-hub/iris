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
import type { DailySalesPoint } from "@/lib/analytics";

const formatBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(n);

export function VendasChart({ data }: { data: DailySalesPoint[] }) {
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);
  const totalCount = data.reduce((s, d) => s + d.count, 0);
  const ticketMedio = totalCount > 0 ? totalRevenue / totalCount : 0;

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
            Vendas por dia
          </span>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>
            <span style={{ color: "#30D158", fontFamily: "var(--font-mono)" }}>
              {formatBRL(totalRevenue)}
            </span>
            <span style={{ fontSize: 12, color: "var(--fg2)", fontWeight: 400 }}>
              {" "}
              em {totalCount} {totalCount === 1 ? "venda" : "vendas"}
              {totalCount > 0 && ` · ticket médio ${formatBRL(ticketMedio)}`}
            </span>
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs" style={{ color: "var(--fg2)" }}>
          <Legend color="#30D158" label="Receita/dia" shape="bar" />
          <Legend color="#0ABAB5" label="Receita acumulada" shape="line" />
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
              cursor={{ fill: "rgba(48,209,88,0.06)" }}
              contentStyle={{
                background: "var(--cockpit-card-strong)",
                border: "1px solid var(--cockpit-border-strong)",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelFormatter={(d) => tickDate(String(d))}
              formatter={(v, name) => {
                const num = Number(v);
                if (name === "revenue") return [formatBRL(num), "Receita do dia"];
                if (name === "cumulativeRevenue") return [formatBRL(num), "Receita acumulada"];
                if (name === "count") return [num, "Vendas"];
                return [num, String(name)];
              }}
            />
            <Bar yAxisId="left" dataKey="revenue" fill="#30D158" radius={[3, 3, 0, 0]} />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="cumulativeRevenue"
              stroke="#0ABAB5"
              strokeWidth={2.5}
              dot={{ fill: "#0ABAB5", r: 3 }}
              activeDot={{ r: 5 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function VendasCountChart({ data }: { data: DailySalesPoint[] }) {
  return (
    <section
      className="rounded-xl p-5 flex flex-col gap-4"
      style={{
        background: "var(--cockpit-card)",
        border: "1px solid var(--cockpit-border)",
        boxShadow: "var(--shadow-1)",
      }}
    >
      <header>
        <span
          style={{
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "var(--ls-eyebrow)",
            color: "var(--brand-soft)",
            fontWeight: 700,
          }}
        >
          Quantidade de vendas por dia
        </span>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginTop: 2 }}>
          Volume diário · acumulado{" "}
          <span style={{ color: "var(--brand)", fontFamily: "var(--font-mono)" }}>
            {data[data.length - 1]?.cumulativeCount ?? 0}
          </span>
        </h3>
      </header>
      <div style={{ width: "100%", height: 200 }}>
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
              allowDecimals={false}
              tick={{ fill: "var(--fg2)", fontSize: 11, fontFamily: "var(--font-mono)" }}
              axisLine={{ stroke: "var(--cockpit-border)" }}
              tickLine={false}
              width={36}
            />
            <Tooltip
              cursor={{ fill: "rgba(10,186,181,0.06)" }}
              contentStyle={{
                background: "var(--cockpit-card-strong)",
                border: "1px solid var(--cockpit-border-strong)",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelFormatter={(d) => tickDate(String(d))}
              formatter={(v, name) => {
                if (name === "count") return [v as number, "Vendas no dia"];
                if (name === "cumulativeCount") return [v as number, "Acumulado"];
                return [v as number, String(name)];
              }}
            />
            <Bar dataKey="count" fill="var(--brand)" radius={[3, 3, 0, 0]} />
            <Line
              type="monotone"
              dataKey="cumulativeCount"
              stroke="#FFD60A"
              strokeWidth={2}
              dot={{ fill: "#FFD60A", r: 3 }}
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
