/**
 * App state for the host web app (MVP).
 *
 * MOCK: everything lives in React state seeded from `src/mock/data.ts`, so
 * nothing persists across reloads. When the backend exists, swap each action
 * for the API call named in its comment and keep the same signatures so the
 * screens don't change.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { draftCallPlan, mockPartifulImport, seedEvents, seedGuests } from './mock/data';
import type { ArrowEvent, CallPlan, Guest, SetupStep, TextBlast } from './types';

type Store = {
  events: ArrowEvent[];
  getEvent: (id: string) => ArrowEvent | undefined;
  getGuests: (eventId: string) => Guest[];
  getCallPlan: (eventId: string) => CallPlan;
  getBlasts: (eventId: string) => TextBlast[];

  /** POST /events/import { partifulUrl } -> new event in setup. Resolves to the new event id. */
  importEvent: (partifulUrl: string) => Promise<string>;
  /** Moves an event to a setup step. */
  goToStep: (id: string, step: SetupStep) => void;
  /** PUT /events/:id/call-plan */
  setCallPlan: (eventId: string, plan: CallPlan) => void;
  /** POST /events/:id/finish-setup — locks the call plan and starts calling guests. */
  finishSetup: (eventId: string) => void;
  /**
   * POST /events/:id/text-blast { message } — texts every guest with a phone who
   * hasn't joined the app yet. `{first}` and `{link}` are filled per guest server-side.
   */
  sendTextBlast: (eventId: string, message: string) => number;
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
  const [blasts, setBlasts] = useState<Record<string, TextBlast[]>>({
    'evt-live': [{ sentAt: '2026-10-10T12:00:00', recipients: 44, message: '' }],
  });

  const store = useMemo<Store>(() => {
    const getEvent = (id: string) => events.find((e) => e.id === id);
    const setPhase = (id: string, phase: ArrowEvent['phase']) =>
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, phase } : e)));
    return {
      events,
      getEvent,
      getGuests: (eventId) => guests[eventId] ?? [],
      getCallPlan: (eventId) => plans[eventId] ?? draftCallPlan(getEvent(eventId) ?? seedEvents[2]),
      getBlasts: (eventId) => blasts[eventId] ?? [],

      importEvent: async (partifulUrl) => {
        // MOCK: any link returns the same sample event with a fresh guest list.
        const imported = await mockPartifulImport(partifulUrl);
        const id = `evt-${Date.now()}`;
        const event: ArrowEvent = { ...imported, id, phase: { kind: 'setup', step: 'import' } };
        setEvents((prev) => [event, ...prev]);
        setGuests((prev) => ({ ...prev, [id]: seedGuests('evt-setup') }));
        setPlans((prev) => ({ ...prev, [id]: draftCallPlan(event) }));
        return id;
      },
      goToStep: (id, step) => setPhase(id, { kind: 'setup', step }),
      setCallPlan: (eventId, plan) => setPlans((prev) => ({ ...prev, [eventId]: plan })),
      finishSetup: (eventId) => {
        setPhase(eventId, { kind: 'ready' });
        // MOCK: the first few calls start immediately.
        setGuests((prev) => ({
          ...prev,
          [eventId]: (prev[eventId] ?? []).map((g, i) =>
            g.callStatus === 'not-called' && i < 3 ? { ...g, callStatus: 'in-progress' } : g,
          ),
        }));
      },
      sendTextBlast: (eventId, message) => {
        const targets = (guests[eventId] ?? []).filter((g) => g.phoneLast4 && g.textStatus !== 'joined');
        setGuests((prev) => ({
          ...prev,
          [eventId]: (prev[eventId] ?? []).map((g) =>
            g.phoneLast4 && g.textStatus !== 'joined' ? { ...g, textStatus: 'sent' } : g,
          ),
        }));
        setBlasts((prev) => ({
          ...prev,
          [eventId]: [...(prev[eventId] ?? []), { sentAt: new Date().toISOString(), recipients: targets.length, message }],
        }));
        return targets.length;
      },
    };
  }, [events, guests, plans, blasts]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}
