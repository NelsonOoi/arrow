import { pickEvent, type ApiAttendee, type ApiEvent } from '@/api/client';
import { TOKEN_PATTERN } from '@/ble/constants';
import { getUserById, getUserByToken, matchColor, sharedInterests } from '@/data/users';
import { toUser, useRoster } from '@/store/roster';

function attendee(id: string, token: string, topics: string[]): ApiAttendee {
  return {
    id,
    external_ref: null,
    display_name: `Person ${id}`,
    side: 'A',
    side_label: 'mentee',
    offering_text: 'about',
    seeking_text: 'seeking',
    topics,
    goals: [],
    token,
    status: 'registered',
  };
}

function event(id: string, status: ApiEvent['status']): ApiEvent {
  return { id, name: id, status, side_a_label: 'mentee', side_b_label: 'mentor' };
}

describe('roster lookups', () => {
  const a = toUser(attendee('u1', 'a7k2', ['fintech', 'b2b saas']));
  const b = toUser(attendee('u2', 'B3QX', ['b2b saas', 'hiring']));

  beforeAll(() => {
    useRoster.setState({
      status: 'ready',
      users: [a, b],
      byId: new Map([a, b].map((u) => [u.id, u])),
      byToken: new Map([a, b].map((u) => [u.token, u])),
    });
  });

  it('normalizes tokens to the BLE format', () => {
    expect(a.token).toBe('A7K2');
    expect(a.token).toMatch(TOKEN_PATTERN);
  });

  it('gives both sides of a match the same color', () => {
    expect(matchColor(a, b)).toBe(matchColor(b, a));
  });

  it('resolves users by id and token', () => {
    expect(getUserById('u1')).toBe(a);
    expect(getUserByToken('B3QX')).toBe(b);
    expect(getUserByToken('a7k2')).toBe(a);
    expect(getUserById(null)).toBeUndefined();
    expect(getUserByToken('ZZZZ')).toBeUndefined();
  });

  it('finds shared interests', () => {
    expect(sharedInterests(a, b)).toEqual(['b2b saas']);
  });
});

describe('pickEvent', () => {
  const events = [event('new-draft', 'draft'), event('ready', 'ready'), event('live', 'live'), event('old-live', 'live')];

  it('prefers the newest live event, then a ready one', () => {
    expect(pickEvent(events, null)?.id).toBe('live');
    expect(pickEvent(events.filter((e) => e.status !== 'live'), null)?.id).toBe('ready');
    expect(pickEvent([event('d', 'draft')], null)).toBeUndefined();
  });

  it('honours a pinned event id', () => {
    expect(pickEvent(events, 'new-draft')?.id).toBe('new-draft');
    expect(pickEvent(events, 'missing')).toBeUndefined();
  });
});
