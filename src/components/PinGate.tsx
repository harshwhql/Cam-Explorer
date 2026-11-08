import { useState } from 'react';

import type { PinScope } from '@/core/pin';
import { useNow } from '@/hooks/lifecycle';
import { usePinStore } from '@/storage/pinStore';
import { useAppStore } from '@/storage/store';
import { PinPad } from './PinPad';

/**
 * Shows the PIN pad instead of `children` while locked.
 * scope "settings" (Devices/Settings screens) always applies once a PIN is set;
 * scope "app" only when the user chose to lock the whole app.
 */
export function PinGate({ scope, children }: { scope: PinScope; children: React.ReactNode }) {
  const { loaded, hasPin, unlocked, tryUnlock } = usePinStore();
  const appScope = useAppStore((s) => s.settings.pinLockApp);
  const [error, setError] = useState<string | null>(null);
  const [waitUntil, setWaitUntil] = useState(0);
  const now = useNow(1000, waitUntil > 0);
  const waiting = waitUntil > now;

  const applies = scope === 'settings' || appScope;
  if (!loaded) return null; // fail closed until we know whether a PIN is set
  if (!hasPin || unlocked || !applies) return <>{children}</>;

  const onSubmit = async (pin: string) => {
    const r = await tryUnlock(pin);
    if (r.ok) {
      setError(null);
      setWaitUntil(0);
    } else {
      setError(r.waitMs > 0 ? 'Too many wrong attempts' : 'Wrong PIN');
      setWaitUntil(r.waitMs > 0 ? Date.now() + r.waitMs : 0);
    }
  };

  return (
    <PinPad
      title="Enter PIN"
      subtitle={waiting ? `Try again in ${Math.ceil((waitUntil - now) / 1000)} s` : scope === 'app' ? undefined : 'Settings are locked'}
      error={error}
      disabled={waiting}
      onSubmit={onSubmit}
    />
  );
}
