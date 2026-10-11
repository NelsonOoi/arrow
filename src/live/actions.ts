import { api } from '@/api/client';
import { useLive } from '@/store/live';

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Polls once and stores the result; errors land in `useLive().error` and never throw. */
export async function pollCurrent(attendeeId: string): Promise<void> {
  try {
    useLive.getState().apply(await api.current(attendeeId));
  } catch (e) {
    useLive.getState().setError(message(e));
  }
}

async function run(attendeeId: string, action: () => Promise<unknown>): Promise<void> {
  const live = useLive.getState();
  if (live.busy) return;
  live.setBusy(true);
  try {
    await action();
  } catch (e) {
    live.setError(message(e));
  } finally {
    // Re-read the server's view so the screen reflects what actually happened.
    await pollCurrent(attendeeId);
    useLive.getState().setBusy(false);
  }
}

/** Join the pool. The matchmaker pairs people on its next refresh. */
export function checkIn(attendeeId: string): Promise<void> {
  return run(attendeeId, () => api.setStatus(attendeeId, 'available'));
}

/** Leave the pool. Ends any active conversation as "left event". */
export function stepAway(attendeeId: string): Promise<void> {
  return run(attendeeId, () => api.setStatus(attendeeId, 'away'));
}

/** End the current conversation; both people go back into the pool. */
export function endConversation(attendeeId: string, conversationId: string): Promise<void> {
  return run(attendeeId, () => api.endConversation(conversationId, attendeeId));
}
