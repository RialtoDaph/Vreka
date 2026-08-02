import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("joins rows and columns with commas/newlines", () => {
    expect(toCsv([["a", 1], ["b", 2]])).toBe("a,1\nb,2");
  });

  it("quotes fields containing a comma, quote, or newline (RFC4180)", () => {
    expect(toCsv([["hello, world", 'say "hi"', "line1\nline2"]])).toBe(
      '"hello, world","say ""hi""","line1\nline2"'
    );
  });

  it("leaves plain numbers unquoted, including negatives", () => {
    expect(toCsv([[-1500, 0, 1500]])).toBe("-1500,0,1500");
  });

  it("neutralizes formula-injection prefixes in string fields", () => {
    expect(toCsv([["=SUM(A1:A9)", "+1+1", "-1+1", "@cmd"]])).toBe(
      "'=SUM(A1:A9),'+1+1,'-1+1,'@cmd"
    );
  });

  it("does not neutralize a negative number field (only strings are guarded)", () => {
    expect(toCsv([[-50000]])).toBe("-50000");
  });

  it("quotes a neutralized formula field that also needs comma-escaping", () => {
    expect(toCsv([["=A1,A2"]])).toBe('"\'=A1,A2"');
  });
});
