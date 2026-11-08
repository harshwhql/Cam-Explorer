import { create } from 'zustand';

import { applyMotionPoll, clearDevice, type MotionMap } from '@/core/motion';

/** Live motion state (not persisted). Written by useMotionWatcher, read by the grid. */
interface MotionStore {
  motion: MotionMap;
  report(deviceId: string, activeChannels: number[], now?: number): void;
  clear(deviceId: string): void;
}

export const useMotionStore = create<MotionStore>((set, get) => ({
  motion: {},
  report(deviceId, activeChannels, now = Date.now()) {
    const next = applyMotionPoll(get().motion, deviceId, activeChannels, now);
    if (next !== get().motion) set({ motion: next });
  },
  clear(deviceId) {
    const next = clearDevice(get().motion, deviceId);
    if (next !== get().motion) set({ motion: next });
  },
}));
