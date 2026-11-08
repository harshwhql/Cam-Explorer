import { act, renderHook } from '@testing-library/react-native';

import { DahuaClient } from '@/core/dahua';
import type { DahuaDevice } from '@/core/types';
import { PTZ_MAX_MOVE_MS, usePtz } from '../usePtz';

const device: DahuaDevice = {
  id: 'nvr1', kind: 'dahua', name: 'NVR', host: '192.168.1.108', rtspPort: 554, httpPort: 80,
  username: 'admin', transport: 'tcp', createdAt: 0, channels: [{ number: 1, name: 'PTZ', enabled: true }],
};

let moves: string[];

beforeEach(() => {
  jest.useFakeTimers();
  moves = [];
  jest.spyOn(DahuaClient.prototype, 'ptzCaps').mockResolvedValue({ pan: true, tilt: true, zoom: true, presets: false });
  jest.spyOn(DahuaClient.prototype, 'ptzMove').mockImplementation(async (_ch, action, code) => {
    moves.push(`${action}:${code}`);
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function setup() {
  const hook = await renderHook(() => usePtz(device, 1));
  await act(async () => {
    await Promise.resolve();
  });
  return hook;
}

describe('usePtz', () => {
  it('detects support and moves while held', async () => {
    const { result } = await setup();
    expect(result.current.supported).toBe(true);
    await act(() => result.current.start('Left'));
    await act(() => result.current.start('Left')); // key repeat → no duplicate start
    await act(() => result.current.stop());
    expect(moves).toEqual(['start:Left', 'stop:Left']);
  });

  it('switching direction stops the previous move first', async () => {
    const { result } = await setup();
    await act(() => result.current.start('Left'));
    await act(() => result.current.start('Up'));
    expect(moves).toEqual(['start:Left', 'stop:Left', 'start:Up']);
  });

  it('stops by itself if the release never arrives', async () => {
    const { result } = await setup();
    await act(() => result.current.start('ZoomTele'));
    await act(async () => {
      jest.advanceTimersByTime(PTZ_MAX_MOVE_MS + 10);
    });
    expect(moves).toEqual(['start:ZoomTele', 'stop:ZoomTele']);
  });

  it('stops when the screen goes away', async () => {
    const { result, unmount } = await setup();
    await act(() => result.current.start('Right'));
    await act(() => unmount());
    expect(moves).toEqual(['start:Right', 'stop:Right']);
  });
});
