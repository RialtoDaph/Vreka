import { describe, expect, it } from "vitest";
import { readTextStream } from "@/lib/assistant/streamText";

function responseFromChunks(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream);
}

describe("readTextStream", () => {
  it("hands each decoded chunk to the callback in order", async () => {
    const received: string[] = [];
    await readTextStream(responseFromChunks(["Halo ", "dunia", "!"]), (chunk) => {
      received.push(chunk);
    });
    expect(received).toEqual(["Halo ", "dunia", "!"]);
  });

  it("does nothing for a body that closes immediately", async () => {
    const received: string[] = [];
    await readTextStream(responseFromChunks([]), (chunk) => received.push(chunk));
    expect(received).toEqual([]);
  });

  it("throws when the response has no body", async () => {
    const res = new Response(null);
    await expect(readTextStream(res, () => {})).rejects.toThrow("Response tanpa body.");
  });
});
