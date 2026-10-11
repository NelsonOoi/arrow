/**
 * MOCK: seeded data standing in for the backend.
 *
 * Replace each export with an API call when the backend exists:
 *   - `seedEvents`            -> GET /events
 *   - `seedGuests(id)`        -> GET /events/:id/guests (call/text/check-in status via realtime)
 *   - `mockPartifulImport`    -> POST /events/import { partifulUrl }
 *   - `draftCallPlan(ev)`     -> POST /events/:id/call-plan/draft (LLM drafts from the description)
 *   - `duringEventMetrics(id)`-> GET /events/:id/metrics (hardcoded for the demo)
 *
 * All events and people are fictional. Numbers are chosen so screens agree.
 */
import {
  DEFAULT_MATCHING,
  type ArrowEvent,
  type CallPlan,
  type CallStatus,
  type DashboardMetrics,
  type Guest,
  type TextStatus,
  type Voice,
} from '../types';

/** A Partiful link that always imports successfully in the mock. Shown as "Use a sample link". */
export const SAMPLE_PARTIFUL_URL = 'https://partiful.com/e/bN7xq2LmT4sample';

/** MOCK: what Arrow gets back from Partiful for a pasted link. */
export async function mockPartifulImport(partifulUrl: string): Promise<Omit<ArrowEvent, 'id' | 'phase'>> {
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
    matching: DEFAULT_MATCHING,
  };
}

export const seedEvents: ArrowEvent[] = [
  {
    id: 'evt-live',
    partifulUrl: 'https://partiful.com/e/cL1mateBu1lders',
    name: 'Climate Builders Meetup',
    description:
      'Monthly meetup for people working on climate — founders, researchers, operators and the curious. Short intros, then lots of time to talk.',
    kind: 'networking',
    startsAt: '2026-10-11T19:00:00',
    endsAt: '2026-10-11T22:00:00',
    venue: 'Mission Street studio, San Francisco',
    hostName: 'Priya Shah',
    phase: { kind: 'live' },
    matching: DEFAULT_MATCHING,
  },
  {
    id: 'evt-ready',
    partifulUrl: 'https://partiful.com/e/pR0ductSupper',
    name: 'Product Supper Club',
    description:
      'A long-table dinner for product managers and designers. Bring a problem you’re stuck on; leave with three people who can help.',
    kind: 'networking',
    startsAt: '2026-10-16T19:30:00',
    endsAt: '2026-10-16T22:00:00',
    venue: 'Valencia St. restaurant, San Francisco',
    hostName: 'Marcus Webb',
    phase: { kind: 'ready' },
    matching: DEFAULT_MATCHING,
  },
  {
    id: 'evt-setup',
    partifulUrl: 'https://partiful.com/e/a1T1nkerersNight',
    name: 'AI Tinkerers Night',
    description:
      'Demos and drinks for people building with AI — engineers, researchers and founders. Show what you’re hacking on and find collaborators.',
    kind: 'networking',
    startsAt: '2026-10-18T19:00:00',
    endsAt: '2026-10-18T22:00:00',
    venue: 'SoMa co-working space, San Francisco',
    hostName: 'Dana Kim',
    phase: { kind: 'setup', step: 'questions' },
    matching: DEFAULT_MATCHING,
  },
  {
    id: 'evt-past',
    partifulUrl: 'https://partiful.com/e/r00ftopSendoff',
    name: 'Rooftop Summer Send-off',
    description: 'Last rooftop party of the summer. Good music, better people.',
    kind: 'social',
    startsAt: '2026-09-27T20:00:00',
    endsAt: '2026-09-27T23:30:00',
    venue: 'Rooftop, North Beach',
    hostName: 'Alex Moreno',
    phase: { kind: 'ended' },
    matching: DEFAULT_MATCHING,
  },
];

const FIRST = [
  'Ava', 'Ben', 'Cleo', 'Dev', 'Elena', 'Finn', 'Gia', 'Hugo', 'Ines', 'Jonah', 'Kira', 'Leo',
  'Maya', 'Nico', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sam', 'Tara', 'Uma', 'Victor', 'Wren', 'Xavi',
  'Yara', 'Zane', 'Amir', 'Bea', 'Cal', 'Dana', 'Eli', 'Fern', 'Gus', 'Hana', 'Ivo', 'Jade',
  'Kai', 'Lina', 'Milo', 'Nora', 'Otto', 'Pia', 'Rafi', 'Sol', 'Theo', 'Vera', 'Will', 'Zoe',
];
const LAST = 'ABCDEFGHJKLMNPRSTVWYZ';

/** 48 fictional guests; the last 4 have no phone number. */
function makeGuests(call: (i: number) => CallStatus, text: (i: number) => TextStatus, checkedIn: (i: number) => boolean): Guest[] {
  return FIRST.map((first, i) => {
    const noPhone = i >= 44;
    return {
      id: `g${i + 1}`,
      name: `${first} ${LAST[i % LAST.length]}.`,
      phoneLast4: noPhone ? null : String(1000 + ((i * 7919) % 9000)).slice(-4),
      rsvp: i % 9 === 4 ? 'maybe' : 'going',
      callStatus: noPhone ? 'no-phone' : call(i),
      textStatus: noPhone ? 'not-sent' : text(i),
      checkedIn: checkedIn(i),
    };
  });
}

const GUESTS: Record<string, Guest[]> = {
  /** Live: every call made (38 answered, 6 unreachable). 44 texted, 36 joined the app. 26 checked in. */
  'evt-live': makeGuests(
    (i) => (i >= 38 ? 'unreachable' : 'done'),
    (i) => (i < 36 ? 'joined' : 'sent'),
    (i) => i < 26,
  ),
  /** Ready: calls under way (26 done, 1 on the line, 2 retrying, 15 to go). No text blast yet. */
  'evt-ready': makeGuests(
    (i) => (i < 26 ? 'done' : i === 26 ? 'in-progress' : i < 29 ? 'no-answer-retrying' : 'not-called'),
    () => 'not-sent',
    () => false,
  ),
  /** Setup: nothing has gone out yet. */
  'evt-setup': makeGuests(() => 'not-called', () => 'not-sent', () => false),
};

export function seedGuests(eventId: string): Guest[] {
  return GUESTS[eventId] ?? GUESTS['evt-setup'];
}

/**
 * MOCK: during-event numbers, hardcoded for the demo. `null` until the event starts.
 * (Calls and texts are derived from guest statuses on the dashboard.)
 */
export function duringEventMetrics(eventId: string): DashboardMetrics['during'] {
  if (eventId === 'evt-live') return { checkedIn: 26, matchesMade: 21, contactsSwapped: 9 };
  return null;
}

/** MOCK: placeholder voices until the calling provider is chosen. */
export const voices: Voice[] = [
  { id: 'voice-1', label: '[Voice 1]', description: 'Female · bright', sampleUrl: '' },
  { id: 'voice-2', label: '[Voice 2]', description: 'Male · warm', sampleUrl: '' },
  { id: 'voice-3', label: '[Voice 3]', description: 'Neutral · calm', sampleUrl: '' },
];

/** MOCK: the first draft of a call plan. Real version: an LLM reads `event.description` and `event.kind`. */
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
    opening: {
      line: `Hi, this is Arrow, calling for ${event.hostName}’s event, ${event.name}. I’ll ask a few quick questions so we can introduce you to the right people there. Is now a good time?`,
      tone: 'warm',
      voiceId: 'voice-1',
    },
    retry: { attempts: 1, waitMinutes: 120 },
  };
}

/** MOCK: default text blast message. `{first}` and `{link}` are filled per guest when sending. */
export function defaultBlastMessage(event: ArrowEvent) {
  return `Hi {first}! You’re going to ${event.name}. Arrow will point you to the people you should meet there. Get the app and join the event here: {link}`;
}
