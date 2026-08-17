// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import BottomNav from "./BottomNav";

const pathHolder = vi.hoisted(() => ({ path: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => pathHolder.path,
}));

afterEach(() => {
  cleanup();
});

describe("BottomNav", () => {
  it("shows the 4 primary modules plus a Lainnya tab", () => {
    pathHolder.path = "/dashboard";
    render(<BottomNav />);

    expect(screen.getByText("Memory Map")).toBeInTheDocument();
    expect(screen.getByText("Keuangan")).toBeInTheDocument();
    expect(screen.getByText("Kerjaan")).toBeInTheDocument();
    expect(screen.getByText("Kalender")).toBeInTheDocument();
    expect(screen.getByText("Lainnya")).toBeInTheDocument();
    // Everything else is tucked behind "Lainnya", not shown as its own tab.
    expect(screen.queryByText("Jurnal")).not.toBeInTheDocument();
  });

  it("highlights the active primary tab based on the current path", () => {
    pathHolder.path = "/dashboard/keuangan";
    render(<BottomNav />);

    expect(screen.getByText("Keuangan").closest("a")).toHaveClass("text-cyan-glow");
    expect(screen.getByText("Kerjaan").closest("a")).not.toHaveClass("text-cyan-glow");
  });

  it("opens a sheet with the remaining modules when Lainnya is tapped", () => {
    pathHolder.path = "/dashboard/keuangan";
    render(<BottomNav />);

    expect(screen.queryByText("Jurnal")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Menu lainnya"));

    expect(screen.getByText("Jurnal")).toBeInTheDocument();
    expect(screen.getByText("Timeline")).toBeInTheDocument();
    expect(screen.getByText("Aslan")).toBeInTheDocument();
    expect(screen.getByText("AI Core")).toBeInTheDocument();
    expect(screen.getByText("Canvas")).toBeInTheDocument();
    expect(screen.getByText("Pelajaran")).toBeInTheDocument();
    expect(screen.getByText("Ringkasan")).toBeInTheDocument();
  });

  it("closes the sheet when the backdrop is clicked", () => {
    pathHolder.path = "/dashboard";
    render(<BottomNav />);

    fireEvent.click(screen.getByLabelText("Menu lainnya"));
    expect(screen.getByText("Jurnal")).toBeInTheDocument();

    // The backdrop is the outer overlay div (onClick closes); clicking the
    // sheet content itself must NOT close it (stopPropagation), so target
    // the backdrop specifically via its distinguishing classes.
    const backdrop = document.querySelector(".bg-void\\/75") as HTMLElement;
    fireEvent.click(backdrop);

    expect(screen.queryByText("Jurnal")).not.toBeInTheDocument();
  });

  it("highlights Lainnya when the active route is one of the tucked-away modules", () => {
    pathHolder.path = "/dashboard/jurnal";
    render(<BottomNav />);

    expect(screen.getByLabelText("Menu lainnya")).toHaveClass("text-cyan-glow");
  });

  it("closes the sheet when Escape is pressed, for keyboard users who can't tap the backdrop", () => {
    pathHolder.path = "/dashboard";
    render(<BottomNav />);

    fireEvent.click(screen.getByLabelText("Menu lainnya"));
    expect(screen.getByText("Jurnal")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByText("Jurnal")).not.toBeInTheDocument();
  });

  it("closes the sheet via its own visible Tutup button", () => {
    pathHolder.path = "/dashboard";
    render(<BottomNav />);

    fireEvent.click(screen.getByLabelText("Menu lainnya"));
    fireEvent.click(screen.getByLabelText("Tutup"));

    expect(screen.queryByText("Jurnal")).not.toBeInTheDocument();
  });
});
