import type { ApiCurrent } from '@/api/client';
import { useLive } from '@/store/live';

const inConversation = (id: string): ApiCurrent => ({
  attendee_id: 'me',
  status: 'in_conversation',
  conversation: {
    id,
    partner_id: 'p1',
    partner_name: 'Partner',
    partner_about: 'about',
    started_at: '2026-10-11T18:00:00Z',
    your_rank_of_partner: 2,
  },
  waiting_seconds: null,
});

describe('useLive', () => {
  beforeEach(() => useLive.getState().reset());

  it('maps a conversation and keeps its identity across polls', () => {
    useLive.getState().apply(inConversation('c1'));
    const first = useLive.getState().conversation;
    expect(first).toEqual({ id: 'c1', partnerId: 'p1', startedAt: Date.parse('2026-10-11T18:00:00Z'), rank: 2 });
    useLive.getState().apply(inConversation('c1'));
    expect(useLive.getState().conversation).toBe(first);
    useLive.getState().apply(inConversation('c2'));
    expect(useLive.getState().conversation?.id).toBe('c2');
  });

  it('clears the conversation and the error when back in the pool', () => {
    useLive.getState().setError('boom');
    useLive.getState().apply(inConversation('c1'));
    useLive.getState().apply({ attendee_id: 'me', status: 'available', conversation: null, waiting_seconds: 4, exhausted: true });
    expect(useLive.getState()).toMatchObject({ status: 'available', conversation: null, waitingSeconds: 4, exhausted: true, error: null });
  });
});
