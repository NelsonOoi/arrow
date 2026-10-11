/**
 * Direction finding by body shadowing. Held flat in front of you, the phone hears the other device
 * best when you face it, because your body blocks 2.4 GHz signal arriving from behind. Turning in
 * a full circle and binning RSSI by compass heading gives a rough bearing to the strongest side.
 */

export const BIN_COUNT = 24;
export const BIN_DEG = 360 / BIN_COUNT;
/** Bins that need at least one sample before we offer an estimate at all. */
export const MIN_BINS_FOR_ESTIMATE = 12;
/** Fraction of bins that, once sampled, counts as a full turn. */
export const FULL_TURN_COVERAGE = 0.85;
/** Fitted peak-to-trough difference below this means the room is too reflective to call. */
export const MIN_CONTRAST_DB = 4;

type Bin = { sum: number; count: number };
export type Sweep = { bins: Bin[] };

export type SweepEstimate = {
  /** Degrees clockwise, in the same frame as the headings passed to `addSweepSample`. */
  bearing: number;
  /** Fitted difference between facing toward and away from the signal. */
  contrastDb: number;
  confident: boolean;
};

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Signed shortest rotation from `from` to `to`, in -180..180. */
export function shortestDelta(from: number, to: number): number {
  const d = normalizeDeg(to - from);
  return d > 180 ? d - 360 : d;
}

export function createSweep(): Sweep {
  return { bins: Array.from({ length: BIN_COUNT }, () => ({ sum: 0, count: 0 })) };
}

export function binIndex(heading: number): number {
  return Math.floor(normalizeDeg(heading) / BIN_DEG) % BIN_COUNT;
}

export function addSweepSample(sweep: Sweep, heading: number, rssi: number): Sweep {
  const i = binIndex(heading);
  const bins = sweep.bins.slice();
  bins[i] = { sum: bins[i].sum + rssi, count: bins[i].count + 1 };
  return { bins };
}

export function coveredBins(sweep: Sweep): boolean[] {
  return sweep.bins.map((b) => b.count > 0);
}

export function sweepCoverage(sweep: Sweep): number {
  return sweep.bins.filter((b) => b.count > 0).length / BIN_COUNT;
}

/**
 * Fits `rssi ≈ mean + amplitude · cos(heading − bearing)` across the sampled bins. Using every bin
 * is far steadier than picking the loudest one, since the body-shadow peak is broad and noisy.
 */
export function estimateBearing(sweep: Sweep): SweepEstimate | null {
  const points = sweep.bins.flatMap((b, i) =>
    b.count > 0 ? [{ angle: ((i + 0.5) * BIN_DEG * Math.PI) / 180, rssi: b.sum / b.count }] : [],
  );
  if (points.length < MIN_BINS_FOR_ESTIMATE) return null;

  const mean = points.reduce((sum, p) => sum + p.rssi, 0) / points.length;
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += (p.rssi - mean) * Math.cos(p.angle);
    y += (p.rssi - mean) * Math.sin(p.angle);
  }
  const amplitude = (2 / points.length) * Math.hypot(x, y);
  const contrastDb = 2 * amplitude;

  return {
    bearing: normalizeDeg((Math.atan2(y, x) * 180) / Math.PI),
    contrastDb,
    confident: contrastDb >= MIN_CONTRAST_DB,
  };
}
