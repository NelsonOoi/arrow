import {
  addSweepSample,
  BIN_COUNT,
  binIndex,
  createSweep,
  estimateBearing,
  normalizeDeg,
  shortestDelta,
  sweepCoverage,
  type Sweep,
} from '@/proximity/sweep';

/** Deterministic pseudo-noise in -1..1 so tests don't flake. */
function noise(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

/** RSSI that peaks when facing `target` and drops by `shadowDb` when facing away. */
function turn(target: number, shadowDb: number, noiseDb: number, degrees = 360): Sweep {
  let sweep = createSweep();
  for (let i = 0; i < degrees; i += 3) {
    const facing = (1 + Math.cos(((i - target) * Math.PI) / 180)) / 2;
    const rssi = -75 + shadowDb * facing + noiseDb * noise(i);
    sweep = addSweepSample(sweep, i, rssi);
  }
  return sweep;
}

describe('angles', () => {
  it('normalizes and finds the shortest rotation', () => {
    expect(normalizeDeg(-90)).toBe(270);
    expect(normalizeDeg(725)).toBe(5);
    expect(shortestDelta(350, 10)).toBe(20);
    expect(shortestDelta(10, 350)).toBe(-20);
    expect(binIndex(359.9)).toBe(BIN_COUNT - 1);
    expect(binIndex(-1)).toBe(BIN_COUNT - 1);
  });
});

describe('estimateBearing', () => {
  it.each([0, 95, 200, 350])('finds a peak at %i° within one bin', (target) => {
    const estimate = estimateBearing(turn(target, 15, 2));
    expect(estimate?.confident).toBe(true);
    expect(Math.abs(shortestDelta(target, estimate!.bearing))).toBeLessThanOrEqual(15);
  });

  it('stays within 20° under heavy noise', () => {
    const estimate = estimateBearing(turn(140, 10, 5));
    expect(estimate?.confident).toBe(true);
    expect(Math.abs(shortestDelta(140, estimate!.bearing))).toBeLessThanOrEqual(20);
  });

  it('declines to call a direction when the signal is flat', () => {
    const estimate = estimateBearing(turn(120, 0, 1.5));
    expect(estimate).not.toBeNull();
    expect(estimate!.confident).toBe(false);
  });

  it('needs at least half a turn before estimating', () => {
    const partial = turn(90, 15, 0, 150);
    expect(sweepCoverage(partial)).toBeLessThan(0.5);
    expect(estimateBearing(partial)).toBeNull();
    expect(estimateBearing(createSweep())).toBeNull();
  });
});
