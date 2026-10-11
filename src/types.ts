export type Side = 'A' | 'B';

/** One attendee of the live event, loaded from the matchmaker's `GET /events/{id}/attendees`. */
export type User = {
  /** Matchmaker attendee UUID. */
  id: string;
  /** 4 characters, A-Z and 0-9, assigned by the matchmaker. Advertised over BLE as `${LOCAL_NAME_PREFIX}${token}`. */
  token: string;
  name: string;
  side: Side;
  /** The event's name for this side, e.g. "mentee" or "mentor". */
  sideLabel: string;
  /** What they offer, shown to the people they're paired with. */
  about: string;
  /** What they're looking for. */
  seeking: string;
  interests: string[];
  goals: string[];
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

/** One advertisement from any Bluetooth device, Arrow or not. Only collected in all-devices mode. */
export type DeviceSighting = {
  deviceId: string;
  name: string | null;
  rssi: number;
  ts: number;
};

export type NearbyDevice = {
  id: string;
  /** Last non-empty advertised name; names arrive intermittently in scan responses. */
  name: string | null;
  samples: number[];
  smoothedRssi: number;
  firstSeen: number;
  lastSeen: number;
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
