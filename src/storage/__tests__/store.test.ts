import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import type { DahuaDevice, RtspDevice } from '@/core/types';
import { cachedPassword, clearPasswordCache } from '../secrets';
import { DEVICES_KEY, SETTINGS_KEY, useAppStore } from '../store';

const secure = (SecureStore as unknown as { __store: Map<string, string> }).__store;

const nvr: DahuaDevice = {
  id: 'nvr1',
  kind: 'dahua',
  name: 'Home NVR',
  host: '192.168.1.108',
  rtspPort: 554,
  httpPort: 80,
  username: 'admin',
  transport: 'tcp',
  createdAt: 1,
  channels: [{ number: 1, name: 'Gate', enabled: true }],
};

async function allPlainStorage(): Promise<string> {
  const keys = await AsyncStorage.getAllKeys();
  const pairs = await AsyncStorage.multiGet(keys);
  return JSON.stringify(pairs);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  secure.clear();
  clearPasswordCache();
  useAppStore.setState({ hydrated: false, devices: [], networkEpoch: 0, online: true });
});

describe('device store', () => {
  it('stores passwords ONLY in secure storage, never in plain storage', async () => {
    await useAppStore.getState().saveDevice(nvr, 'Sup3r$ecret!');
    expect(await allPlainStorage()).not.toContain('Sup3r$ecret!');
    expect([...secure.values()]).toContain('Sup3r$ecret!');
    expect([...secure.keys()]).toEqual(['camx.pw.nvr1']);
  });

  it('keeps the existing password when editing without a new one', async () => {
    await useAppStore.getState().saveDevice(nvr, 'first');
    await useAppStore.getState().saveDevice({ ...nvr, name: 'Renamed' });
    expect(secure.get('camx.pw.nvr1')).toBe('first');
    expect(useAppStore.getState().devices[0]!.name).toBe('Renamed');
  });

  it('never persists credentials embedded in RTSP URLs', async () => {
    const cam: RtspDevice = {
      id: 'cam1',
      kind: 'rtsp',
      name: 'Cam',
      username: 'u',
      transport: 'tcp',
      createdAt: 0,
      mainUrl: 'rtsp://u:leaky@10.0.0.2/live',
    };
    await useAppStore.getState().saveDevice(cam, 'pw');
    expect(await allPlainStorage()).not.toContain('leaky');
  });

  it('rejects invalid devices instead of saving them', async () => {
    await expect(useAppStore.getState().saveDevice({ ...nvr, host: 'bad host/x' }, 'pw')).rejects.toThrow();
    expect(useAppStore.getState().devices).toHaveLength(0);
    expect(secure.size).toBe(0);
  });

  it('hydrates devices + passwords after a restart', async () => {
    await useAppStore.getState().saveDevice(nvr, 'pw1');
    clearPasswordCache();
    useAppStore.setState({ devices: [], hydrated: false });
    await useAppStore.getState().hydrate();
    expect(useAppStore.getState()).toMatchObject({ hydrated: true });
    expect(useAppStore.getState().devices.map((d) => d.id)).toEqual(['nvr1']);
    expect(cachedPassword('nvr1')).toBe('pw1');
  });

  it('survives corrupt storage at boot', async () => {
    await AsyncStorage.setItem(DEVICES_KEY, '{not json');
    await AsyncStorage.setItem(SETTINGS_KEY, '[]');
    await useAppStore.getState().hydrate();
    expect(useAppStore.getState().hydrated).toBe(true);
    expect(useAppStore.getState().devices).toEqual([]);
    expect(useAppStore.getState().settings.layout).toBe(4);
  });

  it('removing a device deletes its secret', async () => {
    await useAppStore.getState().saveDevice(nvr, 'pw');
    await useAppStore.getState().removeDevice('nvr1');
    expect(secure.size).toBe(0);
    expect(useAppStore.getState().devices).toEqual([]);
  });

  it('resetAll wipes devices, secrets and settings', async () => {
    await useAppStore.getState().saveDevice(nvr, 'pw');
    useAppStore.getState().updateSettings({ layout: 9 });
    await useAppStore.getState().resetAll();
    expect(secure.size).toBe(0);
    expect(await AsyncStorage.getAllKeys()).toEqual([]);
    expect(useAppStore.getState().settings.layout).toBe(4);
  });

  it('bumps the network epoch only when coming back online', () => {
    const s = useAppStore.getState();
    s.setOnline(true);
    expect(useAppStore.getState().networkEpoch).toBe(0);
    s.setOnline(false);
    s.setOnline(true);
    expect(useAppStore.getState().networkEpoch).toBe(1);
  });

  it('sanitises settings updates', () => {
    useAppStore.getState().updateSettings({ tourIntervalSec: 1, layout: 3 as never });
    expect(useAppStore.getState().settings).toMatchObject({ tourIntervalSec: 5, layout: 4 });
  });
});
