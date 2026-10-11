/**
 * Data model for the Arrow host app.
 *
 * These types mirror the backend tables. Every input in the UI carries a
 * `data-field` attribute whose value is a dotted path into these types
 * (e.g. `callPlan.goal`, `event.matching.topN`). If you rename a field here,
 * grep for its `data-field` path and update the UI too.
 */

/** Kind of event, detected from the Partiful description at import. Not host-editable. */
export type EventKind = 'networking' | 'social';

/** Where an event is in its lifecycle. Drives which screen the overview links to. */
export type EventPhase =
  | { kind: 'setup'; step: SetupStep }
  | { kind: 'live' }
  | { kind: 'ended' };

export type SetupStep = 'import' | 'questions' | 'finish';

/** The only two host-configurable matching knobs. Everything else is built-in behavior. */
export type MatchingRules = {
  /**
   * When a guest checks in, Arrow waits for someone from their top-N list to be
   * present before falling back to the best available person.
   */
  topN: number;
  /**
   * Minutes after the event start time when the top-N wait ends. After this,
   * every guest is paired with the best checked-in, available person.
   */
  graceMinutes: number;
};

export type ArrowEvent = {
  id: string;
  /** Source link the host pasted. Re-sync pulls from here again. */
  partifulUrl: string;
  name: string;
  /** Free text pulled from Partiful. Used to draft the call plan. Read-only in the UI. */
  description: string;
  kind: EventKind;
  /** ISO datetime of the event start. The grace window counts from here. */
  startsAt: string;
  endsAt: string;
  venue: string;
  hostName: string;
  phase: EventPhase;
  matching: MatchingRules;
};

export type RsvpStatus = 'going' | 'maybe';

/** How a guest's profile was (or will be) built. */
export type IntakeSource =
  | 'call' // answered the voice agent
  | 'event-info'; // couldn't be reached, or no phone; profile built from Partiful data

/** Voice-call progress for one guest. */
export type CallStatus =
  | 'not-called'
  | 'in-progress'
  | 'done'
  | 'no-answer-retrying'
  | 'unreachable' // retries exhausted -> falls back to event info
  | 'no-phone';

/**
 * Live, at-event state for one guest. One-to-one pairing only happens between
 * two guests who are both `looking`.
 */
export type GuestLiveState =
  | 'not-checked-in'
  | 'waiting-for-top' // checked in, inside the grace window, none of their top-N here yet
  | 'looking' // wants a match now
  | 'guided' // paired; both phones show the arrow, color and keyword
  | 'in-match' // found each other, talking
  | 'deciding' // picking "Interested" / "Not interested"
  | 'roaming'; // free to wander; not matchable until they tap "Find me next one"

export type Guest = {
  id: string;
  name: string;
  /** Last 4 digits only, for display. Full number never reaches the host UI. */
  phoneLast4: string | null;
  rsvp: RsvpStatus;
  intake: IntakeSource;
  callStatus: CallStatus;
  /** One-line summary of what the guest wants out of the event (from the call's key question). */
  goal: string | null;
  liveState: GuestLiveState;
  /** How many people they've met tonight. */
  metCount: number;
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
  /** Set when the chat agent added or edited this question; drives the marker highlight. */
  changedBy?: 'chat';
};

/** Everything the voice agent needs. The host signs this off before any call is placed. */
export type CallPlan = {
  /** What each call must find out. The agent may ask follow-ups until it has this. */
  goal: string;
  questions: CallQuestion[];
  /** Questions removed by chat, kept visible (struck through) until sign-off so they can be undone. */
  removed: CallQuestion[];
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
  signedOff: boolean;
};

export type Voice = {
  id: string;
  label: string;
  description: string;
  /** URL of a short sample clip. MOCK: empty until a provider is wired up. */
  sampleUrl: string;
};

export type PairStatus = 'guided' | 'talking' | 'still-looking-check';

/** One active one-to-one pair. Color + keyword act as a passcode when the two meet. */
export type Pair = {
  id: string;
  guestIds: [string, string];
  color: PairColor;
  keyword: string;
  status: PairStatus;
  /** For `guided`: rough distance between the two phones. */
  distanceM?: number;
  /** For `talking`: minutes since they met. */
  minutes?: number;
  /** For `still-looking-check`: seconds left for both to answer before the pair is cancelled. */
  secondsLeft?: number;
};

export type PairColor = 'teal' | 'amber' | 'violet' | 'blue' | 'rose' | 'moss';

export type ActivityItem = { at: string; text: string };

export type ChatMessage =
  | { id: string; from: 'host'; text: string }
  | {
      id: string;
      from: 'arrow';
      text: string;
      /** If this reply changed the plan, a summary of the changes plus a snapshot to undo to. */
      changes?: { added: string[]; removed: string[]; updated: string[] };
      undoSnapshot?: CallPlan;
    };
