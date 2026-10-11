/**
 * MOCK: the events this guest has joined. Replace with GET /me/events once the guest app joins
 * events through the host's text link. Venues and hosts are fictional.
 */
export type EventInfo = {
  id: string;
  name: string;
  /** ISO datetimes, local to the venue. */
  startsAt: string;
  endsAt: string;
  venue: string;
  hostName: string;
  about: string;
  /** Past events only: how many people this guest swapped contacts with there. MOCK. */
  metCount?: number;
};

/** The event happening now. Matching, People and the finder all belong to this one. */
export const EVENT: EventInfo = {
  id: 'mtl-ai-hackathon',
  name: 'Montreal AI Hackathon',
  startsAt: '2026-10-11T18:00:00',
  endsAt: '2026-10-11T22:00:00',
  venue: 'Old Port loft, Montréal',
  hostName: 'Alex Tremblay',
  about: 'Builders, researchers and investors working on AI. Arrow points you to the people you should meet.',
};

/** Most recent first. */
export const PAST_EVENTS: EventInfo[] = [
  {
    id: 'climate-builders-sep',
    name: 'Climate Builders Meetup',
    startsAt: '2026-09-17T19:00:00',
    endsAt: '2026-09-17T22:00:00',
    venue: 'Mile End studio, Montréal',
    hostName: 'Priya Shah',
    about: 'Monthly meetup for people working on climate: founders, researchers, operators.',
    metCount: 3,
  },
  {
    id: 'build-night-aug',
    name: 'Build Night: Founders & Friends',
    startsAt: '2026-08-22T19:00:00',
    endsAt: '2026-08-22T22:00:00',
    venue: 'Griffintown loft, Montréal',
    hostName: 'Jordan Lee',
    about: 'A relaxed evening for people building early-stage startups. No pitches, no panels.',
    metCount: 5,
  },
];

export function getEvent(id: string): EventInfo | undefined {
  return [EVENT, ...PAST_EVENTS].find((e) => e.id === id);
}

export function isCurrentEvent(event: EventInfo): boolean {
  return event.id === EVENT.id;
}

/** "Sun, Oct 11 · 6:00 – 10:00 PM" */
export function eventWhen(event: EventInfo): string {
  const start = new Date(event.startsAt);
  const end = new Date(event.endsAt);
  const day = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time(start).replace(/ [AP]M$/, '')} – ${time(end)}`;
}

/** "Sep 17" */
export function eventDay(event: EventInfo): string {
  return new Date(event.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
