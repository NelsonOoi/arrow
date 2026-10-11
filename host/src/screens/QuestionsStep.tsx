/**
 * SCREEN: Setup step 2 — Call plan (last setup step)
 * Route: /events/:eventId/setup/questions
 *
 * Purpose: the host reviews and edits what Arrow's voice agent does on each
 * call, then taps "Finish setup", which locks the plan, starts calling guests,
 * and opens the event dashboard. Everything is edited by hand (no AI chat in
 * the MVP).
 *
 * Sections, top to bottom:
 *   Goal of each call      callPlan.goal
 *   Questions              callPlan.questions  (edit / remove / add; the key question can't be removed)
 *   How the call opens     callPlan.opening.line, .tone, .voiceId
 *   If they don't pick up  callPlan.retry.attempts, .waitMinutes
 *
 * Reads:  store.getEvent, store.getCallPlan, store.getGuests
 * Writes: store.setCallPlan on every edit; store.finishSetup on "Finish setup"
 * MOCK:   voice samples don't play.
 */
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Dropdown } from '../components/Dropdown';
import { SetupSteps } from '../components/SetupSteps';
import { ArrowRight, Button, TextArea } from '../components/ui';
import { callMinutes } from '../format';
import { voices } from '../mock/data';
import { useStore } from '../store';
import type { CallPlan, CallQuestion, Tone } from '../types';
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
  const { getEvent, getCallPlan, setCallPlan, getGuests, finishSetup } = useStore();
  const navigate = useNavigate();
  const event = getEvent(eventId);
  if (!event) return <NotFound what="event" />;

  const plan = getCallPlan(eventId);
  const update = (patch: Partial<CallPlan>) => setCallPlan(eventId, { ...plan, ...patch });
  const guests = getGuests(eventId);
  const callable = guests.filter((g) => g.phoneLast4).length;
  const canFinish = plan.goal.trim().length > 0 && plan.questions.length > 0 && plan.opening.line.trim().length > 0;

  const finish = () => {
    finishSetup(eventId);
    navigate(`/events/${eventId}`);
  };

  return (
    <>
      <SetupSteps eventId={eventId} current="questions" />

      <header className="page-head">
        <div className="page-head__text">
          <h1>
            Your call <em>plan</em>
          </h1>
          <p className="page-head__lede">
            Drafted from your event description. Edit anything, then finish setup to start the calls.
          </p>
        </div>
      </header>

      <div className="plan-column">
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

        <QuestionList plan={plan} update={update} />

        <section className="plan-section" aria-labelledby="opening-title">
          <h2 id="opening-title">How the call opens</h2>
          {/* callPlan.opening.line — the agent's first sentence. Should name the host and ask if now is a good time.
              If the guest says it isn't, the agent always offers to call back later (built-in). */}
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
          {/* Built-in fallback, not configurable. */}
          <p className="small soft">
            If Arrow still can’t reach them, it builds their profile from what the event already has on them. Guests with no
            phone number skip straight to this.
          </p>
        </section>
      </div>

      <div className="footer-bar">
        <span>
          Finishing setup starts calls to <b>{callable} guests</b>.
          {guests.length - callable > 0 && <span className="soft"> {guests.length - callable} without a phone get a profile from event info.</span>}
        </span>
        <Button size="lg" onClick={finish} disabled={!canFinish}>
          Finish setup <ArrowRight />
        </Button>
      </div>
    </>
  );
}

/**
 * callPlan.questions — ordered list the agent asks. Exactly one is the key
 * question (feeds the guest's goal, weighted most by matching); it can be
 * edited but not removed.
 */
function QuestionList({ plan, update }: { plan: CallPlan; update: (patch: Partial<CallPlan>) => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [newText, setNewText] = useState('');

  const remove = (q: CallQuestion) => {
    if (!q.isKey) update({ questions: plan.questions.filter((x) => x.id !== q.id) });
  };
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
          <li key={q.id} className={`q ${q.isKey ? 'q--key' : ''}`} data-question-id={q.id}>
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
                <span className="q__text">{q.text}</span>
              )}
              <span className="q__meta">
                {q.isKey && <span className="q__key">Key question</span>}
                {q.gets.length > 0 && <span>Gets: {q.gets.join(' · ')}</span>}
              </span>
            </div>
            <div className="q__actions">
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
