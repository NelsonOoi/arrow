/**
 * SCREEN: Events overview (the landing page)
 * Route: /events
 *
 * Purpose: the host's home. Lists every event they run and is where a new event
 * starts: "Import event" opens a single Partiful link field.
 *
 * Reads:  store.events, store.getGuests(id) (for the live event's counts)
 * Writes: store.importEvent(partifulUrl) -> navigates to setup step 1
 * MOCK:   import doesn't call Partiful; it clones the seeded setup event.
 *
 * Each row links to where that event needs the host next:
 *   setup -> its current setup step · live -> live dashboard · ended -> recap (stub)
 */
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { ArrowRight, Button, ButtonLink, StatusTag, TextField } from '../components/ui';
import { seedContactsSwapped } from '../mock/data';
import { dayOfMonth, monthShort, timeShort } from '../format';
import { useStore } from '../store';
import type { ArrowEvent } from '../types';

const STEP_NUMBER = { import: 1, questions: 2, finish: 3 } as const;

export function EventsOverview() {
  const { events, getGuests, importEvent } = useStore();
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);
  const [url, setUrl] = useState('');
  const urlLooksRight = /^https?:\/\/(www\.)?partiful\.com\/e\/\S+/.test(url.trim());

  const onImport = (e: FormEvent) => {
    e.preventDefault();
    if (!urlLooksRight) return;
    const id = importEvent(url.trim());
    navigate(`/events/${id}/setup/import`);
  };

  const counts = {
    live: events.filter((e) => e.phase.kind === 'live').length,
    setup: events.filter((e) => e.phase.kind === 'setup').length,
    ended: events.filter((e) => e.phase.kind === 'ended').length,
  };

  return (
    <>
      <header className="page-head">
        <div className="page-head__text">
          <h1>
            Your <em>events</em>
          </h1>
          <p className="page-head__lede">
            {counts.live} live · {counts.setup} setting up · {counts.ended} past
          </p>
        </div>
        {/* Opens the import panel below. The only way to create an event. */}
        <Button variant="primary" aria-expanded={importOpen} aria-controls="import-panel" onClick={() => setImportOpen((o) => !o)}>
          {importOpen ? 'Close' : '+ Import event'}
        </Button>
      </header>

      {importOpen && (
        <form id="import-panel" className="import-panel sheet" onSubmit={onImport}>
          <h2>Import from Partiful</h2>
          <div className="import-row">
            {/* event.partifulUrl — the public Partiful event link. Arrow pulls name, time, venue,
                description and guest list from it. Must look like https://partiful.com/e/<id>. */}
            <div style={{ flex: '1 1 320px' }}>
              <TextField
                label="Partiful event link"
                hideLabel
                mono
                type="url"
                placeholder="https://partiful.com/e/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                dataField="event.partifulUrl"
                autoFocus
              />
            </div>
            <Button variant="ink" size="lg" type="submit" disabled={!urlLooksRight}>
              Import <ArrowRight />
            </Button>
          </div>
          <p className="small soft">
            Arrow reads the description and guest list, then walks you through three quick setup steps.
          </p>
        </form>
      )}

      {events.length === 0 ? (
        <p className="empty">No events yet. Import one from Partiful to get started.</p>
      ) : (
        <ul className="ledger">
          {events.map((ev) => (
            <EventRow key={ev.id} event={ev} checkedIn={getGuests(ev.id).filter((g) => g.liveState !== 'not-checked-in').length} guestCount={getGuests(ev.id).length} />
          ))}
        </ul>
      )}
    </>
  );
}

function EventRow({ event, checkedIn, guestCount }: { event: ArrowEvent; checkedIn: number; guestCount: number }) {
  const { phase } = event;
  const isLive = phase.kind === 'live';
  return (
    <li className={`ledger__row ${isLive ? 'ledger__row--live' : ''}`} data-event-id={event.id}>
      <div className="ledger__date" aria-hidden="true">
        <span className="ledger__day">{dayOfMonth(event.startsAt)}</span>
        <span className="ledger__month">{monthShort(event.startsAt)}</span>
      </div>
      <div className="ledger__main">
        {phase.kind === 'live' && (
          <StatusTag tone="pen" live>
            Live now
          </StatusTag>
        )}
        {phase.kind === 'setup' && <StatusTag tone="ochre">Setting up · step {STEP_NUMBER[phase.step]} of 3</StatusTag>}
        {phase.kind === 'ended' && <StatusTag tone="ink">Ended</StatusTag>}
        <span className="ledger__name">{event.name}</span>
        <span className="soft">
          {timeShort(event.startsAt)} · {event.venue}
          {guestCount > 0 && ` · ${guestCount} guests`}
          {isLive && (
            <>
              {' '}
              · <b style={{ color: 'var(--ink)' }}>{checkedIn}</b> here, <b style={{ color: 'var(--ink)' }}>{seedContactsSwapped}</b> contacts swapped
            </>
          )}
        </span>
      </div>
      <div className="ledger__action">
        {phase.kind === 'live' && (
          <ButtonLink to={`/events/${event.id}/live`} variant="ink">
            Open dashboard <ArrowRight />
          </ButtonLink>
        )}
        {phase.kind === 'setup' && (
          <ButtonLink to={`/events/${event.id}/setup/${phase.step}`} variant="outline">
            Continue setup
          </ButtonLink>
        )}
        {/* Recap screen not built yet. */}
        {phase.kind === 'ended' && (
          <Button variant="quiet" disabled>
            Recap coming soon
          </Button>
        )}
      </div>
    </li>
  );
}
