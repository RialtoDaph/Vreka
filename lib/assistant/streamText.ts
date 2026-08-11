// Reads a streaming fetch Response's body as text, decoding chunks as they
// arrive and handing each non-empty one to `onChunk`. Shared by every
// caller of the streaming /api/assistant/chat endpoint (the text chat
// page, the voice hook) so the reader/decoder/loop boilerplate -- and any
// future fix to it -- lives in exactly one place instead of two drifting
// copies.
export async function readTextStream(
  res: Response,
  onChunk: (chunk: string) => void
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Response tanpa body.");
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) onChunk(chunk);
  }
}
