import { LOCAL_NAME_PREFIX, TOKEN_LENGTH, TOKEN_PATTERN } from './constants';

/** Returns the 4-char token from a local name like `ARA7K2` (case-insensitive), or null for anything else. */
export function parseToken(localName: string | null | undefined): string | null {
  if (typeof localName !== 'string') return null;
  const name = localName.trim().toUpperCase();
  if (name.length !== LOCAL_NAME_PREFIX.length + TOKEN_LENGTH) return null;
  if (!name.startsWith(LOCAL_NAME_PREFIX)) return null;
  const token = name.slice(LOCAL_NAME_PREFIX.length);
  return TOKEN_PATTERN.test(token) ? token : null;
}

/** Lowercase hex without a `0x` prefix, the format munim-bluetooth uses for characteristic values. */
export function tokenToHex(token: string): string {
  let hex = '';
  for (const char of token.toUpperCase()) {
    hex += (char.charCodeAt(0) & 0xff).toString(16).padStart(2, '0');
  }
  return hex;
}

/** Decodes a GATT hex value back into a token, or null if it isn't a valid token. */
export function hexToToken(hex: string): string | null {
  if (typeof hex !== 'string') return null;
  const clean = hex.replace(/\s+/g, '').replace(/^0x/i, '');
  if (clean.length !== TOKEN_LENGTH * 2 || !/^[0-9a-f]+$/i.test(clean)) return null;
  let decoded = '';
  for (let i = 0; i < clean.length; i += 2) {
    decoded += String.fromCharCode(parseInt(clean.slice(i, i + 2), 16));
  }
  const token = decoded.toUpperCase();
  return TOKEN_PATTERN.test(token) ? token : null;
}

export type TokenCache = {
  get: (deviceId: string, now: number) => string | null;
  set: (deviceId: string, token: string, now: number) => void;
  clear: () => void;
};

/** Entries expire once `now - setAt >= ttlMs`; expired entries are dropped on read. */
export function createTokenCache(ttlMs: number): TokenCache {
  const entries = new Map<string, { token: string; setAt: number }>();
  return {
    get: (deviceId, now) => {
      const entry = entries.get(deviceId);
      if (!entry) return null;
      if (now - entry.setAt >= ttlMs) {
        entries.delete(deviceId);
        return null;
      }
      return entry.token;
    },
    set: (deviceId, token, now) => {
      entries.set(deviceId, { token, setAt: now });
    },
    clear: () => {
      entries.clear();
    },
  };
}
