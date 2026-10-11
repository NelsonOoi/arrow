import { connect, disconnect, discoverServices, readCharacteristic } from 'munim-bluetooth';

import { ARROW_SERVICE_UUID, GATT_READ_TIMEOUT_MS, TOKEN_CHAR_UUID } from './constants';
import { hexToToken } from './token';

export { createTokenCache, hexToToken, parseToken, tokenToHex } from './token';
export type { TokenCache } from './token';

const inFlight = new Map<string, Promise<string | null>>();

/** Connects, reads TOKEN_CHAR_UUID, and disconnects. De-duplicates concurrent reads per device. */
export async function readTokenViaGatt(deviceId: string): Promise<string | null> {
  const existing = inFlight.get(deviceId);
  if (existing) return existing;
  const read = readOnce(deviceId).finally(() => {
    inFlight.delete(deviceId);
  });
  inFlight.set(deviceId, read);
  return read;
}

async function readOnce(deviceId: string): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // connect() has its own timeout, but discoverServices/readCharacteristic don't, so bound the whole exchange.
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), GATT_READ_TIMEOUT_MS);
  });
  try {
    return await Promise.race([connectAndRead(deviceId), deadline]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    try {
      disconnect(deviceId);
    } catch {
      // Already disconnected.
    }
  }
}

async function connectAndRead(deviceId: string): Promise<string | null> {
  await connect(deviceId, { timeoutMs: GATT_READ_TIMEOUT_MS });
  // Both platforms look characteristics up in the discovered service list, so discovery is required.
  await discoverServices(deviceId);
  const { value } = await readCharacteristic(deviceId, ARROW_SERVICE_UUID, TOKEN_CHAR_UUID);
  return hexToToken(value);
}
