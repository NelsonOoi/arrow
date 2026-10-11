/**
 * SCREEN: Setup step 1 — Imported event
 * Route: /events/:eventId/setup/import
 *
 * Purpose: show the host what Arrow pulled from Partiful so they can check it
 * before moving on. Everything here is read-only; to change event details the
 * host edits them on Partiful.
 *
 * Reads:  store.getEvent(eventId), store.getGuests(eventId)
 * Writes: store.goToStep(eventId, 'questions') on continue
 *
 * MVP: matching rules aren't shown. They're fixed at DEFAULT_MATCHING (top 5,
 * 15 min) on the event — see src/types.ts.
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { SetupSteps } from '../components/SetupSteps';
import { ArrowRight, Button, StatusTag } from '../components/ui';
import { dateLong, timeShort } from '../format';
import { useStore } from '../store';
import { NotFound } from './NotFound';

const PREVIEW_ROWS = 8;

export function ImportStep() {
  const { eventId = '' } = useParams();
  const { getEvent, getGuests, goToStep } = useStore();
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  const event = getEvent(eventId);
  if (!event) return <NotFound what="event" />;

  const guests = getGuests(eventId);
  const withPhone = guests.filter((g) => g.phoneLast4).length;
  const visible = showAll ? guests : guests.slice(0, PREVIEW_ROWS);

  return (
    <>
      <SetupSteps eventId={eventId} current="import" />

      <header className="page-head">
        <div className="page-head__text">
          <h1>
            Here’s your <em>event</em>
          </h1>
          <p className="page-head__lede">Everything below came from Partiful. Check it over, then set up the call questions.</p>
          {/* event.partifulUrl — source of this import. */}
          <p className="small banner-note">
            ✓ Imported {guests.length} guests from{' '}
            <span className="mono" data-field="event.partifulUrl">
              {event.partifulUrl.replace(/^https?:\/\//, '')}
            </span>
          </p>
        </div>
      </header>

      <section className="event-detail" aria-label="Event details from Partiful">
        <div>
          {/* event.kind — detected from the description, not editable. Decides which questions Arrow drafts. */}
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
          <span className="big-num">{guests.length}</span> guests, <span className="big-num">{withPhone}</span> with a phone
          number Arrow can call.
          {guests.length - withPhone > 0 && (
            <span className="soft"> The other {guests.length - withPhone} get a profile from the event info.</span>
          )}
        </p>
      </section>

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
        <span className="soft">Next, set what Arrow asks each guest on the call.</span>
        <Button
          size="lg"
          onClick={() => {
            goToStep(eventId, 'questions');
            navigate(`/events/${eventId}/setup/questions`);
          }}
        >
          Set up call questions <ArrowRight />
        </Button>
      </div>
    </>
  );
}
