// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useQueryParamNotice } from "./useQueryParamNotice";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

function Harness({ keys }: { keys: string[] }) {
  const [found, setFound] = useState<string[]>([]);
  useQueryParamNotice(keys, (p) => {
    const next: string[] = [];
    for (const k of keys) {
      const v = p.get(k);
      if (v) next.push(`${k}=${v}`);
    }
    setFound(next);
  });
  return <p>{found.join(",") || "none"}</p>;
}

describe("useQueryParamNotice", () => {
  it("reads matching params and strips them from the URL", async () => {
    window.history.replaceState(null, "", "/somewhere?error=oops&other=1");
    render(<Harness keys={["error", "notice"]} />);

    expect(await screen.findByText("error=oops")).toBeInTheDocument();
    expect(window.location.search).toBe("");
  });

  it("leaves the URL untouched when none of the keys are present", async () => {
    window.history.replaceState(null, "", "/somewhere?unrelated=1");
    render(<Harness keys={["error", "notice"]} />);

    expect(await screen.findByText("none")).toBeInTheDocument();
    expect(window.location.search).toBe("?unrelated=1");
  });
});
