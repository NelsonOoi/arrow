/**
 * SCREEN: Setup step 1 — Imported event
 * Route: /events/:eventId/setup/import
 *
 * Purpose: show the host what Arrow pulled from Partiful and let them set the
 * two matching rules. Everything except the matching rules is read-only here;
 * to change event details the host edits them on Partiful and taps Re-sync.
 *
 * Reads:  store.getEvent(eventId), store.getGuests(eventId)
 * Writes: event.matching.topN, event.matching.graceMinutes (store.updateEvent)
 *         store.goToStep(eventId, 'questions') on continue
 * MOCK:   Re-sync does nothing yet (should re-fetch from event.partifulUrl).
 *
 * Built-in matching behavior (NOT configurable, explained in the side sheet):
 *   - matches are revealed only after a guest checks in at the event
 *   - pairs are one-to-one and never repeat
 *   - a guided pair that hasn't met after 1.5 min gets a "still looking?" check
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { SetupSteps } from '../components/SetupSteps';
import { ArrowRight, Button, NumberField, StatusTag } from '../components/ui';
import { dateLong, graceEndsAt, timeShort } from '../format';
import { useStore } from '../store';
import { NotFound } from './NotFound';

const PREVIEW_ROWS = 8;

export function ImportStep() {
  const { eventId = '' } = useParams();
  const { getEvent, getGuests, updateEvent, goToStep } = useStore();
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const event = getEvent(eventId);
  if (!event) return <NotFound />;

  const guests = getGuests(eventId);
  const withPhone = guests.filter((g) => g.phoneLast4).length;
  const visible = showAll ? guests : guests.slice(0, PREVIEW_ROWS);
  const setMatching = (patch: Partial<typeof event.matching>) => updateEvent(eventId, { matching: { ...event.matching, ...patch } });

  return (
    <>
      <SetupSteps eventId={eventId} current="import" />

      <header className="page-head">
        <div className="page-head__text">
          <h1>
            Here’s your <em>event</em>
          </h1>
          <p className="page-head__lede">
            Everything below came from Partiful. Check the matching rules, then let Arrow draft the call questions.
          </p>
          {/* event.partifulUrl — source of this import. Re-sync re-pulls details and guests. */}
          <p className="small banner-note">
            ✓ Imported {guests.length} guests from <span className="mono" data-field="event.partifulUrl">{event.partifulUrl.replace(/^https?:\/\//, '')}</span>
            <Button variant="quiet" onClick={() => alert('MOCK: re-sync from Partiful')}>
              Re-sync
            </Button>
          </p>
        </div>
      </header>

      <div className="two-col">
        <section className="two-col__main" aria-label="Event details from Partiful">
          <div>
            {/* event.kind — detected from the description, not editable. Decides which question set Arrow drafts. */}
            <StatusTag tone="indigo">{event.kind === 'networking' ? 'Networking event' : 'Social event'}</StatusTag>
            <h2 style={{ fontSize: 'var(--text-2xl)', marginTop: 'var(--s2)' }} data-field="event.name">
              {event.name}
            </h2>
          </div>
          <p className="facts">
            <span data-field="event.startsAt">{dateLong(event.startsAt)}</span>
            <span>
              {timeShort(event.startsAt)} – {timeShort(event.endsAt)}
            </span>
            <span data-field="event.venue">{event.venue}</span>
            <span data-field="event.hostName">Hosted by {event.hostName}</span>
          </p>
          {/* event.description — the text Arrow drafts the call plan from. Read-only. */}
          <blockquote className="quote" style={{ margin: 0 }} data-field="event.description">
            {event.description}
          </blockquote>
          <p className="big-sentence">
            <span className="big-num">{guests.length}</span> guests,{' '}
            <span className="big-num">{withPhone}</span> with a phone number Arrow can call.
            {guests.length - withPhone > 0 && (
              <span className="soft"> The other {guests.length - withPhone} get a profile from the event info.</span>
            )}
          </p>
        </section>

        <aside className="two-col__side">
          <section className="sheet sheet--ink" aria-labelledby="rules-title" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s5)' }}>
            <h2 id="rules-title">Matching rules</h2>
            <ul className="rules-list">
              <li>
                {/* event.matching.topN — size of each guest's "best matches" list that Arrow waits for at check-in. */}
                <NumberField
                  label="Wait for someone from each guest’s top"
                  unit="matches"
                  value={event.matching.topN}
                  min={1}
                  max={10}
                  onChange={(topN) => setMatching({ topN })}
                  dataField="event.matching.topN"
                />
              </li>
              <li>
                {/* event.matching.graceMinutes — after this many minutes past start, stop waiting and pair with the best person present. */}
                <NumberField
                  label="…until this long after the start"
                  unit="min"
                  value={event.matching.graceMinutes}
                  min={0}
                  max={90}
                  onChange={(graceMinutes) => setMatching({ graceMinutes })}
                  dataField="event.matching.graceMinutes"
                  help={`Then everyone gets the best person who’s here. That’s ${graceEndsAt(event.startsAt, event.matching.graceMinutes)}.`}
                />
              </li>
            </ul>
            <p className="small" style={{ color: '#d8cfc0' }}>
              Always on: matches show only after check-in, pairs are one-to-one and never repeat, and pairs who haven’t met
              after 1.5 min are asked “still looking?”
            </p>
          </section>
        </aside>
      </div>

      <hr className="hand-rule" />

      <section aria-labelledby="guests-title">
        <div className="section-title">
          <h2 id="guests-title">Guest list</h2>
          <span className="small soft">From Partiful. Phone numbers are hidden except the last 4 digits.</span>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Phone</th>
                <th scope="col">RSVP</th>
                <th scope="col">Profile will come from</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((g) => (
                <tr key={g.id} data-guest-id={g.id}>
                  <td style={{ fontWeight: 500 }}>{g.name}</td>
                  <td className="mono">{g.phoneLast4 ? `•••• ${g.phoneLast4}` : '—'}</td>
                  <td>{g.rsvp === 'going' ? 'Going' : 'Maybe'}</td>
                  <td>{g.phoneLast4 ? 'Voice call' : <span className="soft">Event info</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {guests.length > PREVIEW_ROWS && (
          <Button variant="quiet" onClick={() => setShowAll((s) => !s)}>
            {showAll ? 'Show fewer' : `Show all ${guests.length}`}
          </Button>
        )}
      </section>

      <div className="footer-bar">
        <span className="soft">Next, Arrow drafts what to ask each guest. You’ll sign off before any calls go out.</span>
        <Button
          size="lg"
          onClick={() => {
            goToStep(eventId, 'questions');
            navigate(`/events/${eventId}/setup/questions`);
          }}
        >
          Draft call questions <ArrowRight />
        </Button>
      </div>
    </>
  );
}
