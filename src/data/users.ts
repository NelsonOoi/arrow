import { useRoster } from '@/store/roster';
import { matchPalette } from '@/theme';
import type { User } from '@/types';

// The roster is loaded once before any route that calls these renders (see the root layout),
// so plain reads of the store are safe in render and in selectors.

export function getUserById(id: string | null | undefined): User | undefined {
  return id ? useRoster.getState().byId.get(id) : undefined;
}

export function getUserByToken(token: string): User | undefined {
  return useRoster.getState().byToken.get(token.toUpperCase());
}

export function sharedInterests(a: User, b: User): string[] {
  return a.interests.filter((i) => b.interests.includes(i));
}

export function firstName(user: User): string {
  return user.name.split(' ')[0];
}

export function initials(user: User): string {
  return user.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Pairs come from the matchmaker at runtime, so both phones hash the pair's ids to agree on a
// color without coordinating.
export function matchColor(a: User, b: User): string {
  const key = pairKey(a.id, b.id);
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return matchPalette[hash % matchPalette.length];
}
