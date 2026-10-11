import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  DEFAULT_RSSI_THRESHOLD,
  MAX_RSSI_THRESHOLD,
  MIN_RSSI_THRESHOLD,
} from '@/ble/constants';

type SessionState = {
  currentUserId: string | null;
  scanning: boolean;
  /** Scan every Bluetooth device instead of only Arrow phones. Not persisted. */
  scanAllDevices: boolean;
  threshold: number;
  metUserIds: string[];
  hasHydrated: boolean;
  setCurrentUser: (id: string | null) => void;
  setScanning: (scanning: boolean) => void;
  setScanAllDevices: (scanAllDevices: boolean) => void;
  setThreshold: (threshold: number) => void;
  markMet: (userId: string) => void;
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      currentUserId: null,
      scanning: false,
      scanAllDevices: false,
      threshold: DEFAULT_RSSI_THRESHOLD,
      metUserIds: [],
      hasHydrated: false,
      setCurrentUser: (id) => set({ currentUserId: id, scanning: false, metUserIds: [] }),
      setScanning: (scanning) => set({ scanning }),
      setScanAllDevices: (scanAllDevices) => set({ scanAllDevices }),
      setThreshold: (threshold) =>
        set({
          threshold: Math.min(MAX_RSSI_THRESHOLD, Math.max(MIN_RSSI_THRESHOLD, threshold)),
        }),
      markMet: (userId) =>
        set((s) =>
          s.metUserIds.includes(userId) ? s : { metUserIds: [...s.metUserIds, userId] },
        ),
    }),
    {
      name: 'arrow-session',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        currentUserId: s.currentUserId,
        threshold: s.threshold,
        metUserIds: s.metUserIds,
      }),
      onRehydrateStorage: () => () => {
        useSession.setState({ hasHydrated: true });
      },
    },
  ),
);
