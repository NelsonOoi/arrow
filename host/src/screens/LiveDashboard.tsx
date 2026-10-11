/**
 * SCREEN: Live event dashboard
 * Route: /events/:eventId/live
 *
 * Purpose: what the host watches during the event. Read-mostly; the only
 * control is pausing matching.
 *
 * Sections:
 *   Tally         — guests by live state (checked in / talking / guided / looking / roaming)
 *                   plus contacts swapped. Derived from guest.liveState.
 *   Active pairs  — every current one-to-one pair with its passcode (color + keyword)
 *                   and status. A pair in "still-looking-check" is highlighted: both
 *                   guests were asked "still looking?" and have `secondsLeft` to answer
 *                   before the pair is cancelled.
 *   Looking queue — guests who asked for a match but nobody suitable is free yet.
 *   Activity      — recent events, newest first.
 *   Guests        — full table, filterable by here / not here.
 *
 * Reads:  store.getEvent, store.getGuests; pairs/activity from mock
 * Writes: matching paused flag (local only)
 * MOCK:   pairs, activity and the "now" time are static. Replace with a realtime
 *         subscription (e.g. Supabase channel on pairs + guests for this event).
 */
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { LooseCircle, Scribble } from '../components/HandMarks';
import { Button, PairMark, StatusTag, type Tone } from '../components/ui';
import { graceEndsAt } from '../format';
import { seedActivity, seedContactsSwapped, seedPairs } from '../mock/data';
import { useStore } from '../store';
import type { Guest, GuestLiveState, Pair } from '../types';
import { NotFound } from './NotFound';

const STATE_LABEL: Record<GuestLiveState, [string, Tone]> = {
  'not-checked-in': ['Not here yet', 'ink'],
  'waiting-for-top': ['Waiting for top match', 'ochre'],
  looking: ['Looking', 'ochre'],
  guided: ['On the way to a match', 'indigo'],
  'in-match': ['Talking', 'moss'],
  deciding: ['Deciding', 'indigo'],
  roaming: ['Roaming', 'ink'],
};

type Filter = 'all' | 'here' | 'away';

export function LiveDashboard() {
  const { eventId = '' } = useParams();
  const { getEvent, getGuests } = useStore();
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const event = getEvent(eventId);
  if (!event) return <NotFound what="event" />;

  const guests = getGuests(eventId);
  const nameOf = (id: string) => guests.find((g) => g.id === id)?.name ?? id;
  const count = (s: GuestLiveState) => guests.filter((g) => g.liveState === s).length;
  const here = guests.filter((g) => g.liveState !== 'not-checked-in');
  const looking = guests.filter((g) => g.liveState === 'looking');
  const pairs = eventId === 'evt-live' ? seedPairs : [];
  const alerts = pairs.filter((p) => p.status === 'still-looking-check').length;
  const shown = filter === 'all' ? guests : filter === 'here' ? here : guests.filter((g) => g.liveState === 'not-checked-in');

  return (
    <>
      <Link to="/events" className="back-link">
        ← All events
      </Link>
      <header className="page-head" style={{ marginBottom: 'var(--s3)' }}>
        <div className="page-head__text">
          <StatusTag tone="pen" live>
            {paused ? 'Live · matching paused' : 'Live · 7:22 PM'}
          </StatusTag>
          <h1 data-field="event.name">{event.name}</h1>
          <p className="banner-note">
            Top-{event.matching.topN} wait ended at {graceEndsAt(event.startsAt, event.matching.graceMinutes)}. Everyone now
            gets the best person who’s here.
          </p>
        </div>
        {/* Pausing stops new pairs from being made; existing pairs continue. MOCK: local only. */}
        <Button variant={paused ? 'primary' : 'outline'} onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? 'Resume matching' : 'Pause matching'}
        </Button>
      </header>

      {/* Tally — counts derived from guest.liveState */}
      <div className="tally" aria-label="Tonight so far">
        <span className="tally__item tally__item--lead">
          <b>{here.length}</b> of {guests.length} here
        </span>
        <span className="tally__item">
          <b>{count('in-match')}</b> talking
        </span>
        <span className="tally__item">
          <b>{count('guided')}</b> on the way
        </span>
        <span className="tally__item">
          <b>{count('looking')}</b> looking
        </span>
        <span className="tally__item">
          <b>{count('roaming')}</b> roaming
        </span>
        <span className="tally__item">
          <span className="tally__circle">
            <b>{seedContactsSwapped}</b>
            <LooseCircle />
          </span>{' '}
          contacts swapped
        </span>
      </div>

      <div className="two-col">
        <section className="two-col__main" aria-labelledby="pairs-title">
          <div className="section-title">
            <h2 id="pairs-title">Active pairs</h2>
            <span className="small soft">
              {pairs.length} pairs{alerts > 0 && <> · <b style={{ color: 'var(--pen-deep)' }}>{alerts} need a check</b></>}
            </span>
          </div>
          {pairs.length === 0 ? (
            <p className="empty">No pairs yet. They appear as guests check in.</p>
          ) : (
            <ul className="pairs">
              {pairs.map((p) => (
                <PairRow key={p.id} pair={p} names={[nameOf(p.guestIds[0]), nameOf(p.guestIds[1])]} />
              ))}
            </ul>
          )}
        </section>

        <aside className="two-col__side">
          <section className="sheet" aria-labelledby="queue-title" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
            <h3 id="queue-title">Looking, nobody free yet</h3>
            {looking.length === 0 ? (
              <p className="soft small">Everyone who wants a match has one.</p>
            ) : (
              <ul className="queue">
                {looking.map((g, i) => (
                  <li key={g.id}>
                    <span style={{ fontWeight: 500 }}>{g.name}</span>
                    <span className="small soft">{['waiting 1 min', 'waiting 40 s', 'just asked'][i] ?? 'waiting'}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="small soft">They get a ping as soon as a good match taps “Find me next one.”</p>
          </section>

          <section className="sheet sheet--alt" aria-labelledby="feed-title" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s3)' }}>
            <h3 id="feed-title">Activity</h3>
            <ul className="feed">
              {seedActivity.map((a) => (
                <li key={a.at + a.text}>
                  <time>{a.at}</time>
                  <span>{a.text}</span>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>

      <hr className="hand-rule" />

      <section aria-labelledby="guests-title">
        <div className="section-title">
          <h2 id="guests-title">Guests</h2>
          <div className="tabs" role="tablist" aria-label="Filter guests">
            {(
              [
                ['all', `All ${guests.length}`],
                ['here', `Here ${here.length}`],
                ['away', `Not here ${guests.length - here.length}`],
              ] as [Filter, string][]
            ).map(([key, label]) => (
              <button key={key} type="button" role="tab" className="tab" aria-selected={filter === key} onClick={() => setFilter(key)}>
                {label}
                {filter === key && <Scribble color="var(--ink)" />}
              </button>
            ))}
          </div>
        </div>
        <GuestTable guests={shown} />
      </section>
    </>
  );
}

function PairRow({ pair, names }: { pair: Pair; names: [string, string] }) {
  const isAlert = pair.status === 'still-looking-check';
  return (
    <li className={`pair ${isAlert ? 'pair--alert' : ''}`} data-pair-id={pair.id}>
      <PairMark color={pair.color} keyword={pair.keyword} />
      <span className="pair__names">
        {names[0]} <span className="soft">&</span> {names[1]}
      </span>
      {pair.status === 'talking' && <StatusTag tone="moss">Talking · {pair.minutes} min</StatusTag>}
      {pair.status === 'guided' && <StatusTag tone="indigo">On the way · ~{pair.distanceM} m apart</StatusTag>}
      {isAlert && <StatusTag tone="pen">Asked “still looking?” · {pair.secondsLeft}s left</StatusTag>}
    </li>
  );
}

/** Full guest list. "Profile" shows where the matching profile came from (guest.intake). */
function GuestTable({ guests }: { guests: Guest[] }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Guest</th>
            <th scope="col">Profile from</th>
            <th scope="col">Looking for</th>
            <th scope="col">Right now</th>
            <th scope="col">Met</th>
          </tr>
        </thead>
        <tbody>
          {guests.map((g) => {
            const [label, tone] = STATE_LABEL[g.liveState];
            return (
              <tr key={g.id} data-guest-id={g.id}>
                <td style={{ fontWeight: 500 }}>{g.name}</td>
                <td>{g.intake === 'call' ? 'Call' : <span className="soft">Event info</span>}</td>
                <td className={g.goal ? undefined : 'soft'}>{g.goal ?? '—'}</td>
                <td>
                  <StatusTag tone={tone}>{label}</StatusTag>
                </td>
                <td>{g.liveState === 'not-checked-in' ? <span className="soft">—</span> : g.metCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
