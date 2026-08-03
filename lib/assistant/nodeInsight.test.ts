import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

function mockAnthropic(content: unknown[]) {
  const create = vi.fn().mockResolvedValue({ content });
  vi.doMock("@anthropic-ai/sdk", () => ({
    default: class {
      messages = { create };
    },
  }));
  return create;
}

describe("getNodeInsight", () => {
  it("returns the text block joined, with no sources when there's no web_search_tool_result", async () => {
    mockAnthropic([{ type: "text", text: "Dana darurat idealnya 3-6x pengeluaran bulanan." }]);
    const { getNodeInsight } = await import("./nodeInsight");
    const result = await getNodeInsight("key", "claude-sonnet-5", {
      typeLabel: "Keuangan",
      label: "Dana Darurat",
      fields: [{ k: "Progress", v: "45%" }],
    });

    expect(result.text).toBe("Dana darurat idealnya 3-6x pengeluaran bulanan.");
    expect(result.sources).toEqual([]);
  });

  it("extracts up to 2 deduped sources from web_search_tool_result blocks", async () => {
    mockAnthropic([
      { type: "text", text: "Insight singkat." },
      {
        type: "web_search_tool_result",
        content: [
          { type: "web_search_result", url: "https://www.nerdwallet.com/emergency-fund", title: "Emergency Fund" },
          { type: "web_search_result", url: "https://www.nerdwallet.com/emergency-fund", title: "dup" },
          { type: "web_search_result", url: "https://numbeo.com/cost-of-living", title: "Cost of living" },
          { type: "web_search_result", url: "https://example.com/extra", title: "should be dropped, cap is 2" },
        ],
      },
    ]);
    const { getNodeInsight } = await import("./nodeInsight");
    const result = await getNodeInsight("key", "claude-sonnet-5", {
      typeLabel: "Keuangan",
      label: "Dana Darurat",
      fields: [],
    });

    expect(result.sources).toEqual([
      { label: "nerdwallet.com", url: "https://www.nerdwallet.com/emergency-fund" },
      { label: "numbeo.com", url: "https://numbeo.com/cost-of-living" },
    ]);
  });

  it("ignores a web_search_tool_result error payload (not an array)", async () => {
    mockAnthropic([
      { type: "text", text: "Insight tanpa search." },
      { type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
    ]);
    const { getNodeInsight } = await import("./nodeInsight");
    const result = await getNodeInsight("key", "claude-sonnet-5", { typeLabel: "Kerjaan", label: "Revisi laporan", fields: [] });

    expect(result.sources).toEqual([]);
    expect(result.text).toBe("Insight tanpa search.");
  });

  it("falls back to a placeholder when there's no text block at all", async () => {
    mockAnthropic([]);
    const { getNodeInsight } = await import("./nodeInsight");
    const result = await getNodeInsight("key", "claude-sonnet-5", { typeLabel: "Kerjaan", label: "x", fields: [] });
    expect(result.text).toBe("Nggak ada insight buat ini.");
  });

  it("passes model-appropriate request extras (no effort param for Haiku)", async () => {
    const create = mockAnthropic([{ type: "text", text: "ok" }]);
    const { getNodeInsight } = await import("./nodeInsight");

    await getNodeInsight("key", "claude-haiku-4-5", { typeLabel: "Kerjaan", label: "x", fields: [] });
    expect(create.mock.calls[0][0].output_config).toBeUndefined();

    await getNodeInsight("key", "claude-sonnet-5", { typeLabel: "Kerjaan", label: "x", fields: [] });
    expect(create.mock.calls[1][0].output_config).toEqual({ effort: "low" });
  });
});
