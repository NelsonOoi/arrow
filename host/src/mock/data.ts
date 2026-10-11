/**
 * MOCK: seeded data standing in for the backend.
 *
 * Replace each export with an API call when the backend exists:
 *   - `seedEvents`        -> GET /events
 *   - `seedGuests(id)`    -> GET /events/:id/guests (live states come over a realtime channel)
 *   - `draftCallPlan(ev)` -> POST /events/:id/call-plan/draft (LLM drafts from the description)
 *   - `seedPairs`, `seedActivity` -> realtime feed for the live dashboard
 *
 * Numbers are chosen so every screen agrees with every other one.
 */
import type {
  ActivityItem,
  ArrowEvent,
  CallPlan,
  CallStatus,
  Guest,
  GuestLiveState,
  Pair,
  Voice,
} from '../types';

/** A Partiful link that always imports successfully in the mock. Shown as "Use a sample link". */
export const SAMPLE_PARTIFUL_URL = 'https://partiful.com/e/bN7xq2LmT4sample';

/**
 * MOCK: what Arrow gets back from Partiful for a pasted link.
 * Real version: POST /events/import { partifulUrl } -> scrape/SDK -> this shape.
 * Fictional event; every field is what the import screen shows.
 */
export async function mockPartifulImport(
  partifulUrl: string,
): Promise<Omit<ArrowEvent, 'id' | 'phase'>> {
  await new Promise((r) => setTimeout(r, 400));
  return {
    partifulUrl,
    name: 'Build Night: Founders & Friends',
    description:
      'A relaxed evening for people building early-stage startups — founders, first engineers, designers, and a handful of seed investors. No pitches, no panels. Come meet the people you should know, swap notes on what you’re building, and leave with a few new friends. Drinks and snacks provided.',
    kind: 'networking',
    startsAt: '2026-10-24T19:00:00',
    endsAt: '2026-10-24T22:00:00',
    venue: 'Hayes Valley loft, San Francisco',
    hostName: 'Jordan Lee',
    matching: { topN: 5, graceMinutes: 15 },
  };
}

export const seedEvents: ArrowEvent[] = [
  {
    id: 'evt-live',
    partifulUrl: 'https://partiful.com/e/[LIVE-EVENT-ID]',
    name: '[Event name]',
    description:
      '[Event description pulled from Partiful — who it is for, what the host hopes people get out of it, the vibe.]',
    kind: 'networking',
    startsAt: '2026-10-11T19:00:00',
    endsAt: '2026-10-11T22:00:00',
    venue: '[Venue]',
    hostName: '[Host name]',
    phase: { kind: 'live' },
    matching: { topN: 5, graceMinutes: 15 },
  },
  {
    id: 'evt-setup',
    partifulUrl: 'https://partiful.com/e/[EVENT-ID]',
    name: '[Event name]',
    description:
      '[Event description pulled from Partiful — e.g. a founders’ mixer for people building early-stage companies, hoping to connect builders with each other and with a few investors.]',
    kind: 'networking',
    startsAt: '2026-10-18T19:00:00',
    endsAt: '2026-10-18T22:00:00',
    venue: '[Venue]',
    hostName: '[Host name]',
    phase: { kind: 'setup', step: 'questions' },
    matching: { topN: 5, graceMinutes: 15 },
  },
  {
    id: 'evt-past',
    partifulUrl: 'https://partiful.com/e/[PAST-EVENT-ID]',
    name: '[Event name]',
    description: '[Event description]',
    kind: 'social',
    startsAt: '2026-09-27T20:00:00',
    endsAt: '2026-09-27T23:30:00',
    venue: '[Venue]',
    hostName: '[Host name]',
    phase: { kind: 'ended' },
    matching: { topN: 5, graceMinutes: 15 },
  },
];

const FIRST = [
  'Ava', 'Ben', 'Cleo', 'Dev', 'Elena', 'Finn', 'Gia', 'Hugo', 'Ines', 'Jonah', 'Kira', 'Leo',
  'Maya', 'Nico', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tara', 'Uma', 'Victor', 'Wren', 'Xavi',
  'Yara', 'Zane', 'Amir', 'Bea', 'Cal', 'Dana', 'Eli', 'Fern', 'Gus', 'Hana', 'Ivo', 'Jade',
  'Kai', 'Lina', 'Milo', 'Nora', 'Otto', 'Pia', 'Rafi', 'Sol', 'Theo', 'Vera', 'Will', 'Zoe',
];
const LAST = 'ABCDEFGHJKLMNPRSTVWYZ';

const GOALS = [
  'Find a technical co-founder',
  'Meet seed investors',
  'Hire a first designer',
  'Swap notes with other founders',
  'Learn about climate startups',
  'Meet people building with AI',
];

/** Fictional guest list. Index ranges set the state mix so the counts line up across screens. */
function makeGuests(callStatusFor: (i: number) => CallStatus, liveFor: (i: number) => GuestLiveState): Guest[] {
  return FIRST.map((first, i) => {
    const callStatus = callStatusFor(i);
    const reached = callStatus === 'done';
    return {
      id: `g${i + 1}`,
      name: `${first} ${LAST[i % LAST.length]}.`,
      phoneLast4: callStatus === 'no-phone' ? null : String(1000 + ((i * 7919) % 9000)).slice(-4),
      rsvp: i % 9 === 4 ? 'maybe' : 'going',
      intake: reached || callStatus === 'not-called' || callStatus === 'in-progress' || callStatus === 'no-answer-retrying' ? 'call' : 'event-info',
      callStatus,
      goal: reached ? GOALS[i % GOALS.length] : callStatus === 'unreachable' || callStatus === 'no-phone' ? 'From event info only' : null,
      liveState: liveFor(i),
      metCount: 0,
    };
  });
}

/**
 * Live event: 48 guests. 38 profiles from calls, 6 unreachable, 4 without a phone.
 * Checked in: 26 = 6 guided + 12 in a match + 3 looking + 5 roaming. 22 not here yet.
 */
const liveGuests = makeGuests(
  (i) => (i >= 44 ? 'no-phone' : i >= 38 ? 'unreachable' : 'done'),
  (i) => {
    if (i < 6) return 'guided';
    if (i < 18) return 'in-match';
    if (i < 21) return 'looking';
    if (i < 26) return 'roaming';
    return 'not-checked-in';
  },
).map((g, i) => ({ ...g, metCount: i < 26 ? 1 + (i % 3) : 0 }));

/**
 * Event in setup: 48 guests, 44 with phones. Calls: 26 done, 3 retrying, 15 not yet, 4 no phone.
 */
const setupGuests = makeGuests(
  (i) => (i >= 44 ? 'no-phone' : i < 26 ? 'done' : i < 29 ? 'no-answer-retrying' : 'not-called'),
  () => 'not-checked-in',
);

export function seedGuests(eventId: string): Guest[] {
  if (eventId === 'evt-live') return liveGuests;
  if (eventId === 'evt-setup') return setupGuests;
  return [];
}

/** Pairs on the live dashboard. Guest ids line up with `liveGuests` states. */
export const seedPairs: Pair[] = [
  { id: 'p1', guestIds: ['g1', 'g2'], color: 'amber', keyword: 'LANTERN', status: 'guided', distanceM: 8 },
  { id: 'p2', guestIds: ['g3', 'g4'], color: 'violet', keyword: 'VELVET', status: 'still-looking-check', secondsLeft: 18 },
  { id: 'p3', guestIds: ['g5', 'g6'], color: 'rose', keyword: 'COMET', status: 'guided', distanceM: 3 },
  { id: 'p4', guestIds: ['g7', 'g8'], color: 'teal', keyword: 'ORBIT', status: 'talking', minutes: 6 },
  { id: 'p5', guestIds: ['g9', 'g10'], color: 'blue', keyword: 'HARBOR', status: 'talking', minutes: 2 },
  { id: 'p6', guestIds: ['g11', 'g12'], color: 'moss', keyword: 'FERN', status: 'talking', minutes: 11 },
  { id: 'p7', guestIds: ['g13', 'g14'], color: 'teal', keyword: 'MAPLE', status: 'talking', minutes: 4 },
  { id: 'p8', guestIds: ['g15', 'g16'], color: 'amber', keyword: 'TIDE', status: 'talking', minutes: 9 },
  { id: 'p9', guestIds: ['g17', 'g18'], color: 'violet', keyword: 'QUILL', status: 'talking', minutes: 1 },
];

export const seedActivity: ActivityItem[] = [
  { at: '7:22', text: 'Uma Z. checked in and asked for a match' },
  { at: '7:21', text: 'Two guests swapped contacts' },
  { at: '7:20', text: 'VELVET pair hadn’t met after 1.5 min — asked “still looking?”' },
  { at: '7:19', text: 'COMET pair matched and guided' },
  { at: '7:15', text: 'Top-5 wait ended. Pairing with the best person who’s here.' },
];

/** Contacts swapped so far tonight on the live event. */
export const seedContactsSwapped = 9;

/** MOCK: placeholder voices until the calling provider is chosen. */
export const voices: Voice[] = [
  { id: 'voice-1', label: '[Voice 1]', description: 'Female · bright', sampleUrl: '' },
  { id: 'voice-2', label: '[Voice 2]', description: 'Male · warm', sampleUrl: '' },
  { id: 'voice-3', label: '[Voice 3]', description: 'Neutral · calm', sampleUrl: '' },
];

/**
 * MOCK: the first draft of a call plan. The real version is an LLM call that
 * reads `event.description` and `event.kind`.
 */
export function draftCallPlan(event: ArrowEvent): CallPlan {
  return {
    goal:
      'Build a short profile for each guest: what they do, what they’re working on, what would make tonight a win, and who they’d most want to meet.',
    questions: [
      { id: 'q1', text: 'What do you do, and where?', gets: ['role', 'company'], isKey: false },
      { id: 'q2', text: 'What are you working on or excited about right now?', gets: ['current focus', 'interests'], isKey: false },
      {
        id: 'q3',
        text: 'What would make tonight a win for you? Hiring, a co-founder, investors, or just meeting good people?',
        gets: ['goal'],
        isKey: true,
      },
      { id: 'q4', text: 'Describe the one person you’d most want to meet tonight.', gets: ['ideal match'], isKey: false },
    ],
    removed: [],
    opening: {
      line: `Hi, this is Arrow, calling for ${event.hostName}’s event on [Date]. I’ll ask a few quick questions so we can introduce you to the right people there. Is now a good time?`,
      tone: 'warm',
      voiceId: 'voice-1',
    },
    retry: { attempts: 1, waitMinutes: 120 },
    signedOff: false,
  };
}
