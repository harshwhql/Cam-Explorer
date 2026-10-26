import { useTVEventHandler } from 'react-native';

export interface RemoteEvent {
  /** 'left' | 'right' | 'up' | 'down' | 'select' | 'playPause' | 'channelUp' | 'channelDown' | 'menu' | 'info' | … */
  eventType: string;
}

/** TV remote / D-pad key presses (key-down only). Web has its own implementation. */
export function useRemote(handler: (e: RemoteEvent) => void): void {
  useTVEventHandler((evt) => {
    if (!evt || Number(evt.eventKeyAction) === 1) return; // ignore key-up
    handler({ eventType: evt.eventType });
  });
}
