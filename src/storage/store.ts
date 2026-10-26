import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { sanitizeDevice, sanitizeDevices, sanitizeSettings, unwrap, wrap } from '@/core/schema';
import { DEFAULT_SETTINGS } from '@/core/types';
import type { Device, Settings } from '@/core/types';
import { deletePassword, preloadPasswords, savePassword } from './secrets';

export const DEVICES_KEY = 'camx.devices';
export const SETTINGS_KEY = 'camx.settings';

export interface AppStore {
  hydrated: boolean;
  devices: Device[];
  settings: Settings;
  /** Bumped when the network comes back so every tile reconnects at once. */
  networkEpoch: number;
  online: boolean;

  hydrate(): Promise<void>;
  /** Add or update. `password` undefined = keep the stored one. */
  saveDevice(device: Device, password?: string): Promise<void>;
  removeDevice(id: string): Promise<void>;
  updateSettings(patch: Partial<Settings>): void;
  setOnline(online: boolean): void;
  resetAll(): Promise<void>;
}

async function persistDevices(devices: Device[]) {
  await AsyncStorage.setItem(DEVICES_KEY, wrap(devices));
}

let settingsTimer: ReturnType<typeof setTimeout> | undefined;
function persistSettingsSoon(settings: Settings) {
  if (settingsTimer) clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    AsyncStorage.setItem(SETTINGS_KEY, wrap(settings)).catch(() => undefined);
  }, 300);
}

export const useAppStore = create<AppStore>((set, get) => ({
  hydrated: false,
  devices: [],
  settings: { ...DEFAULT_SETTINGS },
  networkEpoch: 0,
  online: true,

  async hydrate() {
    let devices: Device[] = [];
    let settings: Settings = { ...DEFAULT_SETTINGS };
    try {
      const [d, s] = await Promise.all([AsyncStorage.getItem(DEVICES_KEY), AsyncStorage.getItem(SETTINGS_KEY)]);
      devices = sanitizeDevices(unwrap(d));
      settings = sanitizeSettings(unwrap(s));
    } catch {
      // Corrupt storage must never brick the app; start clean.
    }
    await preloadPasswords(devices.map((x) => x.id));
    set({ devices, settings, hydrated: true });
  },

  async saveDevice(device, password) {
    const clean = sanitizeDevice(device);
    if (!clean) throw new Error('Device settings are invalid');
    if (password !== undefined) await savePassword(clean.id, password);
    const existing = get().devices;
    const idx = existing.findIndex((d) => d.id === clean.id);
    const devices = idx === -1 ? [...existing, clean] : existing.map((d) => (d.id === clean.id ? clean : d));
    await persistDevices(devices);
    set({ devices });
  },

  async removeDevice(id) {
    const devices = get().devices.filter((d) => d.id !== id);
    await persistDevices(devices);
    await deletePassword(id).catch(() => undefined);
    set({ devices });
  },

  updateSettings(patch) {
    const settings = sanitizeSettings({ ...get().settings, ...patch });
    set({ settings });
    persistSettingsSoon(settings);
  },

  setOnline(online) {
    const wasOnline = get().online;
    if (online === wasOnline) return;
    set({ online, networkEpoch: online ? get().networkEpoch + 1 : get().networkEpoch });
  },

  async resetAll() {
    const ids = get().devices.map((d) => d.id);
    await Promise.all(ids.map((id) => deletePassword(id).catch(() => undefined)));
    await AsyncStorage.multiRemove([DEVICES_KEY, SETTINGS_KEY]);
    set({ devices: [], settings: { ...DEFAULT_SETTINGS } });
  },
}));
