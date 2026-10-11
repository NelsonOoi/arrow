import { MAX_TRACKED_DEVICES, pruneDevices, recordDevice, updateDevice } from '@/proximity/devices';
import type { NearbyDevice } from '@/types';

const sighting = (deviceId: string, rssi: number, ts: number, name: string | null = null) => ({
  deviceId,
  name,
  rssi,
  ts,
});

describe('updateDevice', () => {
  it('smooths over the window and keeps the last known name', () => {
    let device = updateDevice(undefined, sighting('a', -80, 1, 'Headphones'), 3);
    device = updateDevice(device, sighting('a', -70, 2), 3);
    device = updateDevice(device, sighting('a', -60, 3), 3);
    device = updateDevice(device, sighting('a', -50, 4), 3);
    expect(device.samples).toEqual([-70, -60, -50]);
    expect(device.smoothedRssi).toBe(-60);
    expect(device.name).toBe('Headphones');
    expect(device.firstSeen).toBe(1);
    expect(device.lastSeen).toBe(4);
  });
});

describe('recordDevice / pruneDevices', () => {
  it('stops adding new devices at the cap but keeps updating known ones', () => {
    const devices = new Map<string, NearbyDevice>();
    for (let i = 0; i < MAX_TRACKED_DEVICES; i++) recordDevice(devices, sighting(`d${i}`, -80, 0), 5);
    expect(recordDevice(devices, sighting('new', -40, 1), 5)).toBe(false);
    expect(recordDevice(devices, sighting('d0', -40, 1), 5)).toBe(true);
    expect(devices.size).toBe(MAX_TRACKED_DEVICES);
  });

  it('removes only stale devices', () => {
    const devices = new Map<string, NearbyDevice>();
    recordDevice(devices, sighting('old', -80, 0), 5);
    recordDevice(devices, sighting('fresh', -80, 9_000), 5);
    expect(pruneDevices(devices, 10_001, 10_000)).toBe(true);
    expect([...devices.keys()]).toEqual(['fresh']);
    expect(pruneDevices(devices, 10_001, 10_000)).toBe(false);
  });
});
