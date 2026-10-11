import { useEffect } from 'react';

import { vibrateProximityAlert } from '@/haptics/alert';
import { useLive } from '@/store/live';
import { useSession } from '@/store/session';

import { pollCurrent } from './actions';

/** Matches the backend's expected client cadence (scripts/live_run.py polls every 3 s). */
export const POLL_MS = 3_000;

/**
 * Mount once (in the tabs layout). Polls the matchmaker for the current user's status and conversation,
 * and buzzes when a new conversation partner is assigned.
 */
export function useLiveMatch(): void {
  const currentUserId = useSession((s) => s.currentUserId);

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      await pollCurrent(currentUserId);
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    };

    // Skip the first conversation we see: it was assigned before the app opened, not just now.
    let seen = false;
    const unsubscribe = useLive.subscribe((state, prev) => {
      if (state.status === null) return;
      const id = state.conversation?.id;
      if (seen && id && id !== prev.conversation?.id) vibrateProximityAlert().catch(() => {});
      seen = true;
    });

    tick();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
      useLive.getState().reset();
    };
  }, [currentUserId]);
}
