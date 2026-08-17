// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import MarkdownEditor from "./MarkdownEditor";

afterEach(() => cleanup());

function Harness() {
  const [value, setValue] = useState("");
  return <MarkdownEditor value={value} onChange={setValue} placeholder="Tulis di sini" />;
}

describe("MarkdownEditor", () => {
  it("starts on the Tulis tab and reports typed text via onChange", () => {
    const onChange = vi.fn();
    render(<MarkdownEditor value="" onChange={onChange} placeholder="Tulis di sini" />);

    const textarea = screen.getByPlaceholderText("Tulis di sini");
    fireEvent.change(textarea, { target: { value: "**halo**" } });
    expect(onChange).toHaveBeenCalledWith("**halo**");
  });

  it("switches to Pratinjau and renders the value as markdown", () => {
    render(<Harness />);

    fireEvent.change(screen.getByPlaceholderText("Tulis di sini"), { target: { value: "**halo**" } });
    fireEvent.click(screen.getByText("Pratinjau"));

    expect(screen.getByText("halo").tagName).toBe("STRONG");
    expect(screen.queryByPlaceholderText("Tulis di sini")).not.toBeInTheDocument();
  });

  it("shows an empty-preview hint when there's nothing to render", () => {
    render(<MarkdownEditor value="" onChange={vi.fn()} placeholder="Tulis di sini" />);

    fireEvent.click(screen.getByText("Pratinjau"));
    expect(screen.getByText("Nggak ada isi buat dipratinjau.")).toBeInTheDocument();
  });
});
