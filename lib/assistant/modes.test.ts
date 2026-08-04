import { describe, expect, it } from "vitest";
import { ASLAN_MODES, DEFAULT_ASLAN_MODE, detectModeCommand, getAslanMode, isValidAslanMode } from "./modes";
import { isValidAssistantModel } from "./models";

describe("ASLAN_MODES", () => {
  it("has exactly the four designed modes", () => {
    expect(ASLAN_MODES.map((m) => m.id)).toEqual(["santai", "fokus", "intel", "ultra"]);
  });

  it("every mode's primary/secondary model exists in the model catalog", () => {
    for (const mode of ASLAN_MODES) {
      expect(isValidAssistantModel(mode.primaryModel)).toBe(true);
      if (mode.secondaryModel) expect(isValidAssistantModel(mode.secondaryModel)).toBe(true);
    }
  });

  it("only santai uses the realtime voice engine", () => {
    const realtimeModes = ASLAN_MODES.filter((m) => m.voiceEngine === "realtime").map((m) => m.id);
    expect(realtimeModes).toEqual(["santai"]);
  });

  it("only Claude-backed modes skip a secondary consult provider", () => {
    for (const mode of ASLAN_MODES) {
      if (mode.primaryProvider === "anthropic") continue;
      if (mode.id === "ultra") continue; // Ultra is intentionally single-brain
      expect(mode.secondaryProvider).toBeDefined();
    }
  });

  it("assigns every mode a distinct color token", () => {
    const tokens = ASLAN_MODES.map((m) => m.colorToken);
    expect(new Set(tokens).size).toBe(tokens.length);
  });
});

describe("isValidAslanMode / getAslanMode", () => {
  it("accepts known mode ids and rejects unknown ones", () => {
    expect(isValidAslanMode("fokus")).toBe(true);
    expect(isValidAslanMode("chaos")).toBe(false);
    expect(isValidAslanMode(undefined)).toBe(false);
  });

  it("falls back to the default mode for an unknown id", () => {
    expect(getAslanMode("nonsense").id).toBe(DEFAULT_ASLAN_MODE);
  });

  it("defaults to intel so tool-calling keeps working for anyone who never picks a mode", () => {
    expect(DEFAULT_ASLAN_MODE).toBe("intel");
    expect(getAslanMode(DEFAULT_ASLAN_MODE).primaryProvider).toBe("anthropic");
  });
});

describe("detectModeCommand", () => {
  it("detects an explicit command phrase in either word order", () => {
    expect(detectModeCommand("ganti mode ke fokus dong")).toBe("fokus");
    expect(detectModeCommand("santai mode aja ya")).toBe("santai");
    expect(detectModeCommand("pindah ke mode intel")).toBe("intel");
    expect(detectModeCommand("mode ultra")).toBe("ultra");
  });

  it("is case-insensitive", () => {
    expect(detectModeCommand("GANTI MODE KE SANTAI")).toBe("santai");
  });

  it("does not fire on a casual mention of the word without 'mode' next to it", () => {
    expect(detectModeCommand("santai aja sih gak usah buru-buru")).toBeNull();
    expect(detectModeCommand("gimana caranya biar tetep fokus belajar")).toBeNull();
  });

  it("returns null for ordinary conversation", () => {
    expect(detectModeCommand("catet pengeluaran 50rb makan siang")).toBeNull();
  });
});
