export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(amount);
}

// Amount inputs are type="text" (not type="number") so de-DE-style grouping
// ("1.500.000,50") can be typed directly. "." is the thousands separator
// (and is stripped, not parsed as a decimal point) and "," is the decimal
// separator -- the same convention `formatCurrency` displays in. Getting
// this pair out of sync is what let "1.500" silently parse as 1.5 before.
export function parseAmount(value: string): number {
  const cleaned = value.trim().replace(/\./g, "").replace(",", ".");
  return Number(cleaned);
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  return Math.round((target - today) / (1000 * 60 * 60 * 24));
}
