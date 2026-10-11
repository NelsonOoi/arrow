import {
  pushSignalSample,
  SIGNAL_CEILING_DBM,
  SIGNAL_FLOOR_DBM,
  signalLevel,
  signalStrength,
  signalTrend,
  TREND_WINDOW_MS,
} from '@/proximity/signal';

describe('signalStrength', () => {
  it('clamps to 0..1 across the floor and ceiling', () => {
    expect(signalStrength(SIGNAL_FLOOR_DBM - 20)).toBe(0);
    expect(signalStrength(SIGNAL_FLOOR_DBM)).toBe(0);
    expect(signalStrength(SIGNAL_CEILING_DBM)).toBe(1);
    expect(signalStrength(SIGNAL_CEILING_DBM + 20)).toBe(1);
    expect(signalStrength((SIGNAL_FLOOR_DBM + SIGNAL_CEILING_DBM) / 2)).toBeCloseTo(0.5);
  });
});

describe('signalLevel', () => {
  it('increases its index as the signal strengthens', () => {
    const indices = [0, 0.3, 0.5, 0.7, 0.9].map((s) => signalLevel(s).index);
    expect(indices).toEqual([0, 1, 2, 3, 4]);
    expect(signalLevel(1).label).toBe('Right next to you');
    expect(signalLevel(0).label).toBe('Far away');
  });
});

describe('signalTrend', () => {
  it('stays steady until the history spans long enough', () => {
    expect(signalTrend([])).toBe('steady');
    expect(signalTrend([{ t: 0, rssi: -90 }, { t: 1000, rssi: -60 }])).toBe('steady');
  });

  it('calls closer and farther past the dB threshold', () => {
    expect(signalTrend([{ t: 0, rssi: -80 }, { t: 2000, rssi: -70 }])).toBe('closer');
    expect(signalTrend([{ t: 0, rssi: -70 }, { t: 2000, rssi: -80 }])).toBe('farther');
    expect(signalTrend([{ t: 0, rssi: -70 }, { t: 2000, rssi: -71 }])).toBe('steady');
  });

  it('forgets samples outside the window and ignores repeated timestamps', () => {
    let history = pushSignalSample([], { t: 0, rssi: -90 });
    history = pushSignalSample(history, { t: 0, rssi: -90 });
    expect(history).toHaveLength(1);
    history = pushSignalSample(history, { t: TREND_WINDOW_MS + 1, rssi: -60 });
    expect(history).toEqual([{ t: TREND_WINDOW_MS + 1, rssi: -60 }]);
  });
});
