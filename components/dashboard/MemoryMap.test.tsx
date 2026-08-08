// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { MemoryMapData } from "@/lib/memoryMap";
import type { MemoryMapVitals } from "./MemoryMap";

// jsdom has no WebGL context -- MemoryMap's mount effect already catches
// that and falls back to a non-3D render, so no need to mock "three" itself.
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
  Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
  window.localStorage.clear();
});

vi.mock("@/components/SignOutButton", () => ({ default: () => <div>SignOutButton</div> }));
// AslanInbox is its own component with its own test file -- mocked here so
// this file doesn't also need a real Supabase client for its audit-log
// fetch, which is unrelated to what's under test in this file (the toolbar).
vi.mock("@/components/dashboard/AslanInbox", () => ({ default: () => null }));

type VoiceMock = {
  supported?: boolean;
  errorMsg?: string | null;
  toggle?: () => void;
  handsFreeSupported?: boolean;
  handsFreeMode?: boolean;
  toggleHandsFree?: () => void;
  lastReply?: string | null;
};

function mockVoice({
  supported = true,
  errorMsg = null,
  toggle = vi.fn(),
  handsFreeSupported = true,
  handsFreeMode = false,
  toggleHandsFree = vi.fn(),
  lastReply = null,
}: VoiceMock = {}) {
  vi.doMock("@/lib/assistant/useVoiceAssistant", () => ({
    useVoiceAssistant: () => ({
      supported,
      phase: "idle",
      errorMsg,
      toggle,
      sendText: vi.fn(),
      audioRef: { current: null },
      mode: "intel",
      setMode: vi.fn(),
      lastReply,
      handsFreeSupported,
      handsFreeMode,
      toggleHandsFree,
    }),
  }));
  return { toggle, toggleHandsFree };
}

type GptRealtimeMock = {
  phase?: "idle" | "listening" | "speaking" | "error";
  errorMsg?: string | null;
  toggle?: () => void;
};

function mockGptRealtime({ phase = "idle", errorMsg = null, toggle = vi.fn() }: GptRealtimeMock = {}) {
  vi.doMock("@/lib/assistant/useGptRealtime", () => ({
    useGptRealtime: () => ({
      phase,
      errorMsg,
      lastReply: null,
      audioRef: { current: null },
      toggle,
    }),
  }));
  return { toggle };
}

const DATA: MemoryMapData = { nodes: [], edges: [] };
const VITALS: MemoryMapVitals = {
  memoryCount: 0,
  integrationsConnected: 0,
  integrationsTotal: 3,
  hasOverdueTask: false,
  dailyActivity: [],
};

describe("MemoryMap toolbar (relocated from Aslan page)", () => {
  it("starts and stops screen share, showing the active banner while sharing", async () => {
    mockVoice();
    mockGptRealtime();
    const stop = vi.fn();
    const addEventListener = vi.fn();
    const getDisplayMedia = vi.fn().mockResolvedValue({
      getTracks: () => [{ stop }],
      getVideoTracks: () => [{ addEventListener }],
    });
    Object.defineProperty(navigator, "mediaDevices", { value: { getDisplayMedia }, configurable: true });

    const { default: MemoryMap } = await import("./MemoryMap");
    render(<MemoryMap data={DATA} vitals={VITALS} />);

    fireEvent.click(await screen.findByLabelText("Share screen ke Aslan"));
    expect(await screen.findByText(/Screen share aktif/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Matiin screen share"));
    expect(stop).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Screen share aktif/)).not.toBeInTheDocument();
  });

  it("shows an error and stays inactive when the browser denies screen share", async () => {
    mockVoice();
    mockGptRealtime();
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getDisplayMedia: vi.fn().mockRejectedValue(new Error("NotAllowedError")) },
      configurable: true,
    });

    const { default: MemoryMap } = await import("./MemoryMap");
    render(<MemoryMap data={DATA} vitals={VITALS} />);

    fireEvent.click(await screen.findByLabelText("Share screen ke Aslan"));
    expect(await screen.findByText(/Gagal mulai screen share/)).toBeInTheDocument();
    expect(screen.queryByText(/Screen share aktif/)).not.toBeInTheDocument();
  });

  it("opens a quick-peek of the Aslan page from the tools icon", async () => {
    mockVoice();
    mockGptRealtime();
    const { default: MemoryMap } = await import("./MemoryMap");
    render(<MemoryMap data={DATA} vitals={VITALS} />);

    fireEvent.click(await screen.findByLabelText("Tools & Integrasi"));
    const openFullLink = await screen.findByRole("link", { name: /Buka penuh/ });
    expect(openFullLink).toHaveAttribute("href", "/dashboard/asisten");
  });

  it("toggles hands-free mode from the toolbar", async () => {
    const { toggleHandsFree } = mockVoice({ handsFreeMode: false });
    mockGptRealtime();
    const { default: MemoryMap } = await import("./MemoryMap");
    render(<MemoryMap data={DATA} vitals={VITALS} />);

    fireEvent.click(await screen.findByLabelText(/nyalain mode hands-free/i));
    expect(toggleHandsFree).toHaveBeenCalledTimes(1);
  });

  it("hides the hands-free icon when the browser doesn't support wake-word listening", async () => {
    mockVoice({ handsFreeSupported: false });
    mockGptRealtime();
    const { default: MemoryMap } = await import("./MemoryMap");
    render(<MemoryMap data={DATA} vitals={VITALS} />);

    await screen.findByLabelText("Tools & Integrasi");
    expect(screen.queryByLabelText(/mode hands-free/i)).not.toBeInTheDocument();
  });

  it("toggles voice mode from the toolbar mic icon", async () => {
    const { toggle } = mockVoice();
    mockGptRealtime();
    const { default: MemoryMap } = await import("./MemoryMap");
    render(<MemoryMap data={DATA} vitals={VITALS} />);

    fireEvent.click(await screen.findByLabelText("Mode suara"));
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("hides the mic icon when the browser doesn't support voice mode", async () => {
    mockVoice({ supported: false });
    mockGptRealtime();
    const { default: MemoryMap } = await import("./MemoryMap");
    render(<MemoryMap data={DATA} vitals={VITALS} />);

    await screen.findByLabelText("Tools & Integrasi");
    expect(screen.queryByLabelText("Mode suara")).not.toBeInTheDocument();
  });

  it("starts a GPT real-time session from the toolbar's lightning icon", async () => {
    mockVoice();
    const { toggle } = mockGptRealtime({ phase: "idle" });
    const { default: MemoryMap } = await import("./MemoryMap");
    render(<MemoryMap data={DATA} vitals={VITALS} />);

    fireEvent.click(await screen.findByLabelText("Ngobrol real-time sama Aslan"));
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it("shows the GPT real-time button as active while a session is live", async () => {
    mockVoice();
    mockGptRealtime({ phase: "listening" });
    const { default: MemoryMap } = await import("./MemoryMap");
    render(<MemoryMap data={DATA} vitals={VITALS} />);

    expect(await screen.findByLabelText("Stop ngobrol sama Aslan")).toBeInTheDocument();
  });

  it("shows an error message when the GPT real-time session fails", async () => {
    mockVoice();
    mockGptRealtime({ phase: "error", errorMsg: "Gagal mulai GPT real-time." });
    const { default: MemoryMap } = await import("./MemoryMap");
    render(<MemoryMap data={DATA} vitals={VITALS} />);

    expect(await screen.findByText("Gagal mulai GPT real-time.")).toBeInTheDocument();
  });

  it("shows Aslan's last voice reply above the ask bar", async () => {
    mockVoice({ lastReply: "Tiga jadwal besok, sir." });
    mockGptRealtime();
    const { default: MemoryMap } = await import("./MemoryMap");
    render(<MemoryMap data={DATA} vitals={VITALS} />);

    expect(await screen.findByText("Tiga jadwal besok, sir.")).toBeInTheDocument();
  });

  // The top toolbar (Focus Mode + memory-type filter toggles) only renders
  // once the WebGL scene mounts successfully, which jsdom can't do -- same
  // reason no test here ever covered the old filter dropdown either.
});
