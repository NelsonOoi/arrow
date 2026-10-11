/**
 * SCREEN: Event dashboard
 * Route: /events/:eventId
 *
 * Purpose: the host's home for one event once setup is finished — before the
 * event (calls and texts going out) and during it (check-ins, matches).
 *
 * Sections, top to bottom:
 *   Metrics     Before the event: calls made, texts sent (+ joined the app).
 *               During the event: checked in, matches made, contacts swapped.
 *               Calls/texts are derived from guest statuses; during-event
 *               numbers are MOCK hardcoded (mock/data.ts duringEventMetrics).
 *   Text blast  Texts every guest with a phone who hasn't joined yet a link
 *               that opens (or installs) the Arrow app straight into this event.
 *               Two-step send: "Send text blast" -> "Send to N guests?".
 *   Check-in    QR code for the door. Matches unlock only after a guest scans it.
 *   Guests      Every guest with call status, text status and check-in.
 *
 * Reads:  store.getEvent, store.getGuests, store.getBlasts, duringEventMetrics
 * Writes: store.sendTextBlast(eventId, message)
 * MOCK:   QR is a placeholder; join links are generated server-side per guest.
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { Scribble } from '../components/HandMarks';
import { Button, StatusTag, TextArea, type Tone } from '../components/ui';
import { dateLong, timeShort } from '../format';
import { defaultBlastMessage, duringEventMetrics } from '../mock/data';
import { useStore } from '../store';
import type { CallStatus, Guest, TextStatus } from '../types';
import { NotFound } from './NotFound';

const CALL_LABEL: Record<CallStatus, [string, Tone]> = {
  'not-called': ['Not called yet', 'ink'],
  'in-progress': ['On a call now', 'indigo'],
  done: ['Called', 'moss'],
  'no-answer-retrying': ['No answer · retrying', 'ochre'],
  unreachable: ['Unreachable · used event info', 'pen'],
  'no-phone': ['No phone · used event info', 'ink'],
};

const TEXT_LABEL: Record<TextStatus, [string, Tone]> = {
  'not-sent': ['Not sent', 'ink'],
  sent: ['Sent', 'indigo'],
  joined: ['Joined the app', 'moss'],
};

type Filter = 'all' | 'attention' | 'checked-in';

/** Example join link shown in the preview. MOCK: real links are per guest. */
const SAMPLE_LINK = 'arrow.app/j/7KQ2';

export function EventDashboard() {
  const { eventId = '' } = useParams();
  const { getEvent, getGuests, getBlasts, sendTextBlast } = useStore();
  const event = getEvent(eventId);
  const [message, setMessage] = useState(() => (event ? defaultBlastMessage(event) : ''));
  const [confirming, setConfirming] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  if (!event) return <NotFound what="event" />;

  const guests = getGuests(eventId);
  const blasts = getBlasts(eventId);
  const during = duringEventMetrics(eventId);

  const withPhone = guests.filter((g) => g.phoneLast4);
  const callsMade = withPhone.filter((g) => ['done', 'unreachable', 'no-answer-retrying'].includes(g.callStatus)).length;
  const onCall = guests.filter((g) => g.callStatus === 'in-progress').length;
  const textsSent = blasts.reduce((n, b) => n + b.recipients, 0);
  const joined = guests.filter((g) => g.textStatus === 'joined').length;
  const blastTargets = withPhone.filter((g) => g.textStatus !== 'joined').length;
  const lastBlast = blasts[blasts.length - 1];

  const needsAttention = (g: Guest) =>
    g.callStatus === 'unreachable' || g.callStatus === 'no-answer-retrying' || (g.phoneLast4 !== null && g.textStatus !== 'joined');
  const shown = filter === 'all' ? guests : filter === 'attention' ? guests.filter(needsAttention) : guests.filter((g) => g.checkedIn);

  const firstName = withPhone[0]?.name.split(' ')[0] ?? 'Ava';
  const preview = message.replaceAll('{first}', firstName);

  return (
    <>
      <Link to="/events" className="back-link">
        ← All events
      </Link>

      <header className="page-head" style={{ marginBottom: 'var(--s5)' }}>
        <div className="page-head__text">
          {event.phase.kind === 'live' && (
            <StatusTag tone="pen" live>
              Live now
            </StatusTag>
          )}
          {event.phase.kind === 'ready' && <StatusTag tone="moss">Set up · calling guests</StatusTag>}
          {event.phase.kind === 'ended' && <StatusTag tone="ink">Ended</StatusTag>}
          <h1 data-field="event.name">{event.name}</h1>
          <p className="facts">
            <span>{dateLong(event.startsAt)}</span>
            <span>
              {timeShort(event.startsAt)} – {timeShort(event.endsAt)}
            </span>
            <span>{event.venue}</span>
          </p>
        </div>
      </header>

      {/* Metrics */}
      <div className="metrics" aria-label="Event numbers">
        <div className="metrics__group">
          <span className="metrics__title">Before the event</span>
          <div className="metrics__row">
            <span className="metric" data-metric="callsMade">
              <b>{callsMade}</b>
              <small>of {withPhone.length} calls made</small>
            </span>
            <span className="metric" data-metric="textsSent">
              <b>{textsSent}</b>
              <small>texts sent</small>
            </span>
            <span className="metric" data-metric="joinedApp">
              <b>{joined}</b>
              <small>joined the app</small>
            </span>
          </div>
          {onCall > 0 && <StatusTag tone="indigo" live>{onCall} on a call right now</StatusTag>}
        </div>
        <div className="metrics__group">
          <span className="metrics__title">During the event</span>
          {during ? (
            <div className="metrics__row">
              <span className="metric" data-metric="checkedIn">
                <b>{during.checkedIn}</b>
                <small>checked in</small>
              </span>
              <span className="metric" data-metric="matchesMade">
                <b>{during.matchesMade}</b>
                <small>matches made</small>
              </span>
              <span className="metric" data-metric="contactsSwapped">
                <b>{during.contactsSwapped}</b>
                <small>contacts swapped</small>
              </span>
            </div>
          ) : (
            <p className="soft">
              Starts {dateLong(event.startsAt)} at {timeShort(event.startsAt)}. Check-ins and matches show up here.
            </p>
          )}
        </div>
      </div>

      <div className="two-col">
        {/* Text blast */}
        <section className="two-col__main" aria-labelledby="blast-title">
          <div className="section-title">
            <h2 id="blast-title">Text blast</h2>
            {lastBlast && (
              <span className="small soft">
                Last sent to {lastBlast.recipients} guests · {dateLong(lastBlast.sentAt)}, {timeShort(lastBlast.sentAt)}
              </span>
            )}
          </div>
          <p className="soft">
            Text your guests a link that opens the Arrow app (or helps them install it) and drops them straight into this event.
          </p>
          {/* textBlast.message — the SMS body. {first} = guest's first name, {link} = their personal join link. */}
          <TextArea
            label="Message"
            rows={4}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setConfirming(false);
            }}
            dataField="textBlast.message"
            help={
              <>
                <span className="mono">{'{first}'}</span> becomes each guest’s first name and{' '}
                <span className="mono">{'{link}'}</span> their personal join link.
              </>
            }
          />
          <div className="field">
            <span className="field__label">Preview</span>
            <p className="blast-preview">
              {preview.split('{link}').map((part, i, arr) => (
                <span key={i}>
                  {part}
                  {i < arr.length - 1 && <span className="mono">{SAMPLE_LINK}</span>}
                </span>
              ))}
            </p>
          </div>
          <div className="filter-row">
            {blastTargets === 0 ? (
              <span className="banner-note">✓ Everyone with a phone has joined the app.</span>
            ) : !confirming ? (
              <Button variant="ink" onClick={() => setConfirming(true)} disabled={!message.includes('{link}')}>
                Send text blast
              </Button>
            ) : (
              <>
                {/* Irreversible: sends real SMS once wired up. */}
                <Button
                  variant="primary"
                  onClick={() => {
                    sendTextBlast(eventId, message);
                    setConfirming(false);
                  }}
                >
                  Send to {blastTargets} guests
                </Button>
                <Button variant="quiet" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </>
            )}
            {blastTargets > 0 && (
              <span className="small soft">
                {message.includes('{link}')
                  ? `Goes to the ${blastTargets} guests with a phone who haven’t joined yet.`
                  : 'Add {link} so guests can join.'}
              </span>
            )}
          </div>
        </section>

        {/* Check-in */}
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
            <Button variant="primary" onClick={() => window.print()}>
              Print sign
            </Button>
          </section>
        </aside>
      </div>

      <hr className="hand-rule" />

      {/* Guests */}
      <section aria-labelledby="guests-title">
        <div className="section-title">
          <h2 id="guests-title">Guests</h2>
          <div className="tabs" role="tablist" aria-label="Filter guests">
            {(
              [
                ['all', `All ${guests.length}`],
                ['attention', `Needs attention ${guests.filter(needsAttention).length}`],
                ['checked-in', `Checked in ${guests.filter((g) => g.checkedIn).length}`],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <button key={key} type="button" role="tab" className="tab" aria-selected={filter === key} onClick={() => setFilter(key)}>
                {label}
                {filter === key && <Scribble color="var(--ink)" />}
              </button>
            ))}
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="empty">Nobody here yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Guest</th>
                  <th scope="col">Phone</th>
                  <th scope="col">Call</th>
                  <th scope="col">Text</th>
                  <th scope="col">At the event</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((g) => {
                  const [callLabel, callTone] = CALL_LABEL[g.callStatus];
                  const [textLabel, textTone] = g.phoneLast4 ? TEXT_LABEL[g.textStatus] : (['No phone', 'ink'] as [string, Tone]);
                  return (
                    <tr key={g.id} data-guest-id={g.id}>
                      <td style={{ fontWeight: 500 }}>{g.name}</td>
                      <td className="mono">{g.phoneLast4 ? `•••• ${g.phoneLast4}` : '—'}</td>
                      <td data-field="guest.callStatus">
                        <StatusTag tone={callTone}>{callLabel}</StatusTag>
                      </td>
                      <td data-field="guest.textStatus">
                        <StatusTag tone={textTone}>{textLabel}</StatusTag>
                      </td>
                      <td data-field="guest.checkedIn">
                        {g.checkedIn ? <StatusTag tone="moss">Checked in</StatusTag> : <span className="soft">Not yet</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
