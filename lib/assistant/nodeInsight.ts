import Anthropic from "@anthropic-ai/sdk";
import { modelRequestExtras } from "@/lib/assistant/run";

export type NodeInsightSource = { label: string; url: string };
export type NodeInsight = { text: string; sources: NodeInsightSource[] };

export type NodeInsightInput = {
  typeLabel: string;
  label: string;
  fields: { k: string; v: string }[];
};

// Single-shot (no history, no custom tools) -- the Memory Map's "Riset
// Aslan" panel just wants a short contextual note about whatever node the
// user clicked, not a full chat turn. Kept separate from runAssistantChat
// on purpose: reusing that would drag in message history persistence and
// the whole custom-tool loop for something that's neither.
const WEB_SEARCH_TOOL: Anthropic.WebSearchTool20260209 = {
  type: "web_search_20260209",
  name: "web_search",
  max_uses: 2,
};

function sourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export async function getNodeInsight(
  apiKey: string,
  model: string,
  input: NodeInsightInput
): Promise<NodeInsight> {
  const anthropic = new Anthropic({ apiKey });
  const fieldsText = input.fields.map((f) => `${f.k}: ${f.v}`).join(", ");

  const response = await anthropic.messages.create({
    model,
    max_tokens: 500,
    tools: [WEB_SEARCH_TOOL],
    messages: [
      {
        role: "user",
        content: `Data user: [${input.typeLabel}] "${input.label}"${fieldsText ? ` (${fieldsText})` : ""}. Kasih satu insight atau tip singkat (2-3 kalimat, Bahasa Indonesia santai) yang relevan buat data spesifik ini. Boleh pake web search kalau butuh patokan/info dari luar (misal aturan umum finansial, teknik belajar, dll) -- tapi kalau nggak perlu, jawab langsung dari pengetahuan kamu aja. Langsung ke insight-nya, tanpa basa-basi pembuka.`,
      },
    ],
    ...modelRequestExtras(model),
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();

  const sources: NodeInsightSource[] = [];
  const seenUrls = new Set<string>();
  for (const block of response.content) {
    if (block.type !== "web_search_tool_result" || !Array.isArray(block.content)) continue;
    for (const result of block.content) {
      if (seenUrls.has(result.url)) continue;
      seenUrls.add(result.url);
      sources.push({ label: sourceLabel(result.url), url: result.url });
      if (sources.length >= 2) break;
    }
    if (sources.length >= 2) break;
  }

  return { text: text || "Nggak ada insight buat ini.", sources };
}
