import { create } from 'zustand';

import type { ApiCurrent, AttendeeStatus } from '@/api/client';

export type LiveConversation = {
  id: string;
  partnerId: string;
  startedAt: number;
  /** Where this partner sat on your precomputed list, 1 = top pick. */
  rank: number;
};

type LiveState = {
  /** Null until the first poll for the current user lands. */
  status: AttendeeStatus | null;
  conversation: LiveConversation | null;
  waitingSeconds: number | null;
  exhausted: boolean;
  error: string | null;
  /** A check-in, step-away or end request is in flight. */
  busy: boolean;
  apply: (current: ApiCurrent) => void;
  setError: (error: string | null) => void;
  setBusy: (busy: boolean) => void;
  reset: () => void;
};

const initial = {
  status: null,
  conversation: null,
  waitingSeconds: null,
  exhausted: false,
  error: null,
  busy: false,
};

export const useLive = create<LiveState>()((set) => ({
  ...initial,
  apply: (current) =>
    set((s) => {
      const c = current.conversation;
      // Keep the same object while the conversation is unchanged so selectors don't re-render every poll.
      const conversation =
        c === null
          ? null
          : s.conversation?.id === c.id
            ? s.conversation
            : {
                id: c.id,
                partnerId: c.partner_id,
                startedAt: Date.parse(c.started_at),
                rank: c.your_rank_of_partner,
              };
      return {
        status: current.status,
        conversation,
        waitingSeconds: current.waiting_seconds,
        exhausted: current.exhausted ?? false,
        error: null,
      };
    }),
  setError: (error) => set({ error }),
  setBusy: (busy) => set({ busy }),
  reset: () => set(initial),
}));
