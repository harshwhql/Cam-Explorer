import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

import type { DecoderCapabilities, OnvifProbeMatch } from './src/RtspPlayer.types';

export { default as RtspPlayerView } from './src/RtspPlayerView';
export * from './src/RtspPlayer.types';

interface RtspPlayerNativeModule {
  getDecoderCapabilities(): DecoderCapabilities;
  discoverOnvif(timeoutMs: number): Promise<OnvifProbeMatch[]>;
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
