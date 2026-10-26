import { act, fireEvent, render, screen } from '@testing-library/react-native';

import type { Camera, DahuaDevice } from '@/core/types';
import { savePassword } from '@/storage/secrets';
import { RtspPlayerView } from 'rtsp-player';
import { CameraTile } from '../CameraTile';

const mockPlayer = RtspPlayerView as unknown as jest.Mock;

const device: DahuaDevice = {
  id: 'nvr1',
  kind: 'dahua',
  name: 'Home NVR',
  host: '192.168.1.108',
  rtspPort: 554,
  httpPort: 80,
  username: 'admin',
  transport: 'tcp',
  createdAt: 0,
  channels: [{ number: 2, name: 'Gate', enabled: true }],
};
const camera: Camera = { id: 'nvr1:2', deviceId: 'nvr1', deviceName: 'Home NVR', name: 'Gate', channel: 2 };

interface PlayerProps {
  source: { uri: string; username?: string; password?: string; reloadKey: number } | null;
  paused: boolean;
  muted: boolean;
  onStatus: (e: { nativeEvent: { state: string; code?: string } }) => void;
}

function lastProps(): PlayerProps {
  const calls = mockPlayer.mock.calls;
  return calls[calls.length - 1]![0] as PlayerProps;
}

async function emit(state: string, code?: string) {
  await act(() => lastProps().onStatus({ nativeEvent: { state, code } }));
}

async function advance(ms: number) {
  await act(() => {
    jest.advanceTimersByTime(ms);
  });
}

async function renderTile(overrides: Partial<React.ComponentProps<typeof CameraTile>> = {}) {
  const onOpen = jest.fn();
  const onFix = jest.fn();
  await render(
    <CameraTile
      camera={camera}
      device={device}
      quality="sub"
      active
      showLabel
      number={1}
      stallTimeoutMs={8000}
      onOpen={onOpen}
      onFix={onFix}
      {...overrides}
    />,
  );
  return { onOpen, onFix };
}

beforeEach(async () => {
  mockPlayer.mockClear();
  await savePassword('nvr1', 'pw123');
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('CameraTile', () => {
  it('feeds the native player the sub stream with separate credentials', async () => {
    await renderTile();
    const p = lastProps();
    expect(p.source).toMatchObject({
      uri: 'rtsp://192.168.1.108:554/cam/realmonitor?channel=2&subtype=1',
      username: 'admin',
      password: 'pw123',
    });
    expect(p.source!.uri).not.toContain('pw123');
    expect(p.muted).toBe(true);
    expect(p.paused).toBe(false);
  });

  it('shows connecting, then LIVE', async () => {
    await renderTile();
    await emit('connecting');
    expect(screen.getByText('Connecting…')).toBeTruthy();
    await emit('playing');
    expect(screen.queryByText('Connecting…')).toBeNull();
    expect(screen.getByText('LIVE')).toBeTruthy();
    expect(screen.getByText('Gate')).toBeTruthy();
  });

  it('auto-reconnects after a network error by bumping reloadKey', async () => {
    await renderTile();
    const key0 = lastProps().source!.reloadKey;
    await emit('error', 'unreachable');
    expect(screen.getByText('Recorder unreachable')).toBeTruthy();
    expect(screen.getByText(/Retrying in \d+s/)).toBeTruthy();
    await advance(1300);
    expect(lastProps().source!.reloadKey).toBe(key0 + 1);
  });

  it('backs off: second failure waits longer', async () => {
    await renderTile();
    const key0 = lastProps().source!.reloadKey;
    await emit('error', 'unreachable');
    await advance(1300); // retry #1 (≈1 s)
    await emit('error', 'unreachable');
    await advance(1300); // not yet (≈2 s)
    expect(lastProps().source!.reloadKey).toBe(key0 + 1);
    await advance(1500);
    expect(lastProps().source!.reloadKey).toBe(key0 + 2);
  });

  it('never auto-retries a wrong password', async () => {
    await renderTile();
    const key0 = lastProps().source!.reloadKey;
    await emit('error', 'auth');
    expect(screen.getByText('Wrong username or password')).toBeTruthy();
    await advance(120_000);
    expect(lastProps().source).toBeNull();
    expect(mockPlayer.mock.calls.some((c) => ((c[0] as PlayerProps).source?.reloadKey ?? key0) > key0)).toBe(false);
  });

  it('OK on a wrong-password tile opens the device settings', async () => {
    const { onOpen, onFix } = await renderTile();
    await emit('error', 'auth');
    await fireEvent.press(screen.getByTestId('tile-nvr1:2'));
    expect(onFix).toHaveBeenCalledWith(camera);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('OK on a reconnecting tile retries immediately', async () => {
    const { onOpen } = await renderTile();
    const key0 = lastProps().source!.reloadKey;
    await emit('error', 'timeout');
    await fireEvent.press(screen.getByTestId('tile-nvr1:2'));
    expect(onOpen).not.toHaveBeenCalled();
    expect(lastProps().source!.reloadKey).toBe(key0 + 1);
  });

  it('opens full screen on press when live', async () => {
    const { onOpen } = await renderTile();
    await emit('playing');
    await fireEvent.press(screen.getByTestId('tile-nvr1:2'));
    expect(onOpen).toHaveBeenCalledWith(camera);
  });

  it('pauses (releases the decoder) when inactive', async () => {
    await renderTile({ active: false });
    expect(lastProps().paused).toBe(true);
  });
});

describe('CameraTile wrong password lockout safety', () => {
  it('pausing and resuming a wrong-password tile does not reconnect', async () => {
    const { rerender } = await (async () => {
      const r = await render(
        <CameraTile camera={camera} device={device} quality="sub" active showLabel number={1} stallTimeoutMs={8000} onOpen={jest.fn()} />,
      );
      return r;
    })();
    const key0 = lastProps().source!.reloadKey;
    await emit('error', 'auth');
    await rerender(
      <CameraTile camera={camera} device={device} quality="sub" active={false} showLabel number={1} stallTimeoutMs={8000} onOpen={jest.fn()} />,
    );
    await emit('paused');
    await rerender(
      <CameraTile camera={camera} device={device} quality="sub" active showLabel number={1} stallTimeoutMs={8000} onOpen={jest.fn()} />,
    );
    // The native player is given no source → it cannot log in again.
    expect(lastProps().source).toBeNull();
    expect(mockPlayer.mock.calls.every((c) => (c[0] as PlayerProps).source === null || (c[0] as PlayerProps).source!.reloadKey === key0)).toBe(true);
    expect(screen.getByText('Wrong username or password')).toBeTruthy();
  });

  it('grid tiles never set up the audio track', async () => {
    await render(
      <CameraTile camera={camera} device={device} quality="sub" active showLabel number={1} stallTimeoutMs={8000} onOpen={jest.fn()} />,
    );
    expect(lastProps()).not.toHaveProperty('audioEnabled', true);
  });
});

describe('CameraTile connection count', () => {
  it('resuming a paused tile connects once (no reloadKey bump on top of the un-pause)', async () => {
    const tile = (active: boolean) => (
      <CameraTile camera={camera} device={device} quality="sub" active={active} showLabel number={1} stallTimeoutMs={8000} onOpen={jest.fn()} />
    );
    const r = await render(tile(true));
    const key0 = lastProps().source!.reloadKey;
    await r.rerender(tile(false));
    await r.rerender(tile(true));
    expect(lastProps().paused).toBe(false);
    expect(lastProps().source!.reloadKey).toBe(key0);
  });
});
