import {
  initialEngineState,
  MIN_SAMPLES_FOR_NEAR,
  reduce,
  type EngineState,
} from '@/proximity/engine';
import type { ProximityAlert, ProximityConfig, Sighting } from '@/types';

const MATCH = 'B3QX';
const STRANGER = 'C9MD';

const config: ProximityConfig = {
  threshold: -65,
  hysteresis: 5,
  windowSize: 3,
  cooldownMs: 30_000,
  staleMs: 10_000,
  matchTokens: new Set([MATCH]),
};

function sighting(token: string, rssi: number, deviceId = `dev-${token}`): Sighting {
  return { deviceId, token, rssi, ts: 0, source: 'localName' };
}

/** Feeds one sighting per RSSI value, 100ms apart starting at `start`, collecting every alert. */
function feed(
  state: EngineState,
  token: string,
  rssis: number[],
  start: number,
  cfg: ProximityConfig = config,
): { state: EngineState; alerts: ProximityAlert[]; now: number } {
  let now = start;
  const alerts: ProximityAlert[] = [];
  rssis.forEach((rssi, i) => {
    now = start + i * 100;
    const result = reduce(state, { type: 'sighting', sighting: sighting(token, rssi) }, now, cfg);
    state = result.state;
    alerts.push(...result.alerts);
  });
  return { state, alerts, now };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

describe('reduce: sightings', () => {
  it('creates a peer with all fields from the first sighting', () => {
    const { state, alerts } = reduce(
      initialEngineState(),
      { type: 'sighting', sighting: sighting(MATCH, -80) },
      1_000,
      config,
    );
    expect(alerts).toEqual([]);
    expect(state.peers[MATCH]).toEqual({
      token: MATCH,
      deviceId: `dev-${MATCH}`,
      source: 'localName',
      samples: [-80],
      lastRssi: -80,
      smoothedRssi: -80,
      isNear: false,
      isMatch: true,
      firstSeen: 1_000,
      lastSeen: 1_000,
      lastAlertAt: null,
    });
  });

  it('smooths RSSI with a moving average over the last windowSize samples', () => {
    let { state } = feed(initialEngineState(), STRANGER, [-60, -70, -80], 0);
    expect(state.peers[STRANGER].samples).toEqual([-60, -70, -80]);
    expect(state.peers[STRANGER].smoothedRssi).toBe(-70);

    ({ state } = feed(state, STRANGER, [-50], 1_000));
    const peer = state.peers[STRANGER];
    expect(peer.samples).toEqual([-70, -80, -50]);
    expect(peer.smoothedRssi).toBeCloseTo(-200 / 3);
    expect(peer.lastRssi).toBe(-50);
    expect(peer.firstSeen).toBe(0);
    expect(peer.lastSeen).toBe(1_000);
  });

  it('updates deviceId and source to the latest sighting', () => {
    let { state } = feed(initialEngineState(), MATCH, [-80], 0);
    state = reduce(
      state,
      { type: 'sighting', sighting: { ...sighting(MATCH, -81, 'dev-new'), source: 'gatt' } },
      100,
      config,
    ).state;
    expect(state.peers[MATCH].deviceId).toBe('dev-new');
    expect(state.peers[MATCH].source).toBe('gatt');
  });

  it('emits exactly one alert on the far->near crossing', () => {
    let { state, alerts } = feed(initialEngineState(), MATCH, [-80, -80, -80], 0);
    expect(alerts).toEqual([]);
    expect(state.peers[MATCH].isNear).toBe(false);

    // [-80,-80,-50] = -70 (far), [-80,-50,-50] = -60 (near), then stays near.
    ({ state, alerts } = feed(state, MATCH, [-50, -50, -50, -50], 1_000));
    expect(alerts).toEqual([{ token: MATCH, at: 1_100, smoothedRssi: -60 }]);
    expect(state.peers[MATCH].isNear).toBe(true);
    expect(state.peers[MATCH].lastAlertAt).toBe(1_100);
  });

  it('treats smoothedRssi exactly at the threshold as near', () => {
    const { state, alerts } = feed(initialEngineState(), MATCH, [-65, -65, -65], 0);
    expect(state.peers[MATCH].isNear).toBe(true);
    expect(alerts).toHaveLength(1);
  });

  it('does not flip or re-alert while RSSI hovers inside the hysteresis band', () => {
    let { state, alerts } = feed(initialEngineState(), MATCH, [-60, -60, -60], 0);
    expect(alerts).toHaveLength(1);

    const hover = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? -64 : -68));
    let now = 1_000;
    for (const [i, rssi] of hover.entries()) {
      const result = reduce(state, { type: 'sighting', sighting: sighting(MATCH, rssi) }, now, config);
      state = result.state;
      expect(result.alerts).toEqual([]);
      if (i >= config.windowSize - 1) {
        expect(state.peers[MATCH].smoothedRssi).toBeLessThan(config.threshold);
      }
      expect(state.peers[MATCH].isNear).toBe(true);
      now += 100;
    }

    // Exactly threshold - hysteresis (-70) is still near; strictly below flips to far.
    ({ state } = feed(state, MATCH, [-70, -70, -70], now));
    expect(state.peers[MATCH].smoothedRssi).toBe(-70);
    expect(state.peers[MATCH].isNear).toBe(true);

    ({ state, alerts } = feed(state, MATCH, [-73], now + 1_000));
    expect(state.peers[MATCH].smoothedRssi).toBe(-71);
    expect(state.peers[MATCH].isNear).toBe(false);
    expect(alerts).toEqual([]);
  });

  it('does not become near from the far side while inside the hysteresis band', () => {
    const { state, alerts } = feed(initialEngineState(), MATCH, [-68, -68, -68, -66], 0);
    expect(state.peers[MATCH].isNear).toBe(false);
    expect(alerts).toEqual([]);
  });

  it('does not re-alert within the cooldown across a near->far->near cycle', () => {
    let { state, alerts } = feed(initialEngineState(), MATCH, [-60, -60, -60], 0);
    expect(alerts).toHaveLength(1);
    const firstAlertAt = alerts[0].at;

    ({ state } = feed(state, MATCH, [-85, -85, -85], 5_000));
    expect(state.peers[MATCH].isNear).toBe(false);

    ({ state, alerts } = feed(state, MATCH, [-60, -60, -60], 10_000));
    expect(state.peers[MATCH].isNear).toBe(true);
    expect(alerts).toEqual([]);
    expect(state.peers[MATCH].lastAlertAt).toBe(firstAlertAt);
  });

  it('alerts again after the cooldown once the peer went far and came back near', () => {
    let { state, alerts } = feed(initialEngineState(), MATCH, [-60, -60, -60], 0);
    const firstAlertAt = alerts[0].at;

    // Staying near past the cooldown must not alert on its own.
    ({ state, alerts } = feed(state, MATCH, [-60], firstAlertAt + config.cooldownMs + 1));
    expect(alerts).toEqual([]);

    ({ state } = feed(state, MATCH, [-85, -85, -85], 40_000));
    expect(state.peers[MATCH].isNear).toBe(false);

    const backAt = 45_000;
    ({ state, alerts } = feed(state, MATCH, [-60, -60, -60], backAt));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].token).toBe(MATCH);
    expect(state.peers[MATCH].lastAlertAt).toBe(alerts[0].at);
    expect(alerts[0].at).toBeGreaterThanOrEqual(backAt);
  });

  it('alerts at exactly cooldownMs after the previous alert', () => {
    let { state, alerts } = feed(initialEngineState(), MATCH, [-60, -60, -60], 0);
    const firstAlertAt = alerts[0].at;
    ({ state } = feed(state, MATCH, [-85, -85, -85], 1_000));
    const result = reduce(
      feed(state, MATCH, [-60, -60], firstAlertAt + config.cooldownMs - 200).state,
      { type: 'sighting', sighting: sighting(MATCH, -60) },
      firstAlertAt + config.cooldownMs,
      config,
    );
    expect(result.alerts).toHaveLength(1);
  });

  it('tracks non-matches but never alerts for them', () => {
    const { state, alerts } = feed(initialEngineState(), STRANGER, [-50, -50, -50, -50], 0);
    expect(alerts).toEqual([]);
    expect(state.peers[STRANGER]).toMatchObject({ isNear: true, isMatch: false, lastAlertAt: null });
  });

  it('does not alert on a single spike from a brand-new peer', () => {
    expect(MIN_SAMPLES_FOR_NEAR).toBe(3);
    let { state, alerts } = feed(initialEngineState(), MATCH, [-30], 0);
    expect(alerts).toEqual([]);
    expect(state.peers[MATCH].smoothedRssi).toBe(-30);
    expect(state.peers[MATCH].isNear).toBe(false);

    ({ state, alerts } = feed(state, MATCH, [-90, -90], 100));
    expect(alerts).toEqual([]);
    expect(state.peers[MATCH].isNear).toBe(false);
  });

  it('does not alert on a single spike from a far peer', () => {
    let { state, alerts } = feed(initialEngineState(), MATCH, [-85, -85, -85], 0);
    // [-85,-85,-45] = -71.7, still far.
    ({ state, alerts } = feed(state, MATCH, [-45], 1_000));
    expect(alerts).toEqual([]);
    expect(state.peers[MATCH].isNear).toBe(false);
  });

  it('caps the minimum sample count at windowSize', () => {
    const tiny = { ...config, windowSize: 1 };
    const { state, alerts } = feed(initialEngineState(), MATCH, [-60], 0, tiny);
    expect(state.peers[MATCH].isNear).toBe(true);
    expect(alerts).toHaveLength(1);
  });

  it('does not mutate the input state', () => {
    const base = feed(initialEngineState(), MATCH, [-80, -80, -80], 0).state;
    const withStranger = feed(base, STRANGER, [-70], 400).state;
    const frozen = deepFreeze(withStranger);
    const snapshot = JSON.parse(JSON.stringify(frozen));

    const near = feed(frozen, MATCH, [-40, -40, -40], 1_000);
    expect(near.alerts).toHaveLength(1);
    const ticked = reduce(frozen, { type: 'tick' }, 20_000, {
      ...config,
      matchTokens: new Set([STRANGER]),
    });
    expect(ticked.state.peers).toEqual({});

    expect(JSON.parse(JSON.stringify(frozen))).toEqual(snapshot);
    expect(near.state).not.toBe(frozen);
    expect(near.state.peers).not.toBe(frozen.peers);
  });
});

describe('reduce: tick', () => {
  it('evicts peers not seen for more than staleMs', () => {
    let { state } = feed(initialEngineState(), MATCH, [-70], 0);
    ({ state } = feed(state, STRANGER, [-70], 5_000));

    state = reduce(state, { type: 'tick' }, 10_000, config).state;
    expect(Object.keys(state.peers).sort()).toEqual([MATCH, STRANGER]);

    state = reduce(state, { type: 'tick' }, 10_001, config).state;
    expect(Object.keys(state.peers)).toEqual([STRANGER]);

    state = reduce(state, { type: 'tick' }, 15_001, config).state;
    expect(state.peers).toEqual({});
  });

  it('recomputes isMatch from the current matchTokens', () => {
    let { state } = feed(initialEngineState(), MATCH, [-70], 0);
    ({ state } = feed(state, STRANGER, [-70], 0));
    expect(state.peers[MATCH].isMatch).toBe(true);
    expect(state.peers[STRANGER].isMatch).toBe(false);

    state = reduce(state, { type: 'tick' }, 1_000, {
      ...config,
      matchTokens: new Set([STRANGER]),
    }).state;
    expect(state.peers[MATCH].isMatch).toBe(false);
    expect(state.peers[STRANGER].isMatch).toBe(true);
  });

  it('never emits alerts', () => {
    const { state } = feed(initialEngineState(), MATCH, [-60, -60], 0);
    expect(reduce(state, { type: 'tick' }, 1_000, config).alerts).toEqual([]);
  });

  it('returns the same state object when nothing changed', () => {
    const { state } = feed(initialEngineState(), MATCH, [-70], 0);
    expect(reduce(state, { type: 'tick' }, 1_000, config).state).toBe(state);
  });

  it('keeps the cooldown for a peer that was evicted and reappears', () => {
    let { state, alerts } = feed(initialEngineState(), MATCH, [-60, -60, -60], 0);
    expect(alerts).toHaveLength(1);

    state = reduce(state, { type: 'tick' }, 12_000, config).state;
    expect(state.peers[MATCH]).toBeUndefined();

    ({ state, alerts } = feed(state, MATCH, [-60, -60, -60], 15_000));
    expect(state.peers[MATCH].isNear).toBe(true);
    expect(alerts).toEqual([]);

    state = reduce(state, { type: 'tick' }, 28_000, config).state;
    state = reduce(state, { type: 'tick' }, 31_000, config).state;
    ({ state, alerts } = feed(state, MATCH, [-60, -60, -60], 45_000));
    expect(alerts).toHaveLength(1);
  });
});
