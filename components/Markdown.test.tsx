// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import Markdown from "./Markdown";

afterEach(() => cleanup());

describe("Markdown", () => {
  it("renders headings, bold, and links", () => {
    render(<Markdown>{"# Judul\n\n**penting** dan [tautan](https://example.com)"}</Markdown>);

    expect(screen.getByRole("heading", { level: 1, name: "Judul" })).toBeInTheDocument();
    expect(screen.getByText("penting").tagName).toBe("STRONG");
    const link = screen.getByRole("link", { name: "tautan" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders GFM task lists as read-only checkboxes", () => {
    render(<Markdown>{"- [x] Selesai\n- [ ] Belum"}</Markdown>);

    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes[0].checked).toBe(true);
    expect(boxes[0]).toBeDisabled();
    expect(boxes[1].checked).toBe(false);
  });

  it("renders fenced code blocks", () => {
    render(<Markdown>{"```\nconst x = 1;\n```"}</Markdown>);
    expect(screen.getByText("const x = 1;")).toBeInTheDocument();
  });
});
