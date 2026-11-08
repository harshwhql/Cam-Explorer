import { useMemo } from 'react';

import { arrangeCameras } from '@/core/arrange';
import { allCameras, streamSourceFor } from '@/core/rtsp';
import type { Camera, Device, StreamQuality, StreamSource } from '@/core/types';
import { cachedPassword } from '@/storage/secrets';
import { useAppStore } from '@/storage/store';

/** All enabled cameras, favourites first, then in the user's order. */
export function useCameras(): { cameras: Camera[]; devices: Device[]; byDevice: Map<string, Device> } {
  const devices = useAppStore((s) => s.devices);
  const order = useAppStore((s) => s.settings.cameraOrder);
  const favorites = useAppStore((s) => s.settings.favorites);
  return useMemo(() => {
    const byDevice = new Map(devices.map((d) => [d.id, d] as const));
    return { cameras: arrangeCameras(allCameras(devices), order, favorites), devices, byDevice };
  }, [devices, order, favorites]);
}

export function sourceForCamera(device: Device | undefined, camera: Camera, quality: StreamQuality): StreamSource | null {
  if (!device) return null;
  try {
    const src = streamSourceFor(device, camera.channel, quality);
    return { ...src, password: cachedPassword(device.id) };
  } catch {
    return null;
  }
}
