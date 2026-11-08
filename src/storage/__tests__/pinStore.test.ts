import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { BASE_LOCKOUT_MS, FREE_ATTEMPTS } from '@/core/pin';
import { PIN_FAILS_KEY, usePinStore } from '../pinStore';

const secure = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(async () => {
  await AsyncStorage.clear();
  secure.clear();
  usePinStore.setState({ loaded: false, hasPin: false, unlocked: false, fails: { failures: 0, lastFailAt: 0 } });
});

describe('PIN store', () => {
  it('no PIN → unlocked after load', async () => {
    await usePinStore.getState().load();
    expect(usePinStore.getState()).toMatchObject({ loaded: true, hasPin: false, unlocked: true });
  });

  it('stores the PIN only in secure storage and locks on next start', async () => {
    await usePinStore.getState().setPin('2580');
    expect([...secure.values()]).toContain('2580');
    const plain = JSON.stringify(await AsyncStorage.multiGet(await AsyncStorage.getAllKeys()));
    expect(plain).not.toContain('2580');
    usePinStore.setState({ loaded: false, unlocked: false });
    await usePinStore.getState().load();
    expect(usePinStore.getState()).toMatchObject({ hasPin: true, unlocked: false });
  });

  it('rejects weak PINs', async () => {
    await expect(usePinStore.getState().setPin('1111')).rejects.toThrow();
  });

  it('unlocks with the right PIN, counts wrong ones, then imposes a wait that survives restarts', async () => {
    await usePinStore.getState().setPin('2580');
    usePinStore.getState().lock();
    for (let i = 0; i < FREE_ATTEMPTS - 1; i++) {
      expect(await usePinStore.getState().tryUnlock('9999', 1000)).toEqual({ ok: false, waitMs: 0 });
    }
    expect(await usePinStore.getState().tryUnlock('9999', 1000)).toEqual({ ok: false, waitMs: BASE_LOCKOUT_MS });
    // even the right PIN is refused while waiting
    expect((await usePinStore.getState().tryUnlock('2580', 2000)).ok).toBe(false);
    // restart: the failure count is persisted
    expect(await AsyncStorage.getItem(PIN_FAILS_KEY)).toContain(String(FREE_ATTEMPTS));
    usePinStore.setState({ loaded: false, fails: { failures: 0, lastFailAt: 0 } });
    await usePinStore.getState().load();
    expect(usePinStore.getState().fails.failures).toBe(FREE_ATTEMPTS);
    // after the wait the right PIN works and resets the counter
    expect(await usePinStore.getState().tryUnlock('2580', 1000 + BASE_LOCKOUT_MS)).toEqual({ ok: true });
    expect(usePinStore.getState()).toMatchObject({ unlocked: true, fails: { failures: 0 } });
  });

  it('removing the PIN unlocks and deletes the secret', async () => {
    await usePinStore.getState().setPin('2580');
    await usePinStore.getState().removePin();
    expect(secure.size).toBe(0);
    expect(usePinStore.getState()).toMatchObject({ hasPin: false, unlocked: true });
  });
});
