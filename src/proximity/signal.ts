/** RSSI at or below this reads as an empty meter. */
export const SIGNAL_FLOOR_DBM = -95;
/** RSSI at or above this reads as a full meter; phones held side by side land around here. */
export const SIGNAL_CEILING_DBM = -45;
/** A signal older than this is shown as lost even before the engine evicts the peer. */
export const SIGNAL_LOST_MS = 3_000;
/** How far back `signalTrend` looks, and the minimum span it needs before calling a direction. */
export const TREND_WINDOW_MS = 4_000;
export const TREND_MIN_SPAN_MS = 1_500;
export const TREND_DB = 3;

export function signalStrength(rssi: number): number {
  const fraction = (rssi - SIGNAL_FLOOR_DBM) / (SIGNAL_CEILING_DBM - SIGNAL_FLOOR_DBM);
  return Math.min(1, Math.max(0, fraction));
}

const LEVELS = [
  { min: 0.85, label: 'Right next to you' },
  { min: 0.65, label: 'Very close' },
  { min: 0.45, label: 'Close' },
  { min: 0.2, label: 'Nearby' },
  { min: 0, label: 'Far away' },
] as const;

/** 0 is weakest. Increases as the signal gets stronger. */
export function signalLevel(strength: number): { index: number; label: string } {
  const i = LEVELS.findIndex((l) => strength >= l.min);
  const found = i === -1 ? LEVELS.length - 1 : i;
  return { index: LEVELS.length - 1 - found, label: LEVELS[found].label };
}

export type SignalSample = { t: number; rssi: number };
export type SignalTrend = 'closer' | 'farther' | 'steady';

/** Drops samples older than TREND_WINDOW_MS relative to the newest one. */
export function pushSignalSample(history: SignalSample[], sample: SignalSample): SignalSample[] {
  const last = history[history.length - 1];
  if (last && last.t === sample.t) return history;
  return [...history, sample].filter((s) => sample.t - s.t <= TREND_WINDOW_MS);
}

export function signalTrend(history: SignalSample[]): SignalTrend {
  if (history.length < 2) return 'steady';
  const first = history[0];
  const last = history[history.length - 1];
  if (last.t - first.t < TREND_MIN_SPAN_MS) return 'steady';
  const delta = last.rssi - first.rssi;
  if (delta >= TREND_DB) return 'closer';
  if (delta <= -TREND_DB) return 'farther';
  return 'steady';
}
