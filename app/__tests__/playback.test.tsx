import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { DahuaClient } from '@/core/dahua';
import { wrap } from '@/core/schema';
import { MINUTE, startOfDay } from '@/core/timeline';
import type { DahuaDevice } from '@/core/types';
import { clearPasswordCache } from '@/storage/secrets';
import { DEVICES_KEY, useAppStore } from '@/storage/store';
import { RtspPlayerView } from 'rtsp-player';

jest.mock('@react-native-community/netinfo', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));
jest.setTimeout(30_000);

const nvr: DahuaDevice = {
  id: 'nvr1', kind: 'dahua', name: 'Home NVR', host: '192.168.1.108', rtspPort: 554, httpPort: 80,
  username: 'admin', transport: 'tcp', createdAt: 0, channels: [{ number: 1, name: 'Gate', enabled: true }],
};
const mockPlayer = RtspPlayerView as unknown as jest.Mock;

beforeEach(async () => {
  await AsyncStorage.clear();
  clearPasswordCache();
  useAppStore.setState({ hydrated: false, devices: [], networkEpoch: 0, online: true });
  await AsyncStorage.setItem(DEVICES_KEY, wrap([nvr]));
  mockPlayer.mockClear();
  // Fixed clock (noon) so "previous event" is deterministic whatever time the tests run.
  jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 10, 9, 12, 0, 0).getTime());
});

afterEach(() => jest.restoreAllMocks());

it('shows the day with motion events and plays from the chosen moment', async () => {
  const day = startOfDay(Date.now());
  jest.spyOn(DahuaClient.prototype, 'findRecordings').mockResolvedValue([
    { start: day, end: day + 60 * MINUTE, event: false, events: [] },
    { start: day + 10 * MINUTE, end: day + 15 * MINUTE, event: true, events: ['VideoMotion'] },
    { start: day + 40 * MINUTE, end: day + 45 * MINUTE, event: true, events: ['VideoMotion'] },
  ]);
  await renderRouter('./app', { initialUrl: '/playback/nvr1:1' });
  await waitFor(() => expect(screen.getByText(/2 motion events/)).toBeTruthy());
  expect(screen.getByText(/Gate · recordings/)).toBeTruthy();

  // The cursor starts at "now": the previous motion event is 00:40 → playback URL for that moment,
  // credentials passed separately.
  await fireEvent.press(screen.getByLabelText('Previous motion event'));
  const last = mockPlayer.mock.calls[mockPlayer.mock.calls.length - 1]![0] as { source: { uri: string; password?: string } | null };
  expect(last.source?.uri).toMatch(/^rtsp:\/\/192\.168\.1\.108:554\/cam\/playback\?channel=1&starttime=\d{4}_\d{2}_\d{2}_00_40_00&endtime=/);
  expect(last.source?.uri).not.toContain('admin');
});

it('says so when there are no recordings', async () => {
  jest.spyOn(DahuaClient.prototype, 'findRecordings').mockResolvedValue([]);
  await renderRouter('./app', { initialUrl: '/playback/nvr1:1' });
  await waitFor(() => expect(screen.getByText('No recordings on this day.')).toBeTruthy());
});
