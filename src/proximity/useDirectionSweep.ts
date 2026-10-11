import { useEffect, useRef, useState, type RefObject } from 'react';
import { AccessibilityInfo } from 'react-native';

import { notifyDirectionFound } from '@/haptics/alert';

import {
  addSweepSample,
  coveredBins,
  createSweep,
  estimateBearing,
  FULL_TURN_COVERAGE,
  sweepCoverage,
  type Sweep,
} from './sweep';

/** Give up and estimate from whatever was covered after this long. */
const SWEEP_TIMEOUT_MS = 25_000;

export type SweepPhase = 'idle' | 'sweeping' | 'found' | 'unsure';

export type DirectionSweep = {
  phase: SweepPhase;
  /** Per-bin coverage while sweeping, for the progress ring. */
  covered: boolean[];
  /** Degrees clockwise in the compass frame, set once `phase` is 'found'. */
  bearing: number | null;
  start: () => void;
  cancel: () => void;
};

/**
 * Pairs each fresh RSSI sample with the current heading while the user turns in a circle, then
 * fits a bearing. `sample.lastSeen` must change for each new advertisement.
 */
export function useDirectionSweep(
  sample: { rssi: number; lastSeen: number } | undefined,
  headingRef: RefObject<number>,
): DirectionSweep {
  const [phase, setPhase] = useState<SweepPhase>('idle');
  const [covered, setCovered] = useState<boolean[]>(() => coveredBins(createSweep()));
  const [bearing, setBearing] = useState<number | null>(null);
  const sweepRef = useRef<Sweep>(createSweep());
  const startedAtRef = useRef(0);

  const finish = (sweep: Sweep) => {
    const estimate = estimateBearing(sweep);
    if (estimate?.confident) {
      setBearing(estimate.bearing);
      setPhase('found');
      notifyDirectionFound();
      AccessibilityInfo.announceForAccessibility('Direction found. Head where the arrow points.');
    } else {
      setPhase('unsure');
    }
  };

  const rssi = sample?.rssi;
  const lastSeen = sample?.lastSeen;

  useEffect(() => {
    if (phase !== 'sweeping' || rssi === undefined || lastSeen === undefined) return;
    if (lastSeen < startedAtRef.current) return;
    const sweep = addSweepSample(sweepRef.current, headingRef.current, rssi);
    sweepRef.current = sweep;
    setCovered(coveredBins(sweep));
    if (sweepCoverage(sweep) >= FULL_TURN_COVERAGE) finish(sweep);
  }, [phase, rssi, lastSeen, headingRef]);

  useEffect(() => {
    if (phase !== 'sweeping') return;
    const id = setTimeout(() => finish(sweepRef.current), SWEEP_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [phase]);

  // A previous bearing survives a rescan until the new sweep replaces it, so Cancel can restore it.
  const start = () => {
    sweepRef.current = createSweep();
    startedAtRef.current = Date.now();
    setCovered(coveredBins(sweepRef.current));
    setPhase('sweeping');
  };

  const cancel = () => {
    setPhase(bearing === null ? 'idle' : 'found');
  };

  return { phase, covered, bearing, start, cancel };
}
