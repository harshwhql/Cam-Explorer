import { router } from 'expo-router';
import { useState } from 'react';

import { PinPad } from '@/components/PinPad';
import { PinGate } from '@/components/PinGate';
import { validatePin } from '@/core/pin';
import { usePinStore } from '@/storage/pinStore';

/** Set or change the app PIN: enter it twice. Changing requires the current PIN first. */
export default function SetPinScreen() {
  const setPin = usePinStore((s) => s.setPin);
  const [first, setFirst] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (pin: string) => {
    if (first === null) {
      const err = validatePin(pin);
      if (err) return setError(err);
      setFirst(pin);
      setError(null);
      return;
    }
    if (pin !== first) {
      setFirst(null);
      setError("PINs didn't match — start again");
      return;
    }
    await setPin(pin);
    router.back();
  };

  return (
    <PinGate scope="settings">
      <PinPad
        key={first === null ? 'first' : 'confirm'}
        title={first === null ? 'Choose a PIN' : 'Enter it again'}
        subtitle="4–8 digits. Protects Settings and Devices (and optionally the whole app)."
        error={error}
        onSubmit={onSubmit}
      />
    </PinGate>
  );
}
