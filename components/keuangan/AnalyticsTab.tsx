"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
type CategorySlice = CategoryPoint & { color: string; pct: number; delta: number | null };

const MONTH_OPTIONS = [3, 6, 12] as const;

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(d: Date): string {
  return new Intl.DateTimeFormat("id-ID", { month: "short" }).format(d);
}

function buildEmptyMonths(monthsBack: number): MonthPoint[] {
  const now = new Date();
  const months: MonthPoint[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
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

// A positive delta is only "good" when goodWhenUp matches its direction --
// e.g. income going up is good, expense going up is bad, so the same badge
// needs to color and read oppositely for each.
function DeltaBadge({ pct, goodWhenUp }: { pct: number | null; goodWhenUp: boolean }) {
  if (pct === null || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  const good = goodWhenUp ? up : !up;
  return (
    <p className={`font-mono text-[10px] mt-0.5 ${good ? "text-mint-glow" : "text-rose-glow"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(0)}% vs bulan lalu
    </p>
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
  const [monthsBack, setMonthsBack] = useState<number>(6);

  useEffect(() => {
    async function load() {
      setLoading(true);
      // Full history (not windowed to monthsBack) -- the net-worth trend
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
    const months = buildEmptyMonths(monthsBack);
    const byKey = new Map(months.map((m) => [m.key, m]));
    for (const r of rows) {
      const key = r.occurred_on.slice(0, 7);
      const m = byKey.get(key);
      if (!m) continue;
      if (r.type === "income") m.income += Number(r.amount);
      else if (r.type === "expense") m.expense += Number(r.amount);
    }
    return months;
  }, [rows, monthsBack]);

  // monthly's last entry is always the current, still-in-progress month --
  // buildEmptyMonths always counts back from "now" regardless of monthsBack.
  const currentMonth = monthly[monthly.length - 1];
  const previousMonth = monthly.length >= 2 ? monthly[monthly.length - 2] : null;
  const incomeDelta =
    previousMonth && previousMonth.income > 0
      ? ((currentMonth.income - previousMonth.income) / previousMonth.income) * 100
      : null;
  const expenseDelta =
    previousMonth && previousMonth.expense > 0
      ? ((currentMonth.expense - previousMonth.expense) / previousMonth.expense) * 100
      : null;
  const savingsRate =
    currentMonth.income > 0 ? ((currentMonth.income - currentMonth.expense) / currentMonth.income) * 100 : null;
  // Straight-line projection from the daily average spent so far this month
  // -- a rough "if this pace continues" estimate, not a forecast model.
  const projectedExpense = useMemo(() => {
    const today = new Date();
    const daysElapsed = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    return daysElapsed > 0 ? (currentMonth.expense / daysElapsed) * daysInMonth : currentMonth.expense;
  }, [currentMonth]);

  // Balance reconstructed as of the end of each of the last monthsBack
  // months (capped at today for the current, still-in-progress month) --
  // same accumulation buildAccountBalances already does for "right now",
  // just re-run with the transaction set truncated at each month-end.
  const netWorthTrend = useMemo(() => {
    const months = buildEmptyMonths(monthsBack);
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
  }, [rows, accounts, monthsBack]);

  const categoryTotals = useMemo<CategoryPoint[]>(() => {
    const currentKey = monthKey(new Date());
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

  // Same shape, one month back -- lets the distribution list show whether
  // each category grew or shrank instead of just its current amount.
  const previousByCategory = useMemo(() => {
    const now = new Date();
    const prevKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const totals = new Map<string, number>();
    for (const r of rows) {
      if (r.type !== "expense") continue;
      if (r.occurred_on.slice(0, 7) !== prevKey) continue;
      totals.set(r.category, (totals.get(r.category) ?? 0) + Number(r.amount));
    }
    return totals;
  }, [rows]);

  // Same category totals, capped to 5 named slices (the categorical palette
  // is only validated that far -- see lib/chartColors.ts) with the rest
  // folded into a single "Lainnya" bucket rather than extending the palette.
  const categoryDonut = useMemo<CategorySlice[]>(() => {
    const totalExpense = categoryTotals.reduce((s, c) => s + c.amount, 0);
    const top = categoryTotals.slice(0, 5).map((c, i) => {
      const prev = previousByCategory.get(c.category) ?? 0;
      return {
        ...c,
        color: CATEGORY_COLORS[i],
        pct: totalExpense > 0 ? (c.amount / totalExpense) * 100 : 0,
        delta: prev > 0 ? ((c.amount - prev) / prev) * 100 : null,
      };
    });
    const restTotal = categoryTotals.slice(5).reduce((s, c) => s + c.amount, 0);
    if (restTotal > 0) {
      top.push({
        category: "Lainnya",
        amount: restTotal,
        color: CHART_OTHER,
        pct: totalExpense > 0 ? (restTotal / totalExpense) * 100 : 0,
        delta: null,
      });
    }
    return top;
  }, [categoryTotals, previousByCategory]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <HudPanel>
          <p className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5">Pemasukan Bulan Ini</p>
          {loading ? (
            <p className="text-sm text-fg-subtle">...</p>
          ) : (
            <>
              <p className="font-mono text-lg font-bold text-mint-glow">{formatCurrency(currentMonth.income)}</p>
              <DeltaBadge pct={incomeDelta} goodWhenUp />
            </>
          )}
        </HudPanel>
        <HudPanel>
          <p className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5">Pengeluaran Bulan Ini</p>
          {loading ? (
            <p className="text-sm text-fg-subtle">...</p>
          ) : (
            <>
              <p className="font-mono text-lg font-bold text-rose-glow">{formatCurrency(currentMonth.expense)}</p>
              <DeltaBadge pct={expenseDelta} goodWhenUp={false} />
            </>
          )}
        </HudPanel>
        <HudPanel>
          <p className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5">Rasio Tabungan</p>
          {loading ? (
            <p className="text-sm text-fg-subtle">...</p>
          ) : (
            <p
              className={`font-mono text-lg font-bold ${
                savingsRate === null
                  ? "text-fg-subtle"
                  : savingsRate >= 20
                    ? "text-mint-glow"
                    : savingsRate >= 0
                      ? "text-amber-glow"
                      : "text-rose-glow"
              }`}
            >
              {savingsRate === null ? "-" : `${savingsRate.toFixed(0)}%`}
            </p>
          )}
        </HudPanel>
        <HudPanel>
          <p className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5">Proyeksi Akhir Bulan</p>
          {loading ? (
            <p className="text-sm text-fg-subtle">...</p>
          ) : (
            <>
              <p className="font-mono text-lg font-bold text-fg">{formatCurrency(projectedExpense)}</p>
              <p className="text-[10px] text-fg-subtle mt-0.5">Estimasi total pengeluaran</p>
            </>
          )}
        </HudPanel>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display font-semibold text-fg tracking-wide">Tren Keuangan</h2>
        <div className="flex gap-2">
          {MONTH_OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => setMonthsBack(m)}
              className={`px-3 py-1 font-mono text-[11px] uppercase tracking-wider rounded-full border transition-colors ${
                monthsBack === m
                  ? "border-cyan-glow/60 bg-cyan-glow/10 text-cyan-glow"
                  : "border-line text-fg-subtle hover:text-fg-muted"
              }`}
            >
              {m} Bln
            </button>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <HudPanel>
          <h3 className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle mb-3">
            Pemasukan vs Pengeluaran
          </h3>
          {loading ? (
            <p className="text-sm text-fg-subtle">Memuat...</p>
          ) : (
            <div style={{ width: "100%", height: 200 }}>
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
          <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
            <h3 className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">Kekayaan Bersih</h3>
            {!loading && accounts.length > 0 && netWorthTrend.length > 0 && (
              <div className="text-right">
                <p className="font-mono text-sm text-fg leading-tight">
                  {formatCurrency(netWorthTrend[netWorthTrend.length - 1].total)}
                </p>
                {netWorthTrend.length > 1 &&
                  (() => {
                    const delta =
                      netWorthTrend[netWorthTrend.length - 1].total - netWorthTrend[netWorthTrend.length - 2].total;
                    const up = delta >= 0;
                    return (
                      <p className={`font-mono text-[10px] ${up ? "text-mint-glow" : "text-rose-glow"}`}>
                        {up ? "▲" : "▼"} {formatCurrency(Math.abs(delta))}
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
            <div style={{ width: "100%", height: 200 }}>
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
      </div>

      <HudPanel>
        <h2 className="font-display font-semibold text-fg tracking-wide mb-4">Distribusi Pengeluaran (Bulan Ini)</h2>
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
            <ul className="flex-1 w-full space-y-2">
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
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-mono text-[10px] text-fg-subtle">{slice.pct.toFixed(0)}%</span>
                    {slice.delta !== null && (
                      <span
                        className={`font-mono text-[10px] ${slice.delta >= 0 ? "text-rose-glow" : "text-mint-glow"}`}
                      >
                        {slice.delta >= 0 ? "▲" : "▼"}
                        {Math.abs(slice.delta).toFixed(0)}%
                      </span>
                    )}
                    <span className="font-mono text-fg-subtle">{formatCurrency(slice.amount)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </HudPanel>
    </div>
  );
}
