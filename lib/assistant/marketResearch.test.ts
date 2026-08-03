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

describe("getMarketResearch", () => {
  it("returns the text block joined, with no sources when there's no web_search_tool_result", async () => {
    mockAnthropic([{ type: "text", text: "Harga emas naik tipis hari ini." }]);
    const { getMarketResearch } = await import("./marketResearch");
    const result = await getMarketResearch("key", "claude-sonnet-5");

    expect(result.text).toBe("Harga emas naik tipis hari ini.");
    expect(result.sources).toEqual([]);
  });

  it("extracts up to 3 deduped sources from web_search_tool_result blocks", async () => {
    mockAnthropic([
      { type: "text", text: "Ringkasan pasar hari ini." },
      {
        type: "web_search_tool_result",
        content: [
          { type: "web_search_result", url: "https://www.kitco.com/gold-price", title: "Gold price" },
          { type: "web_search_result", url: "https://www.kitco.com/gold-price", title: "dup" },
          { type: "web_search_result", url: "https://xe.com/usd-eur", title: "USD/EUR" },
          { type: "web_search_result", url: "https://techcrunch.com/news", title: "Tech news" },
          { type: "web_search_result", url: "https://example.com/extra", title: "should be dropped, cap is 3" },
        ],
      },
    ]);
    const { getMarketResearch } = await import("./marketResearch");
    const result = await getMarketResearch("key", "claude-sonnet-5");

    expect(result.sources).toEqual([
      { label: "kitco.com", url: "https://www.kitco.com/gold-price" },
      { label: "xe.com", url: "https://xe.com/usd-eur" },
      { label: "techcrunch.com", url: "https://techcrunch.com/news" },
    ]);
  });

  it("falls back to a placeholder when there's no text block at all", async () => {
    mockAnthropic([]);
    const { getMarketResearch } = await import("./marketResearch");
    const result = await getMarketResearch("key", "claude-sonnet-5");
    expect(result.text).toBe("Nggak nemu info pasar hari ini.");
  });

  it("passes model-appropriate request extras (no effort param for Haiku)", async () => {
    const create = mockAnthropic([{ type: "text", text: "ok" }]);
    const { getMarketResearch } = await import("./marketResearch");

    await getMarketResearch("key", "claude-haiku-4-5");
    expect(create.mock.calls[0][0].output_config).toBeUndefined();

    await getMarketResearch("key", "claude-sonnet-5");
    expect(create.mock.calls[1][0].output_config).toEqual({ effort: "low" });
  });
});
