import { addDeviceFoundListener, addEventListener, startScan, stopScan } from 'munim-bluetooth';
import type { BLEDevice } from 'munim-bluetooth';

import type { DeviceSighting, Sighting, TokenSource } from '@/types';

import {
  ARROW_SERVICE_UUID,
  GATT_FALLBACK_DELAY_MS,
  GATT_RETRY_BACKOFF_MS,
  TOKEN_CACHE_TTL_MS,
} from './constants';
import { readTokenViaGatt } from './resolveToken';
import { createTokenCache, parseToken } from './token';

const MAX_CONCURRENT_GATT_READS = 2;
/** iOS reports 127 when RSSI is unavailable. */
const INVALID_RSSI = 127;

type ScanSession = {
  stopped: boolean;
  removeListeners: () => void;
};

let session: ScanSession | null = null;

export type ScanOptions = {
  /**
   * Scan without the Arrow service filter and report every device to `onDevice`. Arrow peers are
   * still resolved, but GATT is only attempted on devices that advertise the Arrow service, so we
   * never connect to strangers' hardware. iOS peers advertising from the background are missed in
   * this mode because their service UUID is only visible to filtered scans.
   */
  allDevices?: boolean;
  onDevice?: (sighting: DeviceSighting) => void;
};

/** Scans for ARROW_SERVICE_UUID and emits only sightings whose token has been resolved. */
export function startScanning(
  onSighting: (sighting: Sighting) => void,
  onError?: (message: string) => void,
  { allDevices = false, onDevice }: ScanOptions = {},
): void {
  stopScanning();

  const nameCache = createTokenCache(TOKEN_CACHE_TTL_MS);
  const gattCache = createTokenCache(TOKEN_CACHE_TTL_MS);
  const gattInFlight = new Set<string>();
  const gattFailedAt = new Map<string, number>();
  const unnamedSince = new Map<string, number>();
  const current: ScanSession = { stopped: false, removeListeners: () => {} };

  const resolveViaGatt = (deviceId: string, now: number) => {
    if (gattInFlight.has(deviceId) || gattInFlight.size >= MAX_CONCURRENT_GATT_READS) return;
    const failedAt = gattFailedAt.get(deviceId);
    if (failedAt !== undefined && now - failedAt < GATT_RETRY_BACKOFF_MS) return;
    gattInFlight.add(deviceId);
    void readTokenViaGatt(deviceId).then((token) => {
      if (current.stopped) return;
      gattInFlight.delete(deviceId);
      if (token) {
        gattFailedAt.delete(deviceId);
        gattCache.set(deviceId, token, Date.now());
      } else {
        gattFailedAt.set(deviceId, Date.now());
      }
    });
  };

  const resolve = (
    device: BLEDevice,
    now: number,
    allowGatt: boolean,
  ): { token: string; source: TokenSource } | null => {
    const advertised = parseToken(device.localName) ?? parseToken(device.name);
    if (advertised) {
      unnamedSince.delete(device.id);
      nameCache.set(device.id, advertised, now);
      return { token: advertised, source: 'localName' };
    }
    const named = nameCache.get(device.id, now);
    if (named) return { token: named, source: 'localName' };
    const read = gattCache.get(device.id, now);
    if (read) return { token: read, source: 'gatt' };
    if (!allowGatt) return null;
    const since = unnamedSince.get(device.id);
    if (since === undefined) {
      unnamedSince.set(device.id, now);
    } else if (now - since >= GATT_FALLBACK_DELAY_MS) {
      resolveViaGatt(device.id, now);
    }
    return null;
  };

  const handleDevice = (device: BLEDevice) => {
    if (current.stopped) return;
    const { rssi } = device;
    if (rssi === undefined || rssi === INVALID_RSSI) return;
    const now = Date.now();
    onDevice?.({ deviceId: device.id, name: device.localName || device.name || null, rssi, ts: now });
    const advertisesArrow = device.serviceUUIDs?.some(isArrowService) ?? false;
    if (device.serviceUUIDs && !advertisesArrow) return;
    // With the native filter on, a device missing serviceUUIDs is still an Arrow phone.
    const resolved = resolve(device, now, !allDevices || advertisesArrow);
    if (!resolved) return;
    onSighting({ deviceId: device.id, token: resolved.token, rssi, ts: now, source: resolved.source });
  };

  const removeDeviceListener = addDeviceFoundListener(handleDevice);
  const removeFailListener = addEventListener('scanFailed', ({ message }) => {
    if (!current.stopped) onError?.(message);
  });
  current.removeListeners = () => {
    removeDeviceListener();
    removeFailListener();
  };
  session = current;

  try {
    startScan({
      serviceUUIDs: allDevices ? undefined : [ARROW_SERVICE_UUID],
      allowDuplicates: true,
      scanMode: 'lowLatency',
    });
  } catch (error) {
    stopScanning();
    if (!onError) throw error;
    onError(error instanceof Error ? error.message : String(error));
  }
}

export function stopScanning(): void {
  const current = session;
  session = null;
  if (current) {
    current.stopped = true;
    current.removeListeners();
  }
  try {
    stopScan();
  } catch {
    // Not scanning, or the adapter is off.
  }
}

function isArrowService(uuid: string): boolean {
  return uuid.toUpperCase() === ARROW_SERVICE_UUID.toUpperCase();
}
