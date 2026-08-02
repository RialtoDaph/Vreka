function csvEscape(value: string | number): string {
  let s = String(value);
  // Neutralize CSV/formula injection: a free-text field (description,
  // notes, ...) starting with = + - @ gets interpreted as a formula by
  // Excel/Sheets when the file is opened. A leading single-quote forces
  // it back to plain text. Only applied to actual strings -- a computed
  // number is never attacker-controlled, and quoting it would turn a
  // legitimate negative total into text.
  if (typeof value === "string" && /^[=+\-@]/.test(s)) {
    s = `'${s}`;
  }
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function downloadCsv(filename: string, rows: Array<Array<string | number>>): void {
  // BOM so Excel opens the UTF-8 file correctly instead of mangling € etc.
  const blob = new Blob([`﻿${toCsv(rows)}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
