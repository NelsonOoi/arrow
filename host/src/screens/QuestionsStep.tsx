/**
 * SCREEN: Setup step 2 — Call plan (questions sign-off)
 * Route: /events/:eventId/setup/questions
 *
 * Purpose: the host reviews and signs off on what Arrow's voice agent will do on
 * each call. Split screen:
 *   LEFT  — the call plan itself. This is the source of truth that gets signed
 *           off and sent to the voice agent. Directly editable.
 *   RIGHT — a chat with Arrow. Every request edits the plan on the left; the
 *           reply lists what changed and offers undo. Selecting a question
 *           ("Ask about this") scopes the next chat request to that question.
 *
 * Reads:  store.getEvent, store.getCallPlan, store.getChat, store.getGuests
 * Writes: callPlan.* (store.setCallPlan), chat transcript (store.pushChat),
 *         callPlan.signedOff + store.goToStep(eventId, 'finish') on sign-off
 * MOCK:   chat replies come from src/agent/planAgent.ts (keyword stub, not an LLM);
 *         voice samples don't play.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { askPlanAgent, diffPlans } from '../agent/planAgent';
import { Dropdown } from '../components/Dropdown';
import { SetupSteps } from '../components/SetupSteps';
import { ArrowRight, Button, TextArea } from '../components/ui';
import { callMinutes } from '../format';
import { voices } from '../mock/data';
import { useStore } from '../store';
import type { CallPlan, CallQuestion, ChatMessage, Tone } from '../types';
import { NotFound } from './NotFound';

const TONES: { value: Tone; label: string; description: string }[] = [
  { value: 'warm', label: 'Warm & casual', description: 'Friendly, like a friend of the host' },
  { value: 'professional', label: 'Professional', description: 'Polite and to the point' },
  { value: 'upbeat', label: 'Upbeat', description: 'High energy, party vibe' },
  { value: 'calm', label: 'Calm', description: 'Slow, relaxed pace' },
];

let localId = 1;

export function QuestionsStep() {
  const { eventId = '' } = useParams();
  const { getEvent, getCallPlan, setCallPlan, getGuests, goToStep } = useStore();
  const navigate = useNavigate();
  /** Question the host selected to scope the next chat request to. */
  const [focusId, setFocusId] = useState<string | null>(null);
  const event = getEvent(eventId);
  if (!event) return <NotFound what="event" />;

  const plan = getCallPlan(eventId);
  const update = (patch: Partial<CallPlan>) => setCallPlan(eventId, { ...plan, ...patch });
  const guests = getGuests(eventId);
  const callable = guests.filter((g) => g.phoneLast4).length;
  const canSignOff = plan.goal.trim().length > 0 && plan.questions.length > 0;

  const signOff = () => {
    // MOCK: POST /events/:id/call-plan/sign-off — starts the voice agent's calls.
    setCallPlan(eventId, { ...plan, removed: [], questions: plan.questions.map(({ changedBy: _c, ...q }) => q), signedOff: true });
    goToStep(eventId, 'finish');
    navigate(`/events/${eventId}/setup/finish`);
  };

  return (
    <>
      <SetupSteps eventId={eventId} current="questions" />

      <header className="page-head">
        <div className="page-head__text">
          <span className="eyebrow">Needs your sign-off</span>
          <h1>
            Your call <em>plan</em>
          </h1>
          <p className="page-head__lede">
            Drafted from your event description. Edit it directly, or tell Arrow what to change in the chat.
          </p>
        </div>
      </header>

      <div className="split">
        <div className="split__plan">
          {/* callPlan.goal — what every call must find out. The agent may ask follow-ups until it has this.
              Matching is scored against the profile this produces. */}
          <TextArea
            label="Goal of each call"
            rows={3}
            value={plan.goal}
            onChange={(e) => update({ goal: e.target.value })}
            dataField="callPlan.goal"
            help="Matching is scored against the profiles this produces."
          />

          <QuestionList plan={plan} update={update} focusId={focusId} setFocusId={setFocusId} />

          <section className="plan-section" aria-labelledby="opening-title">
            <h2 id="opening-title">How the call opens</h2>
            {/* callPlan.opening.line — the agent's first sentence. Should name the host and ask if now is a good time.
                If the guest says it isn't, the agent always offers to call back later (built-in, not configurable). */}
            <TextArea
              label="Opening line"
              rows={3}
              value={plan.opening.line}
              onChange={(e) => update({ opening: { ...plan.opening, line: e.target.value } })}
              dataField="callPlan.opening.line"
              help="If it’s not a good time, Arrow offers to call back later."
            />
            <div className="inline-grid">
              {/* callPlan.opening.tone — speaking style the agent is prompted with. */}
              <Dropdown
                label="Tone"
                value={plan.opening.tone}
                options={TONES}
                onChange={(tone) => update({ opening: { ...plan.opening, tone } })}
                dataField="callPlan.opening.tone"
              />
              {/* callPlan.opening.voiceId — provider voice. Options are placeholders until the provider is chosen. */}
              <Dropdown
                label="Voice"
                value={plan.opening.voiceId}
                options={voices.map((v) => ({
                  value: v.id,
                  label: v.label,
                  description: v.description,
                  trailing: (
                    <button
                      type="button"
                      className="play-btn"
                      aria-label={`Play ${v.label} sample`}
                      onClick={() => alert(`MOCK: play sample for ${v.label}`)}
                    >
                      <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden="true">
                        <path d="M4 2.5 L11 7 L4 11.5 Z" fill="currentColor" />
                      </svg>
                    </button>
                  ),
                }))}
                onChange={(voiceId) => update({ opening: { ...plan.opening, voiceId } })}
                dataField="callPlan.opening.voiceId"
              />
            </div>
          </section>

          <section className="plan-section" aria-labelledby="retry-title">
            <h2 id="retry-title">If they don’t pick up</h2>
            <div className="inline-grid">
              {/* callPlan.retry.attempts — extra call attempts after a missed call. */}
              <Dropdown
                label="Retries"
                value={plan.retry.attempts}
                options={[
                  { value: 0, label: 'No retry' },
                  { value: 1, label: '1 retry' },
                  { value: 2, label: '2 retries' },
                ]}
                onChange={(attempts) => update({ retry: { ...plan.retry, attempts } })}
                dataField="callPlan.retry.attempts"
              />
              {/* callPlan.retry.waitMinutes — gap before each retry. */}
              <Dropdown
                label="Wait before retrying"
                value={plan.retry.waitMinutes}
                options={[
                  { value: 30, label: '30 minutes' },
                  { value: 60, label: '1 hour' },
                  { value: 120, label: '2 hours' },
                ]}
                onChange={(waitMinutes) => update({ retry: { ...plan.retry, waitMinutes } })}
                dataField="callPlan.retry.waitMinutes"
              />
            </div>
            {/* Built-in fallback: guest.intake becomes 'event-info'. Not configurable. */}
            <p className="small soft">
              If Arrow still can’t reach them, it builds their profile from what the event already has on them. Guests with
              no phone number skip straight to this.
            </p>
          </section>
        </div>

        <div className="split__chat">
          <ChatPanel eventId={eventId} plan={plan} focusId={focusId} clearFocus={() => setFocusId(null)} />
        </div>
      </div>

      <div className="footer-bar">
        <span>
          Arrow will call <b>{callable} guests</b>
          {guests.length - callable > 0 && <span className="soft">. {guests.length - callable} without a phone get a profile from event info.</span>}
        </span>
        <Button size="lg" onClick={signOff} disabled={!canSignOff}>
          Sign off &amp; start calls <ArrowRight />
        </Button>
      </div>
    </>
  );
}

/* ---------------- Questions list ---------------- */

/**
 * callPlan.questions — ordered list the agent asks. Exactly one is the key
 * question (feeds the guest's `goal`, weighted most by matching).
 * callPlan.removed — questions removed this session, shown struck through with undo.
 */
function QuestionList({
  plan,
  update,
  focusId,
  setFocusId,
}: {
  plan: CallPlan;
  update: (patch: Partial<CallPlan>) => void;
  focusId: string | null;
  setFocusId: (id: string | null) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [newText, setNewText] = useState('');

  const remove = (q: CallQuestion) => {
    if (q.isKey) return; // the key question can be edited but not removed
    update({ questions: plan.questions.filter((x) => x.id !== q.id), removed: [...plan.removed, q] });
    if (focusId === q.id) setFocusId(null);
  };
  const restore = (q: CallQuestion) =>
    update({ questions: [...plan.questions, q], removed: plan.removed.filter((x) => x.id !== q.id) });
  const saveEdit = (q: CallQuestion) => {
    const text = draft.trim();
    if (text) update({ questions: plan.questions.map((x) => (x.id === q.id ? { ...x, text } : x)) });
    setEditingId(null);
  };
  const add = (e: FormEvent) => {
    e.preventDefault();
    const text = newText.trim();
    if (!text) return;
    update({ questions: [...plan.questions, { id: `host-${localId++}`, text, gets: [], isKey: false }] });
    setNewText('');
  };

  return (
    <section className="plan-section" aria-labelledby="q-title">
      <div className="section-title">
        <h2 id="q-title">Questions</h2>
        <span className="small soft">about {callMinutes(plan.questions.length)} min per call</span>
      </div>
      <ol className="qlist" data-field="callPlan.questions">
        {plan.questions.map((q, i) => (
          <li
            key={q.id}
            className={`q ${q.isKey ? 'q--key' : ''} ${focusId === q.id ? 'q--focused' : ''}`}
            data-question-id={q.id}
          >
            <span className="q__num">{i + 1}</span>
            <div className="q__body">
              {editingId === q.id ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveEdit(q);
                  }}
                  className="add-q"
                  style={{ marginTop: 0 }}
                >
                  <label htmlFor={`edit-${q.id}`} className="visually-hidden">
                    Edit question {i + 1}
                  </label>
                  <input
                    id={`edit-${q.id}`}
                    className="input"
                    value={draft}
                    autoFocus
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => e.key === 'Escape' && setEditingId(null)}
                    data-field={`callPlan.questions[${i}].text`}
                  />
                  <Button variant="ink" type="submit">
                    Save
                  </Button>
                </form>
              ) : (
                <span className="q__text">
                  <span className={q.changedBy === 'chat' ? 'marker' : undefined}>{q.text}</span>
                </span>
              )}
              <span className="q__meta">
                {q.isKey && <span className="q__key">Key question</span>}
                {q.gets.length > 0 && <span>Gets: {q.gets.join(' · ')}</span>}
                {q.changedBy === 'chat' && <span>Changed from chat</span>}
              </span>
            </div>
            <div className="q__actions">
              <button
                type="button"
                className="icon-btn"
                aria-label={focusId === q.id ? `Stop asking about question ${i + 1}` : `Ask Arrow about question ${i + 1}`}
                aria-pressed={focusId === q.id}
                title="Ask Arrow about this question"
                onClick={() => setFocusId(focusId === q.id ? null : q.id)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M2.5 3.5 H13.5 V11 H7 L4 13.5 V11 H2.5 Z" stroke="currentColor" strokeWidth="1.5" fill={focusId === q.id ? 'currentColor' : 'none'} strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Edit question ${i + 1}`}
                onClick={() => {
                  setEditingId(q.id);
                  setDraft(q.text);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3 13 L3.5 10.5 L10.5 3.5 L12.5 5.5 L5.5 12.5 Z" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
                </svg>
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={q.isKey ? 'The key question can’t be removed' : `Remove question ${i + 1}`}
                disabled={q.isKey}
                style={q.isKey ? { opacity: 0.3, cursor: 'not-allowed' } : undefined}
                onClick={() => remove(q)}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4 4 L12 12 M12 4 L4 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </li>
        ))}
      </ol>

      {plan.removed.map((q) => (
        <p key={q.id} className="q q--removed">
          <s>{q.text}</s>
          <span className="small">Removed</span>
          <Button variant="quiet" onClick={() => restore(q)}>
            Undo
          </Button>
        </p>
      ))}

      <form className="add-q" onSubmit={add}>
        <label htmlFor="new-question" className="visually-hidden">
          New question
        </label>
        <input
          id="new-question"
          className="input"
          placeholder="Add a question…"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          data-field="callPlan.questions[+].text"
        />
        <Button variant="outline" type="submit" disabled={!newText.trim()}>
          Add
        </Button>
      </form>
    </section>
  );
}

/* ---------------- Chat panel ---------------- */

const SUGGESTIONS = ['Ask what stage their company is at', 'Make calls shorter', 'Also ask if they’re hiring', 'More casual tone'];

function ChatPanel({
  eventId,
  plan,
  focusId,
  clearFocus,
}: {
  eventId: string;
  plan: CallPlan;
  focusId: string | null;
  clearFocus: () => void;
}) {
  const { getChat, pushChat, setCallPlan } = useStore();
  const messages = getChat(eventId);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const focusIndex = focusId ? plan.questions.findIndex((q) => q.id === focusId) : -1;

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, busy]);

  const send = async (raw: string) => {
    const message = raw.trim();
    if (!message || busy) return;
    setText('');
    pushChat(eventId, { id: `m${Date.now()}`, from: 'host', text: focusIndex >= 0 ? `(Question ${focusIndex + 1}) ${message}` : message });
    setBusy(true);
    const before = plan;
    const { reply, plan: after } = await askPlanAgent(message, before, focusId ?? undefined);
    setBusy(false);
    const changes = diffPlans(before, after);
    const changed = changes.added.length + changes.removed.length + changes.updated.length > 0;
    if (changed) setCallPlan(eventId, after);
    const arrowMsg: ChatMessage = {
      id: `m${Date.now()}a`,
      from: 'arrow',
      text: reply,
      ...(changed ? { changes, undoSnapshot: before } : {}),
    };
    pushChat(eventId, arrowMsg);
    clearFocus();
  };

  return (
    <aside className="chat" aria-label="Chat with Arrow about the call plan">
      <div className="chat__head">
        <svg width="22" height="22" viewBox="0 0 32 32" aria-hidden="true">
          <path d="M16 2.5 C 24 2, 30 8.5, 29.5 16.5 C 29 24, 23 29.8, 15.5 29.5 C 8 29.2, 2.3 23, 2.6 15.5 C 2.9 8, 8.5 3, 16 2.5 Z" fill="var(--pen)" />
          <path d="M10.5 21.5 L21 11 M13.5 10.8 H21.2 V18.5" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <h2 style={{ fontSize: 'var(--text-lg)' }}>Ask Arrow to change the plan</h2>
      </div>

      <div className="chat__log" ref={logRef} aria-live="polite">
        {messages.map((m) =>
          m.from === 'host' ? (
            <div key={m.id} className="bubble bubble--host">
              {m.text}
            </div>
          ) : (
            <div key={m.id} className="bubble bubble--arrow">
              {m.text}
              {m.changes && (
                <div className="receipt">
                  {m.changes.added.map((t) => (
                    <span key={`a${t}`}>
                      <b className="receipt__add">+ Added</b> {t}
                    </span>
                  ))}
                  {m.changes.removed.map((t) => (
                    <span key={`r${t}`}>
                      <b className="receipt__rm">− Removed</b> {t}
                    </span>
                  ))}
                  {m.changes.updated.map((t) => (
                    <span key={`u${t}`}>
                      <b>~ Updated</b> {t}
                    </span>
                  ))}
                  {m.undoSnapshot && (
                    <span>
                      <Button variant="quiet" onClick={() => m.undoSnapshot && setCallPlan(eventId, m.undoSnapshot)}>
                        Undo these changes
                      </Button>
                    </span>
                  )}
                </div>
              )}
            </div>
          ),
        )}
        {busy && <span className="typing">Arrow is updating the plan…</span>}
      </div>

      <div className="chat__foot">
        {focusIndex >= 0 ? (
          <span className="focus-chip">
            Asking about question {focusIndex + 1}
            <Button variant="quiet" onClick={clearFocus}>
              Clear
            </Button>
          </span>
        ) : (
          <div className="chips">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => send(s)} disabled={busy}>
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="chat__form"
          onSubmit={(e) => {
            e.preventDefault();
            void send(text);
          }}
        >
          <label htmlFor="chat-input" className="visually-hidden">
            Message Arrow
          </label>
          <input
            id="chat-input"
            className="input"
            placeholder={focusIndex >= 0 ? 'e.g. make it more casual' : 'e.g. also ask if they’re hiring'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button variant="ink" type="submit" aria-label="Send" disabled={busy || !text.trim()} style={{ padding: '0 16px' }}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M9 14 V4 M5 8 L9 4 L13 8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Button>
        </form>
      </div>
    </aside>
  );
}
