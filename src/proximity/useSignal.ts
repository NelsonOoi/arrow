import { useEffect, useRef, useState } from 'react';

import { tickSignalStronger } from '@/haptics/alert';

import {
  pushSignalSample,
  SIGNAL_LOST_MS,
  signalLevel,
  signalStrength,
  signalTrend,
  type SignalSample,
  type SignalTrend,
} from './signal';

export type SignalInput = { rssi: number; lastSeen: number } | undefined;

export type SignalReading = {
  /** True while advertisements are still arriving. */
  live: boolean;
  /** 0..1, or 0 when not live. */
  strength: number;
  level: { index: number; label: string };
  trend: SignalTrend;
};

const HAPTIC_MIN_GAP_MS = 700;

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Turns a smoothed RSSI stream into what the finder UI shows, with a haptic tick on each step up. */
export function useSignal(input: SignalInput, { haptics = false } = {}): SignalReading {
  const now = useNow(500);
  const [history, setHistory] = useState<SignalSample[]>([]);
  const lastLevelRef = useRef(-1);
  const lastTickAtRef = useRef(0);

  const rssi = input?.rssi;
  const lastSeen = input?.lastSeen;
  const live = input !== undefined && now - input.lastSeen <= SIGNAL_LOST_MS;
  const strength = live && rssi !== undefined ? signalStrength(rssi) : 0;
  const level = signalLevel(strength);

  useEffect(() => {
    if (rssi === undefined || lastSeen === undefined) {
      setHistory([]);
      return;
    }
    setHistory((h) => pushSignalSample(h, { t: lastSeen, rssi }));
  }, [rssi, lastSeen]);

  useEffect(() => {
    const prev = lastLevelRef.current;
    lastLevelRef.current = live ? level.index : -1;
    if (!haptics || !live || prev === -1 || level.index <= prev) return;
    const t = Date.now();
    if (t - lastTickAtRef.current < HAPTIC_MIN_GAP_MS) return;
    lastTickAtRef.current = t;
    tickSignalStronger();
  }, [haptics, live, level.index]);

  return { live, strength, level, trend: live ? signalTrend(history) : 'steady' };
}
