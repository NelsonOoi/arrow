/** Thin client for the matchmaker FastAPI backend (on Vercel under `/mm`, or `uv run uvicorn --factory matchmaker.api:app`). */

const DEFAULT_API_URL = 'http://localhost:8000';
const TIMEOUT_MS = 8_000;

/** Set EXPO_PUBLIC_API_URL to the deployment (`https://<project>.vercel.app/mm`) or, for a laptop, its LAN address. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).replace(/\/+$/, '');
/** Pins the app to one event. Unset, it uses the newest live event. */
export const EVENT_ID = process.env.EXPO_PUBLIC_EVENT_ID || null;

export type EventStatus = 'draft' | 'precomputing' | 'ready' | 'live' | 'closed';
export type AttendeeStatus = 'registered' | 'available' | 'in_conversation' | 'away';

export type ApiEvent = {
  id: string;
  name: string;
  status: EventStatus;
};

export type ApiAttendee = {
  id: string;
  external_ref: string | null;
  display_name: string;
  offering_text: string;
  seeking_text: string;
  topics: string[];
  goals: string[];
  token: string;
  status: AttendeeStatus;
};

export type ApiRoster = { event: ApiEvent; attendees: ApiAttendee[] };

export type ApiConversation = {
  id: string;
  partner_id: string;
  partner_name: string;
  partner_about: string;
  started_at: string;
  your_rank_of_partner: number;
};

export type ApiCurrent = {
  attendee_id: string;
  status: AttendeeStatus;
  conversation: ApiConversation | null;
  waiting_seconds: number | null;
  /** True when the last refresh found nobody left for this person to meet. */
  exhausted?: boolean;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init?.method ?? 'GET',
      headers: init?.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
  } catch (e) {
    const reason = controller.signal.aborted ? 'timed out' : e instanceof Error ? e.message : String(e);
    throw new ApiError(0, `Can't reach the matchmaker at ${API_URL} (${reason})`);
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (typeof body?.detail === 'string') detail = body.detail;
    } catch {
      // Not JSON; keep the status text.
    }
    throw new ApiError(res.status, detail || `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export const api = {
  listEvents: () => request<ApiEvent[]>('/events'),
  roster: (eventId: string) => request<ApiRoster>(`/events/${eventId}/attendees`),
  current: (attendeeId: string) => request<ApiCurrent>(`/attendees/${attendeeId}/current`),
  setStatus: (attendeeId: string, status: 'available' | 'away') =>
    request<ApiCurrent>(`/attendees/${attendeeId}/status`, { method: 'POST', body: { status } }),
  endConversation: (conversationId: string, endedBy: string) =>
    request<{ id: string; ended: boolean; changed: boolean }>(`/conversations/${conversationId}/end`, {
      method: 'POST',
      body: { ended_by: endedBy },
    }),
};

/** The pinned event if set, else the newest live event, else the newest ready one. */
export function pickEvent(events: ApiEvent[], pinned: string | null = EVENT_ID): ApiEvent | undefined {
  if (pinned) return events.find((e) => e.id === pinned);
  return events.find((e) => e.status === 'live') ?? events.find((e) => e.status === 'ready');
}
