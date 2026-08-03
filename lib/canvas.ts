// Pure geometry for Canvas Kerja's infinite pan/zoom whiteboard -- kept
// framework-free so the coordinate math (the part most likely to have an
// off-by-one) is unit-testable without mounting the canvas component.

export type Point = { x: number; y: number };
export type Pan = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export const MIN_ZOOM = 0.4;
export const MAX_ZOOM = 2;

export function clampZoom(zoom: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
}

// Scroll-wheel zoom step, matching the reference design's feel (deltaY is
// positive scrolling down/away -> zoom out).
export function zoomFromWheel(currentZoom: number, deltaY: number): number {
  return clampZoom(currentZoom - deltaY * 0.001);
}

// Screen (client) coordinates -> world coordinates, given the current
// pan offset and zoom level. Every drag/link calculation works in world
// space so nodes stay under the cursor regardless of pan/zoom.
export function toWorldPoint(clientX: number, clientY: number, pan: Pan, zoom: number): Point {
  return { x: (clientX - pan.x) / zoom, y: (clientY - pan.y) / zoom };
}

export type ArrowEndpoints = { x1: number; y1: number; x2: number; y2: number };

// Arrows connect node centers, not edges -- simple and always looks right
// regardless of node size or relative position.
export function arrowEndpoints(from: Rect, to: Rect): ArrowEndpoints {
  return {
    x1: from.x + from.w / 2,
    y1: from.y + from.h / 2,
    x2: to.x + to.w / 2,
    y2: to.y + to.h / 2,
  };
}
