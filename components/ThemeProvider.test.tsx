// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ThemeProvider, useTheme } from "./ThemeProvider";

function mockMatchMedia(prefersLight: boolean) {
  const listeners: (() => void)[] = [];
  window.matchMedia = vi.fn().mockReturnValue({
    matches: prefersLight,
    addEventListener: (_: string, cb: () => void) => listeners.push(cb),
    removeEventListener: () => {},
  });
  return { fireChange: () => listeners.forEach((cb) => cb()) };
}

function Probe() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  return (
    <div>
      <p data-testid="preference">{preference}</p>
      <p data-testid="resolved">{resolvedTheme}</p>
      <button onClick={() => setPreference("dark")}>Gelap</button>
      <button onClick={() => setPreference("light")}>Terang</button>
      <button onClick={() => setPreference("system")}>Sistem</button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
});

beforeEach(() => {
  mockMatchMedia(false);
});

describe("ThemeProvider", () => {
  it("defaults to system, resolved via the OS preference, when nothing is stored", async () => {
    mockMatchMedia(true); // OS prefers light
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    expect(await screen.findByTestId("resolved")).toHaveTextContent("light");
    expect(screen.getByTestId("preference")).toHaveTextContent("system");
  });

  it("uses a stored explicit preference over the OS setting", async () => {
    window.localStorage.setItem("vreka-theme", "dark");
    mockMatchMedia(true); // OS prefers light, but the explicit choice should win
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    expect(await screen.findByTestId("resolved")).toHaveTextContent("dark");
  });

  it("stamps data-theme on <html> so CSS custom properties pick it up", async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    fireEvent.click(await screen.findByText("Terang"));
    expect(document.documentElement.dataset.theme).toBe("light");

    fireEvent.click(screen.getByText("Gelap"));
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("persists an explicit choice and clears storage when switching back to system", async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    fireEvent.click(await screen.findByText("Terang"));
    expect(window.localStorage.getItem("vreka-theme")).toBe("light");

    fireEvent.click(screen.getByText("Sistem"));
    expect(window.localStorage.getItem("vreka-theme")).toBeNull();
  });

  it("tracks a live OS preference change while set to system", async () => {
    const { fireChange } = mockMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    expect(await screen.findByTestId("resolved")).toHaveTextContent("dark");

    // Simulate the OS flipping to light, then fire the change listener the
    // component registered against the *original* matchMedia() result --
    // the handler re-queries matchMedia fresh at call time, so it picks up
    // this new value.
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    fireChange();

    expect(await screen.findByTestId("resolved")).toHaveTextContent("light");
  });
});

describe("useTheme", () => {
  it("throws when used outside a ThemeProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});
