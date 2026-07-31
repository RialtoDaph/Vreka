export const ASSISTANT_MODELS = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5", tagline: "Paling cepat & hemat" },
  { id: "claude-sonnet-5", label: "Sonnet 5", tagline: "Seimbang (rekomendasi)" },
  { id: "claude-opus-5", label: "Opus 5", tagline: "Paling pintar, paling mahal" },
] as const;

export type AssistantModelId = (typeof ASSISTANT_MODELS)[number]["id"];

export const DEFAULT_ASSISTANT_MODEL: AssistantModelId = "claude-sonnet-5";

export function isValidAssistantModel(value: unknown): value is AssistantModelId {
  return ASSISTANT_MODELS.some((m) => m.id === value);
}
