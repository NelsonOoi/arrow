import { create } from 'zustand';

import { api, API_URL, EVENT_ID, pickEvent, type ApiAttendee, type ApiEvent } from '@/api/client';
import type { User } from '@/types';

export function toUser(a: ApiAttendee): User {
  return {
    id: a.id,
    token: a.token.toUpperCase(),
    name: a.display_name,
    side: a.side,
    sideLabel: a.side_label,
    about: a.offering_text,
    seeking: a.seeking_text,
    interests: a.topics,
    goals: a.goals,
  };
}

let inFlight: Promise<void> | null = null;

type RosterState = {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  event: ApiEvent | null;
  users: User[];
  byId: ReadonlyMap<string, User>;
  byToken: ReadonlyMap<string, User>;
  load: () => Promise<void>;
};

export const useRoster = create<RosterState>()((set) => ({
  status: 'loading',
  error: null,
  event: null,
  users: [],
  byId: new Map(),
  byToken: new Map(),
  load: () => {
    inFlight ??= loadOnce(set).finally(() => {
      inFlight = null;
    });
    return inFlight;
  },
}));

async function loadOnce(set: (partial: Partial<RosterState>) => void): Promise<void> {
    set({ status: 'loading', error: null });
    try {
      const event = pickEvent(await api.listEvents());
      if (!event) {
        throw new Error(
          EVENT_ID
            ? `Event ${EVENT_ID} isn't on the matchmaker at ${API_URL}.`
            : `No live event on the matchmaker at ${API_URL}. Run scripts.seed_demo --precompute --live.`,
        );
      }
      const roster = await api.roster(event.id);
      const users = roster.attendees.map(toUser);
      set({
        status: 'ready',
        event: roster.event,
        users,
        byId: new Map(users.map((u) => [u.id, u])),
        byToken: new Map(users.map((u) => [u.token, u])),
      });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
}
