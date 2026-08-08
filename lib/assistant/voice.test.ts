import { describe, expect, it } from "vitest";
import { sanitizeForSpeech } from "./voice";

describe("sanitizeForSpeech", () => {
  it("strips bold/italic markdown markers", () => {
    expect(sanitizeForSpeech("Ini **penting** banget dan *catatan* kecil.")).toBe(
      "Ini penting banget dan catatan kecil."
    );
  });

  it("strips markdown headers", () => {
    expect(sanitizeForSpeech("# Ringkasan\nSemua aman.")).toBe("Ringkasan. Semua aman.");
  });

  it("strips bullet list markers", () => {
    expect(sanitizeForSpeech("- Item satu\n- Item dua")).toBe("Item satu. Item dua");
  });

  it("keeps numbered list content but drops the literal dot", () => {
    expect(sanitizeForSpeech("1. Bayar listrik\n2. Cek budget")).toBe(
      "1) Bayar listrik. 2) Cek budget"
    );
  });

  it("unwraps markdown links to just the label", () => {
    expect(sanitizeForSpeech("Cek [dashboard](https://vreka.app/dashboard) kamu.")).toBe(
      "Cek dashboard kamu."
    );
  });

  it("strips inline code and code fences", () => {
    expect(sanitizeForSpeech("Jalankan `npm run build` dulu.")).toBe("Jalankan npm run build dulu.");
  });

  it("spells out a large id-ID-grouped number as Indonesian words", () => {
    expect(sanitizeForSpeech("Saldo kamu 1.234.567,89 sekarang.")).toBe(
      "Saldo kamu satu juta dua ratus tiga puluh empat ribu lima ratus enam puluh tujuh koma delapan sembilan sekarang."
    );
  });

  it("spells out a plain ungrouped number (e.g. a year) without chopping it at 3 digits", () => {
    expect(sanitizeForSpeech("Target lunas tahun 2026.")).toBe("Target lunas tahun dua ribu dua puluh enam.");
  });

  it("spells out a currency amount as euro (and sen when there are cents)", () => {
    expect(sanitizeForSpeech("Sisa cicilan 45,00 € bulan ini.")).toBe(
      "Sisa cicilan empat puluh lima euro bulan ini."
    );
    expect(sanitizeForSpeech("Totalnya 1.234,56 €.")).toBe(
      "Totalnya seribu dua ratus tiga puluh empat euro lima puluh enam sen."
    );
  });

  it("spells out a negative currency amount with a leading minus", () => {
    expect(sanitizeForSpeech("Selisihnya -50,00 €.")).toBe("Selisihnya minus lima puluh euro.");
  });

  it("spells out a percentage, decimal digits read one at a time after koma", () => {
    expect(sanitizeForSpeech("Progress 87% menuju target.")).toBe("Progress delapan puluh tujuh persen menuju target.");
    expect(sanitizeForSpeech("Turun -8,5% bulan ini.")).toBe("Turun minus delapan koma lima persen bulan ini.");
  });

  it("spells out a plain decimal (non-money) digit by digit after koma", () => {
    expect(sanitizeForSpeech("Rasionya 3,14 kira-kira.")).toBe("Rasionya tiga koma satu empat kira-kira.");
  });

  it("leaves plain prose with normal punctuation untouched", () => {
    expect(sanitizeForSpeech("Halo, apa kabar? Semoga baik-baik saja.")).toBe(
      "Halo, apa kabar? Semoga baik-baik saja."
    );
  });
});
