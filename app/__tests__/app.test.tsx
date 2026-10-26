import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, renderRouter, screen, waitFor } from 'expo-router/testing-library';

import { wrap } from '@/core/schema';
import type { DahuaDevice } from '@/core/types';
import { clearPasswordCache } from '@/storage/secrets';
import { DEVICES_KEY, SETTINGS_KEY, useAppStore } from '@/storage/store';

jest.mock('@react-native-community/netinfo', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-community/netinfo/jest/netinfo-mock.js'),
);
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));

const nvr: DahuaDevice = {
  id: 'nvr1',
  kind: 'dahua',
  name: 'Home NVR',
  host: '192.168.1.108',
  rtspPort: 554,
  httpPort: 80,
  username: 'admin',
  transport: 'tcp',
  createdAt: 0,
  channels: Array.from({ length: 6 }, (_, i) => ({ number: i + 1, name: `Cam ${i + 1}`, enabled: true })),
};

async function boot() {
  const r = await renderRouter('./app', { initialUrl: '/' });
  await waitFor(() => expect(useAppStore.getState().hydrated).toBe(true));
  return r;
}

beforeEach(async () => {
  await AsyncStorage.clear();
  clearPasswordCache();
  useAppStore.setState({ hydrated: false, devices: [], networkEpoch: 0, online: true });
});

jest.setTimeout(30_000); // first router render is slow under a parallel run

describe('app', () => {
  it('first launch shows the welcome screen with setup actions', async () => {
    await boot();
    expect(screen.getByText(/Welcome to Cam/)).toBeTruthy();
    expect(screen.getByText('Find on my network')).toBeTruthy();
    expect(screen.getByText('Add CP Plus / Dahua')).toBeTruthy();
  });

  it('shows a 2×2 grid page of cameras and pages through them', async () => {
    await AsyncStorage.setItem(DEVICES_KEY, wrap([nvr]));
    await AsyncStorage.setItem(SETTINGS_KEY, wrap({ layout: 4, page: 0 }));
    await boot();
    expect(screen.getAllByTestId(/^tile-/)).toHaveLength(4);
    expect(screen.getByText('1 / 2')).toBeTruthy();
    expect(screen.getByText('Cam 1')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Next page'));
    expect(screen.getByText('2 / 2')).toBeTruthy();
    expect(screen.getAllByTestId(/^tile-/)).toHaveLength(2);
    expect(screen.getByText('Cam 5')).toBeTruthy();
  });

  it('switching layout to 3×3 fits all six cameras on one page', async () => {
    await AsyncStorage.setItem(DEVICES_KEY, wrap([nvr]));
    await boot();
    await fireEvent.press(screen.getByLabelText('Layout 3×3'));
    expect(screen.getAllByTestId(/^tile-/)).toHaveLength(6);
    expect(screen.queryByText('1 / 2')).toBeNull();
  });

  it('opens a camera full screen', async () => {
    await AsyncStorage.setItem(DEVICES_KEY, wrap([nvr]));
    const r = await boot();
    await fireEvent.press(screen.getByTestId('tile-nvr1:3'));
    expect(r.getPathname()).toBe('/camera/nvr1:3');
    expect(screen.getAllByText('Cam 3').length).toBeGreaterThan(0);
  });
});
