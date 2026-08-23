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
  it("defaults to dark when nothing is stored, even if the OS prefers light", async () => {
    mockMatchMedia(true); // OS prefers light -- must NOT leak through as the default
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    expect(await screen.findByTestId("resolved")).toHaveTextContent("dark");
    expect(screen.getByTestId("preference")).toHaveTextContent("dark");
  });

  it("follows the OS preference only once Sistem is explicitly chosen", async () => {
    mockMatchMedia(true); // OS prefers light
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(await screen.findByTestId("resolved")).toHaveTextContent("dark");

    fireEvent.click(screen.getByText("Sistem"));

    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
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

  it("persists every explicit choice, including Sistem -- an absent key means never chosen, not system", async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    fireEvent.click(await screen.findByText("Terang"));
    expect(window.localStorage.getItem("vreka-theme")).toBe("light");

    fireEvent.click(screen.getByText("Sistem"));
    expect(window.localStorage.getItem("vreka-theme")).toBe("system");
  });

  it("tracks a live OS preference change once Sistem is selected", async () => {
    const { fireChange } = mockMatchMedia(false);
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    fireEvent.click(await screen.findByText("Sistem"));
    expect(screen.getByTestId("resolved")).toHaveTextContent("dark");

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

  it("reloads back into the stored Sistem preference on a fresh mount", async () => {
    window.localStorage.setItem("vreka-theme", "system");
    mockMatchMedia(true); // OS prefers light
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );

    expect(await screen.findByTestId("preference")).toHaveTextContent("system");
    expect(screen.getByTestId("resolved")).toHaveTextContent("light");
  });
});

describe("useTheme", () => {
  it("throws when used outside a ThemeProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/ThemeProvider/);
    spy.mockRestore();
  });
});
