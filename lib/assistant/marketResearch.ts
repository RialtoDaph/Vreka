import Anthropic from "@anthropic-ai/sdk";
import { modelRequestExtras } from "@/lib/assistant/run";
import { webSearchTool, extractTextAndSources, type WebSearchSource } from "@/lib/assistant/webSearchInsight";

export type MarketResearch = { text: string; sources: WebSearchSource[] };

// Single-shot like getNodeInsight, but standalone (no node/user data to
// reference) -- the Keuangan page's "Riset Pasar" panel just wants a real,
// web-search-backed read on gold/USD-EUR and one notable tech-industry
// headline, not a full chat turn.
export async function getMarketResearch(apiKey: string, model: string): Promise<MarketResearch> {
  const anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model,
    max_tokens: 600,
    tools: [webSearchTool(3)],
    messages: [
      {
        role: "user",
        content:
          "Cari info pasar terkini yang relevan buat orang yang lagi nabung & mikirin investasi: harga emas hari ini (tren naik/turun singkat), kurs USD/EUR hari ini, dan satu berita industri teknologi yang cukup signifikan minggu ini. Ringkas jadi 3-4 kalimat total (Bahasa Indonesia santai), to the point, tanpa basa-basi pembuka. Wajib pake web search buat semua angka/berita ini -- kalau salah satu nggak ketemu, bilang aja nggak ketemu, jangan ngarang. Jangan sebut atau rujuk foto/gambar apa pun (misal \"lihat foto 1\") -- panel ini cuma nampilin teks, jadi jelasin semuanya pake kata-kata aja.",
      },
    ],
    ...modelRequestExtras(model),
  });

  const { text, sources } = extractTextAndSources(response.content, 3);
  return { text: text || "Nggak nemu info pasar hari ini.", sources };
}
