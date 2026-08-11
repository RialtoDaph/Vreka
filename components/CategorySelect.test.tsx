// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import CategorySelect from "./CategorySelect";

afterEach(() => {
  cleanup();
});

const GROUPS = [
  { group: "Rumah Tangga", items: ["Makanan", "Transportasi"] },
  { group: "Gaya Hidup", items: ["Hiburan", "Liburan"] },
];

describe("CategorySelect", () => {
  it("shows the current value and every group when opened with no filter", () => {
    render(<CategorySelect value="Makanan" onChange={vi.fn()} groups={GROUPS} />);

    const input = screen.getByRole("combobox") as HTMLInputElement;
    expect(input.value).toBe("Makanan");
    fireEvent.focus(input);

    expect(screen.getByText("Rumah Tangga")).toBeInTheDocument();
    expect(screen.getByText("Gaya Hidup")).toBeInTheDocument();
    expect(screen.getByText("Liburan")).toBeInTheDocument();
  });

  it("filters options across groups as the user types, dropping empty groups", () => {
    render(<CategorySelect value="Makanan" onChange={vi.fn()} groups={GROUPS} />);

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "lib" } });

    expect(screen.getByText("Liburan")).toBeInTheDocument();
    expect(screen.queryByText("Makanan")).not.toBeInTheDocument();
    expect(screen.queryByText("Rumah Tangga")).not.toBeInTheDocument();
  });

  it("calls onChange and closes the dropdown when an option is clicked", () => {
    const onChange = vi.fn();
    render(<CategorySelect value="Makanan" onChange={onChange} groups={GROUPS} />);

    fireEvent.focus(screen.getByRole("combobox"));
    fireEvent.click(screen.getByText("Liburan"));

    expect(onChange).toHaveBeenCalledWith("Liburan");
    expect(screen.queryByText("Rumah Tangga")).not.toBeInTheDocument();
  });

  it("selects the top filtered match on Enter instead of letting the form submit", () => {
    const onChange = vi.fn();
    const onSubmit = vi.fn((e) => e.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <CategorySelect value="Makanan" onChange={onChange} groups={GROUPS} />
      </form>
    );

    const input = screen.getByRole("combobox");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "hibur" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onChange).toHaveBeenCalledWith("Hiburan");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("reverts unmatched typed text back to the real value on blur", () => {
    render(<CategorySelect value="Makanan" onChange={vi.fn()} groups={GROUPS} />);

    const input = screen.getByRole("combobox") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "zzz nggak ada" } });
    fireEvent.blur(input);

    expect(input.value).toBe("Makanan");
  });

  it("shows nothing typeable when disabled", () => {
    render(<CategorySelect value="Makanan" onChange={vi.fn()} groups={GROUPS} disabled />);

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
