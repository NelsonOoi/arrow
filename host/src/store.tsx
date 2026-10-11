/**
 * App state for the host web app.
 *
 * MOCK: everything lives in React state seeded from `src/mock/data.ts`, so
 * nothing persists across reloads. When the backend exists, swap each action
 * for the API call named in its comment and keep the same signatures so the
 * screens don't change.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { draftCallPlan, seedEvents, seedGuests } from './mock/data';
import type { ArrowEvent, CallPlan, ChatMessage, Guest, SetupStep } from './types';

type Store = {
  events: ArrowEvent[];
  getEvent: (id: string) => ArrowEvent | undefined;
  getGuests: (eventId: string) => Guest[];
  getCallPlan: (eventId: string) => CallPlan;
  getChat: (eventId: string) => ChatMessage[];

  /** POST /events/import { partifulUrl } -> new event in setup. Returns the new event id. */
  importEvent: (partifulUrl: string) => string;
  /** PATCH /events/:id */
  updateEvent: (id: string, patch: Partial<ArrowEvent>) => void;
  /** Moves an event's setup to a step (or to live after the last step). */
  goToStep: (id: string, step: SetupStep | 'live') => void;
  /** PUT /events/:id/call-plan */
  setCallPlan: (eventId: string, plan: CallPlan) => void;
  /** Appends to the call-plan chat transcript (kept client-side). */
  pushChat: (eventId: string, ...messages: ChatMessage[]) => void;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [events, setEvents] = useState<ArrowEvent[]>(seedEvents);
  const [guests, setGuests] = useState<Record<string, Guest[]>>(() =>
    Object.fromEntries(seedEvents.map((e) => [e.id, seedGuests(e.id)])),
  );
  const [plans, setPlans] = useState<Record<string, CallPlan>>(() =>
    Object.fromEntries(seedEvents.map((e) => [e.id, draftCallPlan(e)])),
  );
  const [chats, setChats] = useState<Record<string, ChatMessage[]>>({});

  const store = useMemo<Store>(() => {
    const getEvent = (id: string) => events.find((e) => e.id === id);
    return {
      events,
      getEvent,
      getGuests: (eventId) => guests[eventId] ?? [],
      getCallPlan: (eventId) => {
        const existing = plans[eventId];
        if (existing) return existing;
        const event = getEvent(eventId);
        return draftCallPlan(event ?? seedEvents[1]);
      },
      getChat: (eventId) =>
        chats[eventId] ?? [
          {
            id: 'intro',
            from: 'arrow',
            text: 'I read your event description and drafted a call plan: a goal and 4 questions, tuned for a networking crowd. Tell me what to change, or edit the plan directly.',
          },
        ],

      importEvent: (partifulUrl) => {
        // MOCK: pretend Partiful returned the same event as the seeded setup one.
        const id = `evt-${Date.now()}`;
        const template = seedEvents[1];
        const event: ArrowEvent = { ...template, id, partifulUrl, phase: { kind: 'setup', step: 'import' } };
        setEvents((prev) => [event, ...prev]);
        setGuests((prev) => ({ ...prev, [id]: seedGuests(template.id) }));
        setPlans((prev) => ({ ...prev, [id]: draftCallPlan(event) }));
        return id;
      },
      updateEvent: (id, patch) => setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e))),
      goToStep: (id, step) =>
        setEvents((prev) =>
          prev.map((e) =>
            e.id === id ? { ...e, phase: step === 'live' ? { kind: 'live' } : { kind: 'setup', step } } : e,
          ),
        ),
      setCallPlan: (eventId, plan) => setPlans((prev) => ({ ...prev, [eventId]: plan })),
      pushChat: (eventId, ...messages) =>
        setChats((prev) => ({ ...prev, [eventId]: [...(prev[eventId] ?? store.getChat(eventId)), ...messages] })),
    };
  }, [events, guests, plans, chats]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}
