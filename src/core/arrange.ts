// Camera order: favourites first, then the user's custom order, then anything new in
// recorder/channel order. Pure so it can be unit-tested.
import type { Camera } from './types';

export const CAMERA_ID_RE = /^[A-Za-z0-9_-]{1,64}:\d{1,3}$/;
export const MAX_ARRANGED = 512;

export function arrangeCameras(cameras: Camera[], order: readonly string[], favorites: readonly string[]): Camera[] {
  const fav = new Set(favorites);
  const pos = new Map(order.map((id, i) => [id, i] as const));
  const rank = (c: Camera, i: number) => pos.get(c.id) ?? order.length + i; // unknown → after arranged ones
  return cameras
    .map((c, i) => ({ c, r: rank(c, i), f: fav.has(c.id) ? 0 : 1 }))
    .sort((a, b) => a.f - b.f || a.r - b.r)
    .map((x) => x.c);
}

/**
 * Move a camera one step within the arranged list. Moves never cross between favourites and
 * the rest (favourites are always pinned first). Returns the new full order of ids.
 */
export function moveCamera(arranged: Camera[], id: string, delta: -1 | 1, favorites: readonly string[]): string[] {
  const ids = arranged.map((c) => c.id);
  const i = ids.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const fav = new Set(favorites);
  if (fav.has(ids[i]!) !== fav.has(ids[j]!)) return ids;
  [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  return ids;
}

export function canMove(arranged: Camera[], id: string, delta: -1 | 1, favorites: readonly string[]): boolean {
  const ids = arranged.map((c) => c.id);
  return moveCamera(arranged, id, delta, favorites).some((x, k) => x !== ids[k]);
}

export function toggleFavorite(favorites: readonly string[], id: string): string[] {
  return favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id];
}

/** Keep only well-formed, unique camera ids (persisted config is untrusted). */
export function sanitizeIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v !== 'string' || !CAMERA_ID_RE.test(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= MAX_ARRANGED) break;
  }
  return out;
}
