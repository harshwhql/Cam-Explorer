// Device passwords live ONLY here: Android Keystore-backed encrypted storage.
// They are never written to AsyncStorage, never logged and never put into a URL in JS.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const memory = new Map<string, string>();
const useMemoryOnly = Platform.OS === 'web'; // web preview only — no real secrets there

const keyFor = (deviceId: string) => {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(deviceId)) throw new Error('Invalid device id');
  return `camx.pw.${deviceId}`;
};

export async function savePassword(deviceId: string, password: string): Promise<void> {
  const key = keyFor(deviceId);
  if (!useMemoryOnly) await SecureStore.setItemAsync(key, password);
  memory.set(deviceId, password);
}

export async function loadPassword(deviceId: string): Promise<string> {
  const cached = memory.get(deviceId);
  if (cached !== undefined) return cached;
  if (useMemoryOnly) return '';
  const value = (await SecureStore.getItemAsync(keyFor(deviceId))) ?? '';
  memory.set(deviceId, value);
  return value;
}

/** Synchronous read after preload — used on the render path of video tiles. */
export function cachedPassword(deviceId: string): string | undefined {
  return memory.get(deviceId);
}

export async function preloadPasswords(deviceIds: string[]): Promise<void> {
  await Promise.all(
    deviceIds.map(async (id) => {
      try {
        await loadPassword(id);
      } catch {
        // Keystore can be invalidated (e.g. device reset); user will be asked to re-enter.
        memory.set(id, '');
      }
    }),
  );
}

export async function deletePassword(deviceId: string): Promise<void> {
  memory.delete(deviceId);
  if (!useMemoryOnly) await SecureStore.deleteItemAsync(keyFor(deviceId));
}

export function clearPasswordCache(): void {
  memory.clear();
}
