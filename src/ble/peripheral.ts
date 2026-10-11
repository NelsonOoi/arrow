import { setServices, startAdvertising, stopAdvertising } from 'munim-bluetooth';

import { ARROW_SERVICE_UUID, LOCAL_NAME_PREFIX, TOKEN_CHAR_UUID } from './constants';
import { tokenToHex } from './token';

/**
 * Exposes the token GATT characteristic and advertises ARROW_SERVICE_UUID with localName `AR` + token.
 * Always restarts, so it is safe to call again after a token change or an adapter power cycle.
 * Throws if the native side rejects (e.g. iOS when the adapter isn't powered on).
 */
export function startPresence(token: string): void {
  stopPresence();
  setServices([
    {
      uuid: ARROW_SERVICE_UUID,
      characteristics: [
        {
          uuid: TOKEN_CHAR_UUID,
          properties: ['read'],
          permissions: ['read'],
          value: tokenToHex(token),
        },
      ],
    },
  ]);
  // Android puts the service UUID in the advertisement and the name (via the adapter name) in the scan response.
  startAdvertising({
    serviceUUIDs: [ARROW_SERVICE_UUID],
    localName: LOCAL_NAME_PREFIX + token,
  });
}

export function stopPresence(): void {
  try {
    stopAdvertising();
  } catch {
    // Not advertising, or the adapter is off.
  }
}
