import { arrangeCameras, canMove, moveCamera, sanitizeIdList, toggleFavorite } from '../arrange';
import type { Camera } from '../types';

const cam = (id: string): Camera => ({ id, deviceId: id.split(':')[0]!, deviceName: 'N', name: id, channel: Number(id.split(':')[1]) });
const ids = (cs: Camera[]) => cs.map((c) => c.id);
const base = ['n:1', 'n:2', 'n:3', 'n:4'].map(cam);

describe('camera arrangement', () => {
  it('keeps recorder order by default', () => {
    expect(ids(arrangeCameras(base, [], []))).toEqual(['n:1', 'n:2', 'n:3', 'n:4']);
  });

  it('applies custom order; new cameras go last', () => {
    expect(ids(arrangeCameras(base, ['n:3', 'n:1'], []))).toEqual(['n:3', 'n:1', 'n:2', 'n:4']);
  });

  it('pins favourites first, keeping their relative order', () => {
    expect(ids(arrangeCameras(base, ['n:3', 'n:1'], ['n:4', 'n:1']))).toEqual(['n:1', 'n:4', 'n:3', 'n:2']);
  });

  it('moves within a group but never across favourites/non-favourites', () => {
    const arranged = arrangeCameras(base, [], ['n:1']);
    expect(moveCamera(arranged, 'n:3', -1, ['n:1'])).toEqual(['n:1', 'n:3', 'n:2', 'n:4']);
    expect(moveCamera(arranged, 'n:2', -1, ['n:1'])).toEqual(ids(arranged)); // would jump above a favourite
    expect(canMove(arranged, 'n:2', -1, ['n:1'])).toBe(false);
    expect(canMove(arranged, 'n:4', 1, ['n:1'])).toBe(false); // already last
    expect(canMove(arranged, 'n:2', 1, ['n:1'])).toBe(true);
  });

  it('toggles favourites', () => {
    expect(toggleFavorite(['a:1'], 'b:2')).toEqual(['a:1', 'b:2']);
    expect(toggleFavorite(['a:1', 'b:2'], 'a:1')).toEqual(['b:2']);
  });

  it('sanitises persisted id lists', () => {
    expect(sanitizeIdList(['n:1', 'n:1', 'bad', 5, '../x:1', 'n:999', 'n:1000'])).toEqual(['n:1', 'n:999']);
    expect(sanitizeIdList('nope')).toEqual([]);
    expect(sanitizeIdList(Array.from({ length: 600 }, (_, i) => `n:${i % 999}`))).toHaveLength(512);
  });
});
