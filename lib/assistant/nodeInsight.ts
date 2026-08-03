import Anthropic from "@anthropic-ai/sdk";
import { modelRequestExtras } from "@/lib/assistant/run";
import { webSearchTool, extractTextAndSources, type WebSearchSource } from "@/lib/assistant/webSearchInsight";

export type NodeInsightSource = WebSearchSource;
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
    tools: [webSearchTool(2)],
    messages: [
      {
        role: "user",
        content: `Data user: [${input.typeLabel}] "${input.label}"${fieldsText ? ` (${fieldsText})` : ""}. Kasih satu insight atau tip singkat (2-3 kalimat, Bahasa Indonesia santai) yang relevan buat data spesifik ini. Boleh pake web search kalau butuh patokan/info dari luar (misal aturan umum finansial, teknik belajar, dll) -- tapi kalau nggak perlu, jawab langsung dari pengetahuan kamu aja. Langsung ke insight-nya, tanpa basa-basi pembuka.`,
      },
    ],
    ...modelRequestExtras(model),
  });

  const { text, sources } = extractTextAndSources(response.content, 2);
  return { text: text || "Nggak ada insight buat ini.", sources };
}
