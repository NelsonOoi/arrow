import type { DeviceSighting, NearbyDevice } from '@/types';

/** A busy venue can have hundreds of advertisers; past this, new devices are ignored until some go stale. */
export const MAX_TRACKED_DEVICES = 300;

export function updateDevice(
  prev: NearbyDevice | undefined,
  sighting: DeviceSighting,
  windowSize: number,
): NearbyDevice {
  const size = Math.max(1, Math.floor(windowSize));
  const samples = [...(prev?.samples ?? []), sighting.rssi].slice(-size);
  return {
    id: sighting.deviceId,
    name: sighting.name || prev?.name || null,
    samples,
    smoothedRssi: samples.reduce((sum, v) => sum + v, 0) / samples.length,
    firstSeen: prev?.firstSeen ?? sighting.ts,
    lastSeen: sighting.ts,
  };
}

/** Records into `devices` in place. Returns whether anything was stored. */
export function recordDevice(
  devices: Map<string, NearbyDevice>,
  sighting: DeviceSighting,
  windowSize: number,
): boolean {
  const prev = devices.get(sighting.deviceId);
  if (!prev && devices.size >= MAX_TRACKED_DEVICES) return false;
  devices.set(sighting.deviceId, updateDevice(prev, sighting, windowSize));
  return true;
}

/** Deletes stale devices from `devices` in place. Returns whether any were removed. */
export function pruneDevices(
  devices: Map<string, NearbyDevice>,
  now: number,
  staleMs: number,
): boolean {
  let removed = false;
  for (const [id, device] of devices) {
    if (now - device.lastSeen > staleMs) {
      devices.delete(id);
      removed = true;
    }
  }
  return removed;
}
