/**
 * Data model for the Arrow host app (MVP).
 *
 * These types mirror the backend tables. Every input in the UI carries a
 * `data-field` attribute whose value is a dotted path into these types
 * (e.g. `callPlan.goal`, `textBlast.message`). If you rename a field here,
 * grep for its `data-field` path and update the UI too.
 */

/** Kind of event, detected from the Partiful description at import. Not host-editable. */
export type EventKind = 'networking' | 'social';

export type SetupStep = 'import' | 'questions';

/**
 * Where an event is in its lifecycle. Drives the overview's label and link.
 *   setup  -> still in the two setup steps
 *   ready  -> setup finished, calls/texts going out, event hasn't started
 *   live   -> event in progress
 *   ended  -> over
 */
export type EventPhase =
  | { kind: 'setup'; step: SetupStep }
  | { kind: 'ready' }
  | { kind: 'live' }
  | { kind: 'ended' };

/**
 * Matching knobs. NOT shown in the MVP UI — fixed at DEFAULT_MATCHING and
 * kept on the event so the matcher can read them.
 */
export type MatchingRules = {
  /** At check-in, wait for someone from the guest's top-N list before falling back. */
  topN: number;
  /** Minutes after start when the top-N wait ends and everyone gets the best person present. */
  graceMinutes: number;
};

export const DEFAULT_MATCHING: MatchingRules = { topN: 5, graceMinutes: 15 };

export type ArrowEvent = {
  id: string;
  /** Source link the host pasted. */
  partifulUrl: string;
  name: string;
  /** Free text pulled from Partiful. Used to draft the call plan. Read-only in the UI. */
  description: string;
  kind: EventKind;
  /** ISO datetime of the event start. */
  startsAt: string;
  endsAt: string;
  venue: string;
  hostName: string;
  phase: EventPhase;
  matching: MatchingRules;
};

export type RsvpStatus = 'going' | 'maybe';

/** Voice-call progress for one guest. */
export type CallStatus =
  | 'not-called'
  | 'in-progress'
  | 'done' // answered; profile built from the call
  | 'no-answer-retrying'
  | 'unreachable' // retries used up; profile built from event info
  | 'no-phone';

/**
 * Text blast progress for one guest. The text links to the Arrow app and drops
 * them into this event.
 */
export type TextStatus =
  | 'not-sent'
  | 'sent'
  | 'joined'; // opened the link and joined the event in the app

export type Guest = {
  id: string;
  name: string;
  /** Last 4 digits only, for display. Full number never reaches the host UI. */
  phoneLast4: string | null;
  rsvp: RsvpStatus;
  callStatus: CallStatus;
  textStatus: TextStatus;
  /** Scanned the check-in code at the door. Matches unlock only after this. */
  checkedIn: boolean;
};

/** Agent voice style. */
export type Tone = 'warm' | 'professional' | 'upbeat' | 'calm';

export type CallQuestion = {
  id: string;
  text: string;
  /** What profile fields the answer fills in, shown as "Gets: …". */
  gets: string[];
  /** The key question feeds the "goal" the matcher weighs most. Exactly one per plan. */
  isKey: boolean;
};

/** Everything the voice agent needs. The host finishes setup with this, which starts the calls. */
export type CallPlan = {
  /** What each call must find out. The agent may ask follow-ups until it has this. */
  goal: string;
  questions: CallQuestion[];
  opening: {
    /** First thing the agent says. Should name the host and ask if now is a good time. */
    line: string;
    tone: Tone;
    /** Provider voice id. Placeholder until the calling provider is chosen. */
    voiceId: string;
  };
  /** If a guest doesn't pick up. After retries, Arrow falls back to event info automatically. */
  retry: {
    attempts: 0 | 1 | 2;
    waitMinutes: 30 | 60 | 120;
  };
};

export type Voice = {
  id: string;
  label: string;
  description: string;
  /** URL of a short sample clip. MOCK: empty until a provider is wired up. */
  sampleUrl: string;
};

/** One text blast: the same message sent to every guest with a phone who hasn't joined yet. */
export type TextBlast = {
  sentAt: string;
  recipients: number;
  message: string;
};

/**
 * Numbers on the event dashboard.
 * MOCK: hardcoded per event in src/mock/data.ts for the demo.
 */
export type DashboardMetrics = {
  callsMade: number;
  callsTotal: number;
  textsSent: number;
  joinedApp: number;
  /** During-event numbers; null before the event starts. */
  during: { checkedIn: number; matchesMade: number; contactsSwapped: number } | null;
};
