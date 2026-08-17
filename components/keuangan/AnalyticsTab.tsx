"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { formatCurrency } from "@/lib/format";
import { CATEGORY_COLORS, CHART_AXIS, CHART_EXPENSE, CHART_GRID_DARK, CHART_GRID_LIGHT, CHART_INCOME, CHART_OTHER } from "@/lib/chartColors";
import { buildAccountBalances } from "@/lib/accountBalances";
import { DARK_THEME, LIGHT_THEME } from "@/lib/theme";
import { useTheme } from "@/components/ThemeProvider";
import type { Account } from "@/lib/types";
import HudPanel from "@/components/HudPanel";

type TxRow = {
  type: "income" | "expense" | "transfer";
  category: string;
  amount: number;
  occurred_on: string;
  account_id: string | null;
  to_account_id: string | null;
};

type MonthPoint = { key: string; label: string; income: number; expense: number };

type CategoryPoint = { category: string; amount: number };
type CategorySlice = CategoryPoint & { color: string };

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
      {label && <p className="text-fg-subtle mb-1">{label}</p>}
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
  const { resolvedTheme } = useTheme();
  const chartGrid = resolvedTheme === "light" ? CHART_GRID_LIGHT : CHART_GRID_DARK;
  const palette = resolvedTheme === "light" ? LIGHT_THEME : DARK_THEME;
  // Bar-hover highlight -- a white tint reads as a subtle lighten on the
  // dark panel; on a white/near-white light panel the same white would be
  // invisible, so it needs a dark tint there instead (same idea as the
  // `overlay` Tailwind token, just needed as a literal rgba() for Recharts'
  // style prop rather than a className).
  const hoverCursorFill = resolvedTheme === "light" ? "rgba(15,23,42,0.04)" : "rgba(255,255,255,0.03)";
  const [rows, setRows] = useState<TxRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // Full history (not windowed to MONTHS_BACK) -- the net-worth trend
      // below needs every transaction back to each account's starting
      // balance to reconstruct an accurate balance at each past month-end,
      // not just what happened in the recent window.
      const [{ data: txData }, { data: accountData }] = await Promise.all([
        supabase.from("transactions").select("type, category, amount, occurred_on, account_id, to_account_id"),
        supabase.from("accounts").select("*"),
      ]);
      setRows((txData ?? []) as TxRow[]);
      setAccounts((accountData ?? []) as Account[]);
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

  // Balance reconstructed as of the end of each of the last MONTHS_BACK
  // months (capped at today for the current, still-in-progress month) --
  // same accumulation buildAccountBalances already does for "right now",
  // just re-run with the transaction set truncated at each month-end.
  const netWorthTrend = useMemo(() => {
    const months = buildEmptyMonths();
    const today = new Date();
    return months.map((m) => {
      const [y, mo] = m.key.split("-").map(Number);
      let monthEnd = new Date(y, mo, 0);
      if (monthEnd > today) monthEnd = today;
      const cutoff = monthEnd.toISOString().slice(0, 10);
      const upToMonth = rows.filter((r) => r.occurred_on <= cutoff);
      const { total } = buildAccountBalances(accounts, upToMonth);
      return { key: m.key, label: m.label, total };
    });
  }, [rows, accounts]);

  const categoryTotals = useMemo<CategoryPoint[]>(() => {
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
      .sort((a, b) => b.amount - a.amount);
  }, [rows]);

  const categories = useMemo(() => categoryTotals.slice(0, 8), [categoryTotals]);

  // Same category totals, capped to 5 named slices (the categorical palette
  // is only validated that far -- see lib/chartColors.ts) with the rest
  // folded into a single "Lainnya" bucket rather than extending the palette.
  const categoryDonut = useMemo<CategorySlice[]>(() => {
    const top = categoryTotals.slice(0, 5).map((c, i) => ({ ...c, color: CATEGORY_COLORS[i] }));
    const restTotal = categoryTotals.slice(5).reduce((s, c) => s + c.amount, 0);
    if (restTotal > 0) top.push({ category: "Lainnya", amount: restTotal, color: CHART_OTHER });
    return top;
  }, [categoryTotals]);

  const chartHeight = Math.max(160, categories.length * 40);

  return (
    <div className="space-y-4">
      <HudPanel>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-fg tracking-wide">
            Tren {MONTHS_BACK} Bulan Terakhir
          </h2>
        </div>
        {loading ? (
          <p className="text-sm text-fg-subtle">Memuat...</p>
        ) : (
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={monthly} barCategoryGap="24%" barGap={2}>
                <CartesianGrid vertical={false} stroke={chartGrid} />
                <XAxis
                  dataKey="label"
                  stroke={CHART_AXIS}
                  tick={{ fill: CHART_AXIS, fontSize: 11, fontFamily: "var(--font-jetbrains)" }}
                  axisLine={{ stroke: chartGrid }}
                  tickLine={false}
                />
                <YAxis
                  stroke={CHART_AXIS}
                  tick={{ fill: CHART_AXIS, fontSize: 11, fontFamily: "var(--font-jetbrains)" }}
                  axisLine={false}
                  tickLine={false}
                  width={0}
                />
                <Tooltip content={<CurrencyTooltip />} cursor={{ fill: hoverCursorFill }} />
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
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="font-display font-semibold text-fg tracking-wide">Tren Kekayaan Bersih</h2>
          {!loading && accounts.length > 0 && netWorthTrend.length > 0 && (
            <div className="text-right">
              <p className="font-mono text-lg text-fg leading-tight">
                {formatCurrency(netWorthTrend[netWorthTrend.length - 1].total)}
              </p>
              {netWorthTrend.length > 1 &&
                (() => {
                  const delta =
                    netWorthTrend[netWorthTrend.length - 1].total - netWorthTrend[netWorthTrend.length - 2].total;
                  const up = delta >= 0;
                  return (
                    <p className={`font-mono text-[11px] ${up ? "text-mint-glow" : "text-rose-glow"}`}>
                      {up ? "▲" : "▼"} {formatCurrency(Math.abs(delta))} vs bulan lalu
                    </p>
                  );
                })()}
            </div>
          )}
        </div>
        {loading ? (
          <p className="text-sm text-fg-subtle">Memuat...</p>
        ) : accounts.length === 0 ? (
          <p className="text-sm text-fg-subtle">
            Belum ada rekening tercatat -- tambahin di tab Rekening biar tren kekayaan bersih bisa dihitung.
          </p>
        ) : (
          <div style={{ width: "100%", height: 220 }}>
            <ResponsiveContainer>
              <AreaChart data={netWorthTrend}>
                <defs>
                  <linearGradient id="netWorthFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_INCOME} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={CHART_INCOME} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke={chartGrid} />
                <XAxis
                  dataKey="label"
                  stroke={CHART_AXIS}
                  tick={{ fill: CHART_AXIS, fontSize: 11, fontFamily: "var(--font-jetbrains)" }}
                  axisLine={{ stroke: chartGrid }}
                  tickLine={false}
                />
                <YAxis
                  stroke={CHART_AXIS}
                  tick={{ fill: CHART_AXIS, fontSize: 11, fontFamily: "var(--font-jetbrains)" }}
                  axisLine={false}
                  tickLine={false}
                  width={0}
                />
                <Tooltip content={<CurrencyTooltip />} cursor={{ stroke: chartGrid }} />
                <Area
                  type="monotone"
                  dataKey="total"
                  name="Kekayaan Bersih"
                  stroke={CHART_INCOME}
                  strokeWidth={2}
                  fill="url(#netWorthFill)"
                  dot={{ r: 3, fill: CHART_INCOME, strokeWidth: 0 }}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </HudPanel>

      <HudPanel>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-fg tracking-wide">
            Pengeluaran per Kategori (Bulan Ini)
          </h2>
        </div>
        {loading ? (
          <p className="text-sm text-fg-subtle">Memuat...</p>
        ) : categories.length === 0 ? (
          <p className="text-sm text-fg-subtle">Belum ada pengeluaran bulan ini.</p>
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
                  cursor={{ fill: hoverCursorFill }}
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

      <HudPanel>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display font-semibold text-fg tracking-wide">
            Distribusi Pengeluaran (Bulan Ini)
          </h2>
        </div>
        {loading ? (
          <p className="text-sm text-fg-subtle">Memuat...</p>
        ) : categoryDonut.length === 0 ? (
          <p className="text-sm text-fg-subtle">Belum ada pengeluaran bulan ini.</p>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-5">
            <div style={{ width: 180, height: 180 }} className="shrink-0">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={categoryDonut}
                    dataKey="amount"
                    nameKey="category"
                    innerRadius={52}
                    outerRadius={80}
                    paddingAngle={2}
                    strokeWidth={2}
                    stroke={palette.panel}
                  >
                    {categoryDonut.map((slice) => (
                      <Cell key={slice.category} fill={slice.color} />
                    ))}
                  </Pie>
                  <Tooltip content={<CurrencyTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="flex-1 w-full space-y-1.5">
              {categoryDonut.map((slice) => (
                <li key={slice.category} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: slice.color }}
                      aria-hidden="true"
                    />
                    <span className="text-fg-muted truncate">{slice.category}</span>
                  </span>
                  <span className="font-mono text-fg-subtle shrink-0">{formatCurrency(slice.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </HudPanel>
    </div>
  );
}
