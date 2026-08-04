export type AssistantProvider = "anthropic" | "openai" | "gemini" | "grok";

// Non-Anthropic providers only do plain conversation right now -- Aslan's
// tool-calling (nyatet transaksi, nambah tugas, dst) and web search stay
// Claude-only, since replicating that tool loop across four different
// function-calling formats is a much bigger project than a model switcher.
export const ASSISTANT_MODELS = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5", tagline: "Paling cepat & hemat", provider: "anthropic" },
  { id: "claude-sonnet-5", label: "Sonnet 5", tagline: "Seimbang (rekomendasi)", provider: "anthropic" },
  { id: "claude-opus-5", label: "Opus 5", tagline: "Paling pintar, paling mahal", provider: "anthropic" },
  { id: "gpt-5.6-sol", label: "GPT 5.6 Sol", tagline: "OpenAI — mode obrolan aja, tanpa tools Vreka", provider: "openai" },
  { id: "gemini-3.6-flash", label: "Gemini 3.6 Flash", tagline: "Google — mode obrolan aja, tanpa tools Vreka", provider: "gemini" },
  { id: "grok-4.5", label: "Grok 4.5", tagline: "xAI — mode obrolan aja, tanpa tools Vreka", provider: "grok" },
] as const;

export type AssistantModelId = (typeof ASSISTANT_MODELS)[number]["id"];

export const DEFAULT_ASSISTANT_MODEL: AssistantModelId = "claude-sonnet-5";

export function isValidAssistantModel(value: unknown): value is AssistantModelId {
  return ASSISTANT_MODELS.some((m) => m.id === value);
}

export function providerForModel(model: string): AssistantProvider {
  return ASSISTANT_MODELS.find((m) => m.id === model)?.provider ?? "anthropic";
}

// Which env var holds the API key for a given provider -- kept in one place
// so the chat route, the /api/assistant/providers status check, and any
// future caller all agree on the same names.
export const PROVIDER_ENV_VAR: Record<AssistantProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  grok: "XAI_API_KEY",
};
