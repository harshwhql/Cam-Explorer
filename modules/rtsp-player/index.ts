import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

import type { DecoderCapabilities, OnvifProbeMatch } from './src/RtspPlayer.types';

export { default as RtspPlayerView } from './src/RtspPlayerView';
export * from './src/RtspPlayer.types';

interface RtspPlayerNativeModule {
  getDecoderCapabilities(): DecoderCapabilities;
  discoverOnvif(timeoutMs: number): Promise<OnvifProbeMatch[]>;
  addListener(event: 'onDigit', listener: (e: { digit: number }) => void): { remove(): void };
  addListener(event: 'onPipChange', listener: (e: { inPip: boolean }) => void): { remove(): void };
  isPipSupported(): boolean;
  isInPip(): boolean;
  configurePip(enable: boolean, width: number, height: number): Promise<void>;
  addListener(event: 'onPopup', listener: (e: { cameraId: string }) => void): { remove(): void };
  startMotionPopup(recorders: MotionRecorder[]): void;
  stopMotionPopup(): void;
  canPopUp(): boolean;
  takePendingPopup(): string | null;
  openOverlaySettings(): boolean;
  enterPip(): Promise<boolean>;
}

/** What the background motion service needs per recorder (kept in memory only). */
export interface MotionRecorder {
  deviceId: string;
  host: string;
  httpPort: number;
  username: string;
  password: string;
  channels: { number: number; cameraId: string }[];
}

const native =
  Platform.OS === 'android' ? requireOptionalNativeModule<RtspPlayerNativeModule>('RtspPlayer') : null;

export function getDecoderCapabilities(): DecoderCapabilities | null {
  try {
    return native?.getDecoderCapabilities() ?? null;
  } catch {
    return null;
  }
}

export async function discoverOnvif(timeoutMs = 3000): Promise<OnvifProbeMatch[]> {
  if (!native) return [];
  return native.discoverOnvif(timeoutMs);
}

export const isNativePlayerAvailable = native !== null;

/** TV-remote number keys (0-9). Returns an unsubscribe function; no-op where unsupported. */
export function addDigitListener(listener: (digit: number) => void): () => void {
  if (!native) return () => undefined;
  const sub = native.addListener('onDigit', (e) => listener(e.digit));
  return () => sub.remove();
}

/** Picture-in-picture: available on this device? */
export function isPipSupported(): boolean {
  try {
    return native?.isPipSupported() ?? false;
  } catch {
    return false;
  }
}

/** Synchronous: is the app showing as a PiP window right now? */
export function isInPip(): boolean {
  try {
    return native?.isInPip() ?? false;
  } catch {
    return false;
  }
}

/** Allow (or stop allowing) Home → PiP, with the video's aspect ratio. */
export function configurePip(enable: boolean, width = 16, height = 9): void {
  native?.configurePip(enable, Math.round(width), Math.round(height)).catch(() => undefined);
}

export function addPipListener(listener: (inPip: boolean) => void): () => void {
  if (!native) return () => undefined;
  const sub = native.addListener('onPipChange', (e) => listener(e.inPip));
  return () => sub.remove();
}

/** Start/refresh the background motion watch (pops the app up on motion). */
export function startMotionPopup(recorders: MotionRecorder[]): void {
  try {
    native?.startMotionPopup(recorders);
  } catch {
    // service could not start (e.g. OS restriction) — the in-app watcher still works
  }
}

export function stopMotionPopup(): void {
  try {
    native?.stopMotionPopup();
  } catch {
    // not running
  }
}

/** "Display over other apps" granted? Needed to come forward from the background. */
export function canPopUp(): boolean {
  try {
    return native?.canPopUp() ?? false;
  } catch {
    return false;
  }
}

export function takePendingPopup(): string | null {
  try {
    return native?.takePendingPopup() ?? null;
  } catch {
    return null;
  }
}

/** Opens the permission screen where one exists (phones/tablets). False on most TVs. */
export function openOverlaySettings(): boolean {
  try {
    return native?.openOverlaySettings() ?? false;
  } catch {
    return false;
  }
}

export async function enterPip(): Promise<boolean> {
  try {
    return (await native?.enterPip()) ?? false;
  } catch {
    return false;
  }
}

export function addPopupListener(listener: (cameraId: string) => void): () => void {
  if (!native) return () => undefined;
  const sub = native.addListener('onPopup', (e) => listener(e.cameraId));
  return () => sub.remove();
}
