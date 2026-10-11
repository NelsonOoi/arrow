import type { PeerState, ProximityAlert, ProximityConfig, Sighting } from '@/types';

export type EngineState = {
  peers: Record<string, PeerState>;
  /**
   * Last alert time per token, kept independently of `peers` so a peer that is evicted as stale
   * and then reappears still respects the cooldown. Pruned on tick once the cooldown has passed.
   */
  lastAlerts: Record<string, number>;
};

export type EngineEvent = { type: 'sighting'; sighting: Sighting } | { type: 'tick' };

export type EngineResult = { state: EngineState; alerts: ProximityAlert[] };

/** A peer needs at least min(MIN_SAMPLES_FOR_NEAR, windowSize) samples before it can become near, so a single spike from a newly seen phone can't alert. */
export const MIN_SAMPLES_FOR_NEAR = 3;

export function initialEngineState(): EngineState {
  return { peers: {}, lastAlerts: {} };
}

export function reduce(
  state: EngineState,
  event: EngineEvent,
  now: number,
  config: ProximityConfig,
): EngineResult {
  return event.type === 'sighting'
    ? reduceSighting(state, event.sighting, now, config)
    : reduceTick(state, now, config);
}

function reduceSighting(
  state: EngineState,
  sighting: Sighting,
  now: number,
  config: ProximityConfig,
): EngineResult {
  const { token, rssi } = sighting;
  const prev = state.peers[token];
  const windowSize = Math.max(1, Math.floor(config.windowSize));
  const samples = [...(prev?.samples ?? []), rssi].slice(-windowSize);
  const smoothedRssi = mean(samples);
  const isMatch = config.matchTokens.has(token);
  const wasNear = prev?.isNear ?? false;

  const isNear = wasNear
    ? smoothedRssi >= config.threshold - config.hysteresis
    : samples.length >= Math.min(MIN_SAMPLES_FOR_NEAR, windowSize) &&
      smoothedRssi >= config.threshold;

  let lastAlertAt = prev?.lastAlertAt ?? state.lastAlerts[token] ?? null;
  const alerts: ProximityAlert[] = [];
  if (
    !wasNear &&
    isNear &&
    isMatch &&
    (lastAlertAt === null || now - lastAlertAt >= config.cooldownMs)
  ) {
    lastAlertAt = now;
    alerts.push({ token, at: now, smoothedRssi });
  }

  const peer: PeerState = {
    token,
    deviceId: sighting.deviceId,
    source: sighting.source,
    samples,
    lastRssi: rssi,
    smoothedRssi,
    isNear,
    isMatch,
    firstSeen: prev?.firstSeen ?? now,
    lastSeen: now,
    lastAlertAt,
  };

  return {
    state: {
      peers: { ...state.peers, [token]: peer },
      lastAlerts: alerts.length > 0 ? { ...state.lastAlerts, [token]: now } : state.lastAlerts,
    },
    alerts,
  };
}

/** Returns the same state object when nothing changed, so callers can skip store writes. */
function reduceTick(state: EngineState, now: number, config: ProximityConfig): EngineResult {
  let peersChanged = false;
  const peers: Record<string, PeerState> = {};
  for (const [token, peer] of Object.entries(state.peers)) {
    if (now - peer.lastSeen > config.staleMs) {
      peersChanged = true;
      continue;
    }
    const isMatch = config.matchTokens.has(token);
    if (isMatch !== peer.isMatch) {
      peersChanged = true;
      peers[token] = { ...peer, isMatch };
    } else {
      peers[token] = peer;
    }
  }

  let alertsChanged = false;
  const lastAlerts: Record<string, number> = {};
  for (const [token, at] of Object.entries(state.lastAlerts)) {
    if (now - at < config.cooldownMs) {
      lastAlerts[token] = at;
    } else {
      alertsChanged = true;
    }
  }

  if (!peersChanged && !alertsChanged) {
    return { state, alerts: [] };
  }
  return {
    state: {
      peers: peersChanged ? peers : state.peers,
      lastAlerts: alertsChanged ? lastAlerts : state.lastAlerts,
    },
    alerts: [],
  };
}

function mean(values: number[]): number {
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}
