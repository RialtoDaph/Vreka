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

  it("collapses id-ID-grouped numbers into a plain quantity", () => {
    expect(sanitizeForSpeech("Saldo kamu 1.234.567,89 sekarang.")).toBe(
      "Saldo kamu 1234567.89 sekarang."
    );
  });

  it("leaves plain prose with normal punctuation untouched", () => {
    expect(sanitizeForSpeech("Halo, apa kabar? Semoga baik-baik saja.")).toBe(
      "Halo, apa kabar? Semoga baik-baik saja."
    );
  });
});
