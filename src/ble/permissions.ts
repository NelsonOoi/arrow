import { addEventListener, isBluetoothEnabled, requestBluetoothPermission } from 'munim-bluetooth';

export type BluetoothReadiness = 'granted' | 'denied' | 'poweredOff';

/**
 * Requests scan/connect/advertise permissions, then checks the adapter is on.
 * On Android 6-11 munim maps 'scan' to ACCESS_FINE_LOCATION, so no extra location request is needed.
 */
export async function ensureBluetoothReady(): Promise<BluetoothReadiness> {
  try {
    const granted = await requestBluetoothPermission(['scan', 'connect', 'advertise']);
    if (!granted) return 'denied';
    const enabled = await isBluetoothEnabled();
    return enabled ? 'granted' : 'poweredOff';
  } catch (error) {
    console.warn('[ble] permission request failed', error);
    return 'denied';
  }
}

/**
 * Calls back with true when the adapter powers on and false when it turns off or becomes unauthorized.
 * Also emits the current state right after subscribing, so a change between an earlier check and this
 * subscription isn't missed.
 */
export function onAdapterPoweredChange(callback: (poweredOn: boolean) => void): () => void {
  let last: boolean | null = null;
  let active = true;
  const emit = (poweredOn: boolean) => {
    // Android reports turningOff then poweredOff; only surface actual changes.
    if (!active || poweredOn === last) return;
    last = poweredOn;
    callback(poweredOn);
  };
  const unsubscribe = addEventListener('adapterStateChanged', ({ state }) => {
    emit(state === 'poweredOn');
  });
  isBluetoothEnabled().then(
    (enabled) => {
      if (last === null) emit(enabled);
    },
    () => {},
  );
  return () => {
    active = false;
    unsubscribe();
  };
}
