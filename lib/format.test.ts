import { describe, expect, it } from "vitest";
import { daysUntil, formatCurrency, formatDate, formatDateTime, parseAmount } from "./format";

// de-DE currency formatting puts a NON-BREAKING space (U+00A0, not a plain
// ASCII space) between the amount and the € sign -- Intl/ICU output.
const NBSP = " ";

describe("formatCurrency", () => {
  it("formats a positive amount as EUR with de-DE grouping/decimal separators", () => {
    expect(formatCurrency(1234.5)).toBe(`1.234,50${NBSP}€`);
  });

  it("formats zero", () => {
    expect(formatCurrency(0)).toBe(`0,00${NBSP}€`);
  });

  it("formats a negative amount", () => {
    expect(formatCurrency(-50)).toBe(`-50,00${NBSP}€`);
  });
});

describe("parseAmount", () => {
  it("parses a dot-decimal string", () => {
    expect(parseAmount("12.50")).toBe(12.5);
  });

  it("parses a comma-decimal string (EUR display format)", () => {
    expect(parseAmount("12,50")).toBe(12.5);
  });

  it("parses a plain integer string", () => {
    expect(parseAmount("1000")).toBe(1000);
  });

  it("returns NaN for non-numeric input", () => {
    expect(parseAmount("abc")).toBeNaN();
  });
});

describe("formatDate", () => {
  it("returns a dash for null", () => {
    expect(formatDate(null)).toBe("-");
  });

  it("formats a date in id-ID short form", () => {
    expect(formatDate("2026-08-02")).toBe("02 Agu 2026");
  });
});

describe("formatDateTime", () => {
  it("returns a dash for null", () => {
    expect(formatDateTime(null)).toBe("-");
  });
});

describe("daysUntil", () => {
  it("returns null for null input", () => {
    expect(daysUntil(null)).toBeNull();
  });

  it("returns 0 for today", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(daysUntil(today)).toBe(0);
  });

  it("returns a positive count for a future date", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    expect(daysUntil(future.toISOString().slice(0, 10))).toBe(5);
  });

  it("returns a negative count for a past date", () => {
    const past = new Date();
    past.setDate(past.getDate() - 3);
    expect(daysUntil(past.toISOString().slice(0, 10))).toBe(-3);
  });
});
