import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { NO_FAILS, pinMatches, recordFailure, sanitizeFailState, validatePin, waitRemaining, type FailState } from '@/core/pin';
import { unwrap, wrap } from '@/core/schema';
import { deletePin, loadPin, savePin } from './secrets';

export const PIN_FAILS_KEY = 'camx.pinFails';

export type UnlockResult = { ok: true } | { ok: false; waitMs: number };

interface PinStore {
  loaded: boolean;
  hasPin: boolean;
  unlocked: boolean;
  fails: FailState;
  load(): Promise<void>;
  setPin(pin: string): Promise<void>;
  removePin(): Promise<void>;
  tryUnlock(pin: string, now?: number): Promise<UnlockResult>;
  lock(): void;
}

async function saveFails(f: FailState) {
  await AsyncStorage.setItem(PIN_FAILS_KEY, wrap(f)).catch(() => undefined);
}

export const usePinStore = create<PinStore>((set, get) => ({
  loaded: false,
  hasPin: false,
  unlocked: false,
  fails: NO_FAILS,

  async load() {
    let hasPin = false;
    let fails = NO_FAILS;
    try {
      hasPin = !!(await loadPin());
      fails = sanitizeFailState(unwrap(await AsyncStorage.getItem(PIN_FAILS_KEY)));
    } catch {
      // Keystore unavailable → behave as "no PIN" rather than locking the user out forever.
    }
    set({ loaded: true, hasPin, fails, unlocked: !hasPin });
  },

  async setPin(pin) {
    const err = validatePin(pin);
    if (err) throw new Error(err);
    await savePin(pin);
    await saveFails(NO_FAILS);
    set({ hasPin: true, unlocked: true, fails: NO_FAILS });
  },

  async removePin() {
    await deletePin();
    await saveFails(NO_FAILS);
    set({ hasPin: false, unlocked: true, fails: NO_FAILS });
  },

  async tryUnlock(pin, now = Date.now()) {
    const wait = waitRemaining(get().fails, now);
    if (wait > 0) return { ok: false, waitMs: wait };
    const stored = await loadPin();
    if (stored && pinMatches(pin, stored)) {
      await saveFails(NO_FAILS);
      set({ unlocked: true, fails: NO_FAILS });
      return { ok: true };
    }
    const fails = recordFailure(get().fails, now);
    await saveFails(fails);
    set({ fails });
    return { ok: false, waitMs: waitRemaining(fails, now) };
  },

  lock() {
    if (get().hasPin) set({ unlocked: false });
  },
}));
