import type { GridLayout } from './types';

export const GRID_LAYOUTS: GridLayout[] = [1, 4, 9, 16];

export interface GridShape {
  cols: number;
  rows: number;
}

/** Grid shape for a layout. Portrait phones get 2 columns so tiles stay readable. */
export function gridShape(layout: GridLayout, portrait = false): GridShape {
  const side = Math.sqrt(layout);
  if (!portrait || layout === 1) return { cols: side, rows: side };
  const cols = Math.min(2, layout);
  return { cols, rows: Math.ceil(layout / cols) };
}

export function pageCount(total: number, perPage: number): number {
  if (perPage <= 0) return 0;
  return Math.max(1, Math.ceil(total / perPage));
}

export function clampPage(page: number, total: number, perPage: number): number {
  const pages = pageCount(total, perPage);
  if (!Number.isFinite(page) || page < 0) return 0;
  return Math.min(Math.floor(page), pages - 1);
}

export function pageItems<T>(items: T[], page: number, perPage: number): T[] {
  const p = clampPage(page, items.length, perPage);
  return items.slice(p * perPage, p * perPage + perPage);
}

/** Wrap-around paging (used by D-pad / tour mode). */
export function stepPage(page: number, delta: number, total: number, perPage: number): number {
  const pages = pageCount(total, perPage);
  return (((page + delta) % pages) + pages) % pages;
}

export function stepIndex(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}

/**
 * Smallest layout that still shows every camera on one page, capped by how many
 * simultaneous video decoders the device supports.
 */
export function suggestLayout(cameraCount: number, decoderBudget: number): GridLayout {
  const usable = GRID_LAYOUTS.filter((l) => l <= Math.max(1, decoderBudget));
  return usable.find((l) => l >= cameraCount) ?? usable[usable.length - 1] ?? 1;
}

export function layoutsWithinBudget(decoderBudget: number): GridLayout[] {
  const list = GRID_LAYOUTS.filter((l) => l <= Math.max(1, decoderBudget));
  return list.length ? list : [1];
}

/**
 * Which tiles on the page get a (scarce) hardware decoder. Most-recently-focused first, then
 * page order. Everything else shows snapshots. All tiles are live when the budget allows.
 */
export function pickLiveIds(pageIds: string[], recentlyFocused: string[], budget: number): Set<string> {
  const max = Math.max(1, budget);
  if (pageIds.length <= max) return new Set(pageIds);
  const onPage = new Set(pageIds);
  const out: string[] = [];
  for (const id of [...recentlyFocused, ...pageIds]) {
    if (out.length >= max) break;
    if (onPage.has(id) && !out.includes(id)) out.push(id);
  }
  return new Set(out);
}

/** Snapshot refresh interval: ~1/s, slower when many tiles poll the same recorder. */
export function snapshotIntervalMs(snapshotTiles: number): number {
  return Math.max(1000, snapshotTiles * 300);
}
