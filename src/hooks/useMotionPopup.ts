import { router } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import type { DahuaDevice } from '@/core/types';
import { cachedPassword } from '@/storage/secrets';
import { useAppStore } from '@/storage/store';
import { addPopupListener, startMotionPopup, stopMotionPopup, takePendingPopup } from 'rtsp-player';

/**
 * Background motion pop-up: keeps the native motion service in sync with the settings and
 * recorders, and opens the camera (as picture-in-picture) when the service brings us forward.
 */
export function useMotionPopup(ready: boolean): void {
  const enabled = useAppStore((s) => s.settings.motionPopup);
  const devices = useAppStore((s) => s.devices);

  useEffect(() => {
    if (!ready) return;
    const recorders = devices
      .filter((d): d is DahuaDevice => d.kind === 'dahua')
      .map((d) => ({
        deviceId: d.id,
        host: d.host,
        httpPort: d.httpPort,
        username: d.username,
        password: cachedPassword(d.id) ?? '',
        channels: d.channels.filter((c) => c.enabled).map((c) => ({ number: c.number, cameraId: `${d.id}:${c.number}` })),
      }))
      .filter((r) => r.channels.length > 0);
    if (enabled && recorders.length) startMotionPopup(recorders);
    else stopMotionPopup();
  }, [ready, enabled, devices]);

  useEffect(() => {
    if (!ready) return;
    const open = (cameraId: string | null) => {
      if (!cameraId) return;
      router.push({ pathname: '/camera/[id]', params: { id: cameraId, popup: '1' } });
    };
    open(takePendingPopup());
    const unPopup = addPopupListener(() => {
      // The service also brings the activity forward; open once we're visible.
      if (AppState.currentState === 'active') open(takePendingPopup());
    });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') open(takePendingPopup());
    });
    return () => {
      unPopup();
      sub.remove();
    };
  }, [ready]);
}
