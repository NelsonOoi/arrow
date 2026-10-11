export const ARROW_SERVICE_UUID = 'A7E0B9C2-4F1D-4C8A-9B3E-6D2F1A0C5E71';
export const TOKEN_CHAR_UUID = 'A7E0B9C3-4F1D-4C8A-9B3E-6D2F1A0C5E71';

/** Advertised local name is `AR` + 4-char token, e.g. `ARA7K2`, keeping the legacy 31-byte advertisement within budget. */
export const LOCAL_NAME_PREFIX = 'AR';
export const TOKEN_LENGTH = 4;
export const TOKEN_PATTERN = /^[A-Z0-9]{4}$/;

export const DEFAULT_RSSI_THRESHOLD = -65;
export const MIN_RSSI_THRESHOLD = -95;
export const MAX_RSSI_THRESHOLD = -35;
export const RSSI_THRESHOLD_STEP = 5;

export const HYSTERESIS_DB = 5;
export const SMOOTHING_WINDOW = 5;
export const ALERT_COOLDOWN_MS = 30_000;
export const STALE_MS = 10_000;
export const TICK_MS = 1_000;

export const TOKEN_CACHE_TTL_MS = 5 * 60_000;
export const GATT_READ_TIMEOUT_MS = 8_000;
/** Android puts the local name in the scan response, which can lag the advertisement; give it this long before connecting. */
export const GATT_FALLBACK_DELAY_MS = 1_500;
/** After a failed GATT token read, wait this long before retrying the same device. */
export const GATT_RETRY_BACKOFF_MS = 15_000;
