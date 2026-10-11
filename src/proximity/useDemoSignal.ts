import { useEffect, useState } from 'react';

import type { SignalInput } from './useSignal';

const START_DBM = -92;
const END_DBM = -48;
/** How long the walk from across the room to side by side takes. */
const RAMP_MS = 9_000;
const STEP_MS = 500;
const NOISE_DB = 3;

/**
 * MOCK: a fake signal that ramps from far to right-next-to-you, for the web preview where
 * Bluetooth doesn't exist. Returns undefined when disabled, so callers can fall back to it.
 */
export function useDemoSignal(enabled: boolean): SignalInput {
  const [signal, setSignal] = useState<SignalInput>(undefined);

  useEffect(() => {
    if (!enabled) {
      setSignal(undefined);
      return;
    }
    const startedAt = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      const progress = Math.min(1, (now - startedAt) / RAMP_MS);
      const noise = (Math.random() - 0.5) * NOISE_DB;
      setSignal({ rssi: START_DBM + (END_DBM - START_DBM) * progress + noise, lastSeen: now });
    }, STEP_MS);
    return () => clearInterval(id);
  }, [enabled]);

  return signal;
}
