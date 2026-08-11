import { afterEach, describe, expect, it, vi } from "vitest";
import { createAudioQueue, extractSentences, pickFiller } from "@/lib/assistant/useVoiceAssistant";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("pickFiller", () => {
  it("never repeats the just-used phrase when the pool has an alternative", () => {
    const pool = ["a", "b", "c"];
    vi.spyOn(Math, "random").mockReturnValue(0); // would pick index 0 ("a") if not excluded
    expect(pickFiller(pool, "a")).not.toBe("a");
  });

  it("falls back to the full pool when there's nothing else to pick", () => {
    expect(pickFiller(["only"], "only")).toBe("only");
  });

  it("picks freely from the whole pool when there's no prior phrase to avoid", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(pickFiller(["a", "b", "c"], null)).toBe("a");
  });
});

describe("extractSentences", () => {
  it("extracts nothing from an empty or still-incomplete buffer", () => {
    expect(extractSentences("")).toEqual({ sentences: [], remainder: "" });
    expect(extractSentences("Lagi mikir")).toEqual({ sentences: [], remainder: "Lagi mikir" });
  });

  it("extracts a single complete sentence and keeps the rest buffered", () => {
    const { sentences, remainder } = extractSentences("Saldo kamu positif. Sisanya lagi ");
    expect(sentences).toEqual(["Saldo kamu positif."]);
    expect(remainder).toBe("Sisanya lagi ");
  });

  it("extracts every complete sentence as soon as its whitespace arrives", () => {
    const { sentences, remainder } = extractSentences(
      "Oke, aku catet ya! Udah beres. Ada lagi yang mau "
    );
    expect(sentences).toEqual(["Oke, aku catet ya!", "Udah beres."]);
    expect(remainder).toBe("Ada lagi yang mau ");
  });

  it("treats a newline as a sentence boundary", () => {
    const { sentences, remainder } = extractSentences("Baris pertama\nBaris kedua yang belum kelar");
    expect(sentences).toEqual(["Baris pertama"]);
    expect(remainder).toBe("Baris kedua yang belum kelar");
  });

  it("doesn't split a grouped/decimal number like a sentence", () => {
    const { sentences, remainder } = extractSentences("Total belanja 50.000 rupiah hari ini");
    expect(sentences).toEqual([]);
    expect(remainder).toBe("Total belanja 50.000 rupiah hari ini");
  });

  it("holds off on a bare numbered-list marker instead of speaking it alone", () => {
    // "1." alone isn't a real sentence -- extractSentences waits rather than
    // emitting a two-character clip; the caller flushes it as one chunk
    // once the stream ends, same as any other never-confidently-split text.
    const { sentences, remainder } = extractSentences("1. Item pertama\n2. Item kedua\n");
    expect(sentences).toEqual([]);
    expect(remainder).toBe("1. Item pertama\n2. Item kedua\n");
  });

  it("extracts a short acknowledgement sentence immediately instead of stalling on it", () => {
    // Aslan's system prompt mandates brief/casual replies -- "Oke." on its
    // own is a complete, ordinary sentence (unlike "1."), and needs to
    // stream right away rather than blocking every sentence behind it.
    const { sentences, remainder } = extractSentences("Oke. Nanti aku ingetin jam 5 sore ya.");
    expect(sentences).toEqual(["Oke."]);
    expect(remainder).toBe("Nanti aku ingetin jam 5 sore ya.");
  });
});

describe("createAudioQueue", () => {
  it("yields pushed items in order, awaiting each promise for the consumer", async () => {
    const queue = createAudioQueue();
    const blobA = new Blob(["a"]);
    const blobB = new Blob(["b"]);
    queue.push(Promise.resolve(blobA));
    queue.push(Promise.resolve(blobB));
    queue.close();

    const received: (Blob | null)[] = [];
    for await (const item of queue.consume()) received.push(item);

    expect(received).toEqual([blobA, blobB]);
  });

  it("lets a consumer that's already iterating pick up items pushed later", async () => {
    const queue = createAudioQueue();
    const blobA = new Blob(["a"]);
    queue.push(Promise.resolve(blobA));

    const received: (Blob | null)[] = [];
    const consuming = (async () => {
      for await (const item of queue.consume()) received.push(item);
    })();

    // Give the consumer a tick to drain the first item and start waiting.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const blobB = new Blob(["b"]);
    queue.push(Promise.resolve(blobB));
    queue.close();
    await consuming;

    expect(received).toEqual([blobA, blobB]);
  });

  it("passes through a null item (a failed TTS call) instead of dropping it", async () => {
    const queue = createAudioQueue();
    queue.push(Promise.resolve(null));
    queue.close();

    const received: (Blob | null)[] = [];
    for await (const item of queue.consume()) received.push(item);

    expect(received).toEqual([null]);
  });

  it("stops iteration once closed with no more items, without hanging", async () => {
    const queue = createAudioQueue();
    queue.close();

    const received: (Blob | null)[] = [];
    for await (const item of queue.consume()) received.push(item);

    expect(received).toEqual([]);
  });
});
