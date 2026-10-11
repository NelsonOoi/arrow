export type User = {
  id: string;
  /** 4 characters, A-Z and 0-9. Advertised over BLE as `${LOCAL_NAME_PREFIX}${token}`. */
  token: string;
  name: string;
  role: string;
  company: string;
  interests: string[];
  matchIds: string[];
};

export type TokenSource = 'localName' | 'gatt';

/** One BLE advertisement from another Arrow phone, with its token already resolved. */
export type Sighting = {
  deviceId: string;
  token: string;
  rssi: number;
  ts: number;
  source: TokenSource;
};

export type ProximityConfig = {
  /** Smoothed RSSI (dBm) at or above this counts as near. */
  threshold: number;
  /** A near peer only becomes far again below `threshold - hysteresis`. */
  hysteresis: number;
  /** Number of recent RSSI samples in the moving average. */
  windowSize: number;
  /** Minimum time between two alerts for the same peer. */
  cooldownMs: number;
  /** Peers not seen for this long are evicted on the next tick. */
  staleMs: number;
  /** Tokens of the current user's matches. Only these can alert. */
  matchTokens: ReadonlySet<string>;
};

export type PeerState = {
  token: string;
  deviceId: string;
  source: TokenSource;
  /** Most recent RSSI samples, oldest first, at most `windowSize` long. */
  samples: number[];
  lastRssi: number;
  smoothedRssi: number;
  isNear: boolean;
  isMatch: boolean;
  firstSeen: number;
  lastSeen: number;
  lastAlertAt: number | null;
};

export type ProximityAlert = {
  token: string;
  at: number;
  smoothedRssi: number;
};

export type RadarStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'denied'
  | 'poweredOff'
  | 'error';
