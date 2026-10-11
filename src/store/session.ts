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
  threshold: number;
  wavedUserIds: string[];
  hasHydrated: boolean;
  setCurrentUser: (id: string | null) => void;
  setScanning: (scanning: boolean) => void;
  setThreshold: (threshold: number) => void;
  wave: (userId: string) => void;
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      currentUserId: null,
      scanning: false,
      threshold: DEFAULT_RSSI_THRESHOLD,
      wavedUserIds: [],
      hasHydrated: false,
      setCurrentUser: (id) => set({ currentUserId: id, scanning: false, wavedUserIds: [] }),
      setScanning: (scanning) => set({ scanning }),
      setThreshold: (threshold) =>
        set({
          threshold: Math.min(MAX_RSSI_THRESHOLD, Math.max(MIN_RSSI_THRESHOLD, threshold)),
        }),
      wave: (userId) =>
        set((s) =>
          s.wavedUserIds.includes(userId) ? s : { wavedUserIds: [...s.wavedUserIds, userId] },
        ),
    }),
    {
      name: 'arrow-session',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        currentUserId: s.currentUserId,
        threshold: s.threshold,
        wavedUserIds: s.wavedUserIds,
      }),
      onRehydrateStorage: () => () => {
        useSession.setState({ hasHydrated: true });
      },
    },
  ),
);
