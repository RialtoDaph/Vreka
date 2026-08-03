import Anthropic from "@anthropic-ai/sdk";

export type WebSearchSource = { label: string; url: string };

export function webSearchTool(maxUses: number): Anthropic.WebSearchTool20260209 {
  return { type: "web_search_20260209", name: "web_search", max_uses: maxUses };
}

function sourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Shared by every single-shot web-search-backed insight (node insight,
// market research, ...): joins the text blocks and pulls up to
// `maxSources` deduped source URLs out of any web_search_tool_result block.
export function extractTextAndSources(
  content: Anthropic.ContentBlock[],
  maxSources: number
): { text: string; sources: WebSearchSource[] } {
  const text = content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();

  const sources: WebSearchSource[] = [];
  const seenUrls = new Set<string>();
  for (const block of content) {
    if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
    for (const result of block.content) {
      if (seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);
      sources.push({ label: sourceLabel(result.url), url: result.url });
      if (sources.length >= maxSources) break;
    }
    if (sources.length >= maxSources) break;
  }
  return { text, sources };
}
