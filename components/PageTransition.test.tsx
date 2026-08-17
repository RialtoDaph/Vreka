// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import PageTransition from "./PageTransition";

const pathHolder = vi.hoisted(() => ({ path: "/dashboard/keuangan" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathHolder.path,
}));

afterEach(() => {
  cleanup();
});

describe("PageTransition", () => {
  it("wraps children in the page-in animation class", () => {
    render(
      <PageTransition>
        <p>Konten halaman</p>
      </PageTransition>
    );

    expect(screen.getByText("Konten halaman")).toBeInTheDocument();
    expect(screen.getByText("Konten halaman").parentElement).toHaveClass("animate-page-in");
  });

  it("remounts (fresh animation) when the path changes", () => {
    const { rerender } = render(
      <PageTransition>
        <p data-testid="child">A</p>
      </PageTransition>
    );
    const first = screen.getByTestId("child");

    pathHolder.path = "/dashboard/kerjaan";
    rerender(
      <PageTransition>
        <p data-testid="child">B</p>
      </PageTransition>
    );

    // A genuine remount (not just a prop update) is what re-triggers the
    // CSS animation on navigation -- the DOM node identity must change.
    expect(screen.getByTestId("child")).not.toBe(first);
  });
});
