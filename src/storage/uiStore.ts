import { create } from 'zustand';

/** Ephemeral UI state shared between screens (not persisted). */
interface UiStore {
  /** Camera last shown full screen — the grid restores focus to it on return. */
  lastViewedCameraId: string | null;
  setLastViewed(id: string | null): void;
}

export const useUiStore = create<UiStore>((set) => ({
  lastViewedCameraId: null,
  setLastViewed: (id) => set({ lastViewedCameraId: id }),
}));
