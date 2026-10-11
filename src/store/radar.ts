import { create } from 'zustand';

import type { PeerState, ProximityAlert, RadarStatus } from '@/types';

const MAX_ALERT_LOG = 50;

type RadarState = {
  status: RadarStatus;
  error: string | null;
  /** Every Arrow peer currently in range, keyed by token. Includes non-matches for the debug screen. */
  peers: Record<string, PeerState>;
  alertLog: ProximityAlert[];
  /** Tokens whose match card is waiting to be shown, oldest first. */
  alertQueue: string[];
  setStatus: (status: RadarStatus, error?: string | null) => void;
  setPeers: (peers: Record<string, PeerState>) => void;
  pushAlerts: (alerts: ProximityAlert[]) => void;
  shiftAlertQueue: () => void;
  reset: () => void;
};

export const useRadar = create<RadarState>()((set) => ({
  status: 'idle',
  error: null,
  peers: {},
  alertLog: [],
  alertQueue: [],
  setStatus: (status, error = null) => set({ status, error }),
  setPeers: (peers) => set({ peers }),
  pushAlerts: (alerts) =>
    set((s) =>
      alerts.length === 0
        ? s
        : {
            alertLog: [...alerts, ...s.alertLog].slice(0, MAX_ALERT_LOG),
            alertQueue: [
              ...s.alertQueue,
              ...alerts.map((a) => a.token).filter((t) => !s.alertQueue.includes(t)),
            ],
          },
    ),
  shiftAlertQueue: () => set((s) => ({ alertQueue: s.alertQueue.slice(1) })),
  reset: () => set({ status: 'idle', error: null, peers: {}, alertQueue: [] }),
}));
