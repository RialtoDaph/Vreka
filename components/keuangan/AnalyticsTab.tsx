"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import { CHART_AXIS, CHART_EXPENSE, CHART_GRID, CHART_INCOME } from "@/lib/chartColors";
import HudPanel from "@/components/HudPanel";

type TxRow = { type: "income" | "expense" | "transfer"; category: string; amount: number; occurred_on: string };

type MonthPoint = { key: string; label: string; income: number; expense: number };

type CategoryPoint = { category: string; amount: number };

const MONTHS_BACK = 6;

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { month: "short" }).format(d);
}

function buildEmptyMonths(): MonthPoint[] {
  const now = new Date();
  const months: MonthPoint[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), label: monthLabel(d), income: 0, expense: 0 });
  }
  return months;
}

function CurrencyTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-panel border border-line rounded-sm px-3 py-2 text-xs font-mono shadow-glow">
      {label && <p className="text-slate-400 mb-1">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function AnalyticsTab() {
  const supabase = createClient();
  const [rows, setRows] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - (MONTHS_BACK - 1));
      cutoff.setDate(1);
      const { data } = await supabase
        .from("transactions")
        .select("type, category, amount, occurred_on")
        .gte("occurred_on", cutoff.toISOString().slice(0, 10));
      setRows((data ?? []) as TxRow[]);
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const monthly = useMemo(() => {
    const months = buildEmptyMonths();
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const r of rows) {
      const key = r.occurred_on.slice(0, 7);
      const m = byKey.get(key);
      if (!m) continue;
      if (r.type === "income") m.income += Number(r.amount);
      else if (r.type === "expense") m.expense += Number(r.amount);
    }
    return months;
  }, [rows]);

  const categories = useMemo<CategoryPoint[]>(() => {
    const now = new Date();
    const currentKey = monthKey(now);
    const totals = new Map<string, number>();
    for (const r of rows) {
      if (r.type !== "expense") continue;
      if (r.occurred_on.slice(0, 7) !== currentKey) continue;
      totals.set(r.category, (totals.get(r.category) ?? 0) + Number(r.amount));
    }
    return Array.from(totals.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [rows]);

  const chartHeight = Math.max(160, categories.length * 40);

  return (
    <div className="space-y-4">
      <HudPanel>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-white tracking-wide">
            Tren {MONTHS_BACK} Bulan Terakhir
          </h2>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">Memuat...</p>
        ) : (
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={monthly} barCategoryGap="24%" barGap={2}>
                <CartesianGrid vertical={false} stroke={CHART_GRID} />
                <XAxis
                  dataKey="label"
                  stroke={CHART_AXIS}
                  tick={{ fill: CHART_AXIS, fontSize: 11, fontFamily: "var(--font-jetbrains)" }}
                  axisLine={{ stroke: CHART_GRID }}
                  tickLine={false}
                />
                <YAxis
                  stroke={CHART_AXIS}
                  tick={{ fill: CHART_AXIS, fontSize: 11, fontFamily: "var(--font-jetbrains)" }}
                  axisLine={false}
                  tickLine={false}
                  width={0}
                />
                <Tooltip content={<CurrencyTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                <Legend
                  wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-jetbrains)", color: CHART_AXIS }}
                />
                <Bar
                  dataKey="income"
                  name="Pemasukan"
                  fill={CHART_INCOME}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                />
                <Bar
                  dataKey="expense"
                  name="Pengeluaran"
                  fill={CHART_EXPENSE}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </HudPanel>

      <HudPanel>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-white tracking-wide">
            Pengeluaran per Kategori (Bulan Ini)
          </h2>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">Memuat...</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-slate-500">Belum ada pengeluaran bulan ini.</p>
        ) : (
          <div style={{ width: "100%", height: chartHeight }}>
            <ResponsiveContainer>
              <BarChart data={categories} layout="vertical" margin={{ left: 8, right: 48 }}>
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="category"
                  stroke={CHART_AXIS}
                  tick={{ fill: CHART_AXIS, fontSize: 12, fontFamily: "var(--font-jetbrains)" }}
                  axisLine={false}
                  tickLine={false}
                  width={110}
                />
                <Tooltip
                  content={<CurrencyTooltip />}
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                />
                <Bar dataKey="amount" name="Pengeluaran" fill={CHART_EXPENSE} radius={[0, 4, 4, 0]} maxBarSize={18}>
                  <LabelList
                    dataKey="amount"
                    position="right"
                    formatter={(v) => formatCurrency(Number(v))}
                    style={{ fill: "#94a3b8", fontSize: 11, fontFamily: "var(--font-jetbrains)" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </HudPanel>
    </div>
  );
}
