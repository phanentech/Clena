"use client";

import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axis = { fontSize: 11, fill: "#8794A6" };
const tooltipStyle = { borderRadius: 8, border: "1px solid #E3E7ED", fontSize: 12, boxShadow: "0 8px 24px rgb(11 27 51 / 0.10)" };
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function money(currency: string, compact = true) {
  return (v: number) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency, notation: compact ? "compact" : "standard", maximumFractionDigits: compact ? 1 : 0 }).format(v);
}

export function DailyBars({ data, metric, currency, height = 240 }: {
  data: { day: string; orders: number; revenue: number | null }[]; metric: "orders" | "revenue"; currency: string; height?: number;
}) {
  const fmt = metric === "revenue" ? money(currency) : (v: number) => String(v);
  const full = metric === "revenue" ? money(currency, false) : (v: number) => `${v} orders`;
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid stroke="#EEF1F5" vertical={false} />
          <XAxis dataKey="day" tickFormatter={dayLabel} tick={axis} axisLine={false} tickLine={false} minTickGap={28} />
          <YAxis tickFormatter={fmt} tick={axis} axisLine={false} tickLine={false} width={56} allowDecimals={false} />
          <Tooltip cursor={{ fill: "#F0F3F7" }} contentStyle={tooltipStyle} labelFormatter={(l) => dayLabel(String(l))}
            formatter={(v) => [full(Number(v)), metric === "revenue" ? "Collected" : "Orders"]} />
          <Bar dataKey={metric} radius={[3, 3, 0, 0]} fill={metric === "revenue" ? "#0B1B33" : "#1E88A8"} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendLine({ data, currency }: { data: { day: string; revenue: number | null; orders: number }[]; currency: string }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#EEF1F5" vertical={false} />
          <XAxis dataKey="day" tickFormatter={dayLabel} tick={axis} axisLine={false} tickLine={false} minTickGap={28} />
          <YAxis tickFormatter={money(currency)} tick={axis} axisLine={false} tickLine={false} width={56} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(l) => dayLabel(String(l))} formatter={(v) => [money(currency, false)(Number(v)), "Collected"]} />
          <Line type="monotone" dataKey="revenue" stroke="#0B1B33" strokeWidth={1.75} dot={false} activeDot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HBars({ data, currency, valueKey = "revenue", height }: {
  data: { name: string; revenue?: number | null; orders?: number; amount?: number }[]; currency?: string; valueKey?: "revenue" | "orders" | "amount"; height?: number;
}) {
  const rows = data.map((d) => ({ name: d.name, value: Number(d[valueKey] ?? 0) }));
  return (
    <div style={{ height: height ?? Math.max(120, rows.length * 34 + 16) }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap="28%">
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="name" tick={{ ...axis, fill: "#0B1B33" }} axisLine={false} tickLine={false} width={150} />
          <Tooltip cursor={{ fill: "#F0F3F7" }} contentStyle={tooltipStyle} formatter={(v) => [valueKey === "orders" || !currency ? `${v}` : money(currency, false)(Number(v)), valueKey === "orders" ? "Orders" : "Amount"]} />
          <Bar dataKey="value" radius={[0, 3, 3, 0]} maxBarSize={14}>
            {rows.map((_, i) => <Cell key={i} fill={i === 0 ? "#0B1B33" : "#1E88A8"} fillOpacity={i === 0 ? 1 : 0.75} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
