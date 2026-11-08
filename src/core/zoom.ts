// Digital zoom for full-screen video. Pan is normalised: -1 = left/top edge, 1 = right/bottom.

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const ZOOM_STEPS = [1, 2, 3, 4] as const;
/** One remote-arrow press moves this fraction of the zoomed overflow. */
export const PAN_STEP = 0.25;

export interface ZoomState {
  zoom: number;
  x: number;
  y: number;
}

export const NO_ZOOM: ZoomState = { zoom: 1, x: 0, y: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function clampZoom(z: ZoomState): ZoomState {
  const zoom = clamp(Number.isFinite(z.zoom) ? z.zoom : 1, MIN_ZOOM, MAX_ZOOM);
  if (zoom <= 1.001) return NO_ZOOM;
  return { zoom, x: clamp(z.x, -1, 1), y: clamp(z.y, -1, 1) };
}

/** Next/previous zoom step (remote control). Pan is kept, so you zoom into where you are. */
export function stepZoom(z: ZoomState, dir: 1 | -1): ZoomState {
  const steps = [...ZOOM_STEPS];
  const idx = dir > 0 ? steps.findIndex((s) => s > z.zoom + 0.01) : [...steps].reverse().findIndex((s) => s < z.zoom - 0.01);
  if (idx === -1) return clampZoom(z);
  const zoom = dir > 0 ? steps[idx]! : [...steps].reverse()[idx]!;
  return clampZoom({ ...z, zoom });
}

export function panBy(z: ZoomState, dx: number, dy: number): ZoomState {
  if (z.zoom <= 1) return z;
  return clampZoom({ ...z, x: z.x + dx, y: z.y + dy });
}

/** Pinch: scale relative to the zoom when the gesture started. */
export function pinchZoom(start: ZoomState, startDistance: number, distance: number): ZoomState {
  if (startDistance <= 0) return start;
  return clampZoom({ ...start, zoom: start.zoom * (distance / startDistance) });
}

/** Finger drag in pixels → normalised pan, so the picture follows the finger. */
export function dragPan(start: ZoomState, dxPx: number, dyPx: number, width: number, height: number): ZoomState {
  if (start.zoom <= 1 || width <= 0 || height <= 0) return start;
  const spareX = (width * (start.zoom - 1)) / 2;
  const spareY = (height * (start.zoom - 1)) / 2;
  return clampZoom({ ...start, x: start.x - dxPx / spareX, y: start.y - dyPx / spareY });
}
