import { act, render, screen } from '@testing-library/react-native';

import type { DahuaDevice } from '@/core/types';
import { DahuaClient, DahuaError } from '@/core/dahua';
import { savePassword } from '@/storage/secrets';
import { RtspPlayerView } from 'rtsp-player';
import { CameraTile } from '../CameraTile';
import { SnapshotView } from '../SnapshotView';

const device: DahuaDevice = {
  id: 'nvr1', kind: 'dahua', name: 'NVR', host: '192.168.1.108', rtspPort: 554, httpPort: 80,
  username: 'admin', transport: 'tcp', createdAt: 0, channels: [{ number: 3, name: 'Gate', enabled: true }],
};

beforeEach(async () => {
  jest.useFakeTimers();
  await savePassword('nvr1', 'pw');
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

describe('SnapshotView', () => {
  it('polls snapshots for the right channel', async () => {
    const spy = jest.spyOn(DahuaClient.prototype, 'snapshot').mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff, 1]).buffer);
    await render(<SnapshotView device={device} channel={3} active intervalMs={1000} />);
    await flush();
    expect(spy).toHaveBeenCalledWith(3);
    await act(async () => { jest.advanceTimersByTime(1100); });
    await flush();
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('stops polling after a wrong password (no lockout)', async () => {
    const spy = jest.spyOn(DahuaClient.prototype, 'snapshot').mockRejectedValue(new DahuaError('auth', 'bad'));
    await render(<SnapshotView device={device} channel={3} active />);
    await flush();
    await act(async () => { jest.advanceTimersByTime(60_000); });
    await flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Wrong username or password')).toBeTruthy();
  });

  it('does nothing while inactive', async () => {
    const spy = jest.spyOn(DahuaClient.prototype, 'snapshot').mockResolvedValue(new ArrayBuffer(0));
    await render(<SnapshotView device={device} channel={3} active={false} />);
    await flush();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('CameraTile snapshot mode', () => {
  it('uses no video decoder at all', async () => {
    jest.spyOn(DahuaClient.prototype, 'snapshot').mockResolvedValue(new ArrayBuffer(0));
    (RtspPlayerView as unknown as jest.Mock).mockClear();
    await render(
      <CameraTile
        camera={{ id: 'nvr1:3', deviceId: 'nvr1', deviceName: 'NVR', name: 'Gate', channel: 3 }}
        device={device} quality="sub" active showLabel number={1} stallTimeoutMs={8000} onOpen={jest.fn()} mode="snapshot"
      />,
    );
    expect(RtspPlayerView).not.toHaveBeenCalled();
    expect(screen.getByText('1 FPS')).toBeTruthy();
  });
});
