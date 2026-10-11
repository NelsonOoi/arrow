/**
 * SCREEN: Setup step 3 — Finish setting up
 * Route: /events/:eventId/setup/finish
 *
 * Purpose: last stop before the event. Calls are already running (they start at
 * sign-off). The host sees call progress, gets the check-in QR for the door,
 * and reviews their setup.
 *
 * Reads:  store.getEvent, store.getGuests (guest.callStatus), store.getCallPlan
 * Writes: store.goToStep(eventId, 'live') on "Go to event dashboard"
 * MOCK:   call progress is a static snapshot (should stream from the calling
 *         service); the QR code is a placeholder (should encode the event's
 *         check-in deep link, e.g. arrow://checkin/<eventId>).
 *
 * Check-in matters: a guest's matches are only revealed after they scan this.
 */
import { useNavigate, useParams } from 'react-router-dom';

import { SetupSteps } from '../components/SetupSteps';
import { ArrowRight, Button, ButtonLink, StatusTag } from '../components/ui';
import { graceEndsAt } from '../format';
import { useStore } from '../store';
import { NotFound } from './NotFound';

export function FinishStep() {
  const { eventId = '' } = useParams();
  const { getEvent, getGuests, getCallPlan, goToStep } = useStore();
  const navigate = useNavigate();
  const event = getEvent(eventId);
  if (!event) return <NotFound what="event" />;

  const guests = getGuests(eventId);
  const plan = getCallPlan(eventId);
  const callable = guests.filter((g) => g.callStatus !== 'no-phone');
  const done = callable.filter((g) => g.callStatus === 'done').length;
  const retrying = callable.filter((g) => g.callStatus === 'no-answer-retrying').length;
  const notYet = callable.filter((g) => g.callStatus === 'not-called' || g.callStatus === 'in-progress').length;
  const pct = (n: number) => `${(n / Math.max(1, callable.length)) * 100}%`;

  return (
    <>
      <SetupSteps eventId={eventId} current="finish" />

      <header className="page-head">
        <div className="page-head__text">
          <h1>
            Almost <em>ready</em>
          </h1>
          <p className="page-head__lede">Arrow is calling your guests now. Put the check-in code at the door and you’re set.</p>
        </div>
      </header>

      <div className="two-col">
        <section className="two-col__main" aria-labelledby="calls-title">
          <div className="section-title">
            <h2 id="calls-title">Calling guests</h2>
            <StatusTag tone="moss" live>
              In progress
            </StatusTag>
          </div>
          {/* Derived from guest.callStatus across all guests with a phone. */}
          <div className="progress" role="img" aria-label={`${done} done, ${retrying} retrying, ${notYet} not called yet`}>
            <div className="progress__done" style={{ width: pct(done) }} />
            <div className="progress__retry" style={{ width: pct(retrying) }} />
          </div>
          <p className="big-sentence">
            <span className="big-num">{done}</span> profiles ready, <span className="big-num">{retrying}</span> didn’t
            pick up and will get a retry, <span className="big-num">{notYet}</span> still to call.
          </p>
          <p className="soft">
            After their call, each guest gets a text with the Arrow app link. Anyone Arrow can’t reach gets a profile built from
            the event info.
          </p>

          <hr className="hand-rule" style={{ margin: 'var(--s4) 0' }} />

          <h2>Your setup</h2>
          <ul className="summary">
            <li>
              <span className="soft">Event</span>
              <span>
                {event.name} · {event.kind === 'networking' ? 'Networking' : 'Social'} · {guests.length} guests
              </span>
            </li>
            <li>
              <span className="soft">Matching</span>
              <span>
                Wait for top {event.matching.topN} until {graceEndsAt(event.startsAt, event.matching.graceMinutes)}{' '}
                <ButtonLink to={`/events/${eventId}/setup/import`} variant="quiet">
                  Edit
                </ButtonLink>
              </span>
            </li>
            <li>
              <span className="soft">Call plan</span>
              <span>
                {plan.questions.length} questions{plan.signedOff ? ', signed off' : ''}{' '}
                <ButtonLink to={`/events/${eventId}/setup/questions`} variant="quiet">
                  View
                </ButtonLink>
              </span>
            </li>
          </ul>
        </section>

        <aside className="two-col__side">
          <section className="sheet sheet--ink" aria-labelledby="checkin-title" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s4)' }}>
            <h2 id="checkin-title">Check-in at the door</h2>
            <p style={{ color: '#d8cfc0' }}>
              Guests scan this in the Arrow app when they arrive. Their matches unlock only after they check in.
            </p>
            {/* MOCK: render a real QR of the check-in deep link here. */}
            <div className="qr" role="img" aria-label="Check-in QR code (placeholder)" data-field="event.checkInUrl">
              [QR code]
            </div>
            <div style={{ display: 'flex', gap: 'var(--s2)', flexWrap: 'wrap' }}>
              <Button variant="primary" style={{ flex: '1 1 120px' }} onClick={() => window.print()}>
                Print sign
              </Button>
              <Button
                variant="outline"
                style={{ flex: '1 1 120px', color: 'var(--paper)', boxShadow: 'inset 0 0 0 1.5px var(--paper)' }}
                onClick={() => alert('MOCK: full-screen QR for a tablet at the door')}
              >
                Show full screen
              </Button>
            </div>
          </section>
        </aside>
      </div>

      <div className="footer-bar">
        <span className="soft">Calls keep running in the background.</span>
        <Button
          size="lg"
          onClick={() => {
            goToStep(eventId, 'live');
            navigate(`/events/${eventId}/live`);
          }}
        >
          Go to event dashboard <ArrowRight />
        </Button>
      </div>
    </>
  );
}
