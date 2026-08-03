import { describe, expect, it } from "vitest";
import { arrowEndpoints, clampZoom, toWorldPoint, zoomFromWheel } from "./canvas";

describe("clampZoom", () => {
  it("clamps below the minimum", () => {
    expect(clampZoom(0.1)).toBe(0.4);
  });

  it("clamps above the maximum", () => {
    expect(clampZoom(5)).toBe(2);
  });

  it("passes through an in-range value", () => {
    expect(clampZoom(1.3)).toBe(1.3);
  });
});

describe("zoomFromWheel", () => {
  it("zooms out on a positive deltaY (scroll down)", () => {
    expect(zoomFromWheel(1, 100)).toBeCloseTo(0.9);
  });

  it("zooms in on a negative deltaY (scroll up)", () => {
    expect(zoomFromWheel(1, -100)).toBeCloseTo(1.1);
  });

  it("stays clamped even with a huge scroll delta", () => {
    expect(zoomFromWheel(1, 100000)).toBe(0.4);
  });
});

describe("toWorldPoint", () => {
  it("returns the client point unchanged at zoom 1 with no pan", () => {
    expect(toWorldPoint(150, 200, { x: 0, y: 0 }, 1)).toEqual({ x: 150, y: 200 });
  });

  it("subtracts pan before dividing by zoom", () => {
    expect(toWorldPoint(150, 200, { x: 50, y: 50 }, 1)).toEqual({ x: 100, y: 150 });
  });

  it("accounts for zoom", () => {
    expect(toWorldPoint(200, 200, { x: 0, y: 0 }, 2)).toEqual({ x: 100, y: 100 });
  });

  it("round-trips a node's screen position back to its world position", () => {
    const pan = { x: 37, y: -12 };
    const zoom = 1.5;
    const worldNode = { x: 120, y: 80 };
    // Screen position a node at worldNode would render at under this transform.
    const screenX = worldNode.x * zoom + pan.x;
    const screenY = worldNode.y * zoom + pan.y;
    expect(toWorldPoint(screenX, screenY, pan, zoom)).toEqual(worldNode);
  });
});

describe("arrowEndpoints", () => {
  it("connects the centers of two rects", () => {
    const from = { x: 0, y: 0, w: 200, h: 100 };
    const to = { x: 400, y: 300, w: 220, h: 110 };
    expect(arrowEndpoints(from, to)).toEqual({ x1: 100, y1: 50, x2: 510, y2: 355 });
  });
});
