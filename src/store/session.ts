import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  DEFAULT_RSSI_THRESHOLD,
  MAX_RSSI_THRESHOLD,
  MIN_RSSI_THRESHOLD,
} from '@/ble/constants';
import type { MatchOutcome } from '@/types';

type SessionState = {
  currentUserId: string | null;
  scanning: boolean;
  /** Scan every Bluetooth device instead of only Arrow phones. Not persisted. */
  scanAllDevices: boolean;
  threshold: number;
  /** Keyed by the match's user id. Missing means still looking for them. */
  outcomes: Record<string, MatchOutcome>;
  hasHydrated: boolean;
  setCurrentUser: (id: string | null) => void;
  setScanning: (scanning: boolean) => void;
  setScanAllDevices: (scanAllDevices: boolean) => void;
  setThreshold: (threshold: number) => void;
  markFound: (userId: string) => void;
  decide: (userId: string, interested: boolean) => void;
  /** Demo helper: forget every found/decided match so the flow can be replayed. */
  resetOutcomes: () => void;
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      currentUserId: null,
      scanning: false,
      scanAllDevices: false,
      threshold: DEFAULT_RSSI_THRESHOLD,
      outcomes: {},
      hasHydrated: false,
      setCurrentUser: (id) => set({ currentUserId: id, scanning: false, outcomes: {} }),
      setScanning: (scanning) => set({ scanning }),
      setScanAllDevices: (scanAllDevices) => set({ scanAllDevices }),
      setThreshold: (threshold) =>
        set({
          threshold: Math.min(MAX_RSSI_THRESHOLD, Math.max(MIN_RSSI_THRESHOLD, threshold)),
        }),
      // Never downgrades a decision back to "found".
      markFound: (userId) =>
        set((s) => (s.outcomes[userId] ? s : { outcomes: { ...s.outcomes, [userId]: 'found' } })),
      decide: (userId, interested) =>
        set((s) => ({
          outcomes: { ...s.outcomes, [userId]: interested ? 'interested' : 'notInterested' },
        })),
      resetOutcomes: () => set({ outcomes: {} }),
    }),
    {
      name: 'arrow-session',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        currentUserId: s.currentUserId,
        threshold: s.threshold,
        outcomes: s.outcomes,
      }),
      onRehydrateStorage: () => () => {
        useSession.setState({ hasHydrated: true });
      },
    },
  ),
);
