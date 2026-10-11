import { matchPalette } from '@/theme';
import type { User } from '@/types';

export const EVENT_NAME = 'Montreal AI Hackathon';

export const USERS: User[] = [
  {
    id: 'u1',
    token: 'A7K2',
    name: 'Maya Chen',
    role: 'Founder',
    company: 'Loomwise',
    workingOn: 'sensors that track textile waste on factory floors',
    lookingFor: 'a hardware engineer who has shipped a consumer device',
    interests: ['climate tech', 'hardware', 'fundraising'],
    matchIds: ['u2', 'u3'],
  },
  {
    id: 'u2',
    token: 'B3QX',
    name: 'Diego Alvarez',
    role: 'Staff Engineer',
    company: 'Northbeam',
    workingOn: 'low-power BLE firmware for asset trackers',
    lookingFor: 'a hardware startup that needs a firmware lead',
    interests: ['hardware', 'BLE', 'embedded'],
    matchIds: ['u1', 'u4'],
  },
  {
    id: 'u3',
    token: 'C9MD',
    name: 'Priya Natarajan',
    role: 'Partner',
    company: 'Fieldstone Ventures',
    workingOn: 'a seed fund for climate marketplaces',
    lookingFor: 'climate founders raising a pre-seed round this year',
    interests: ['fundraising', 'climate tech', 'marketplaces'],
    matchIds: ['u1', 'u5'],
  },
  {
    id: 'u4',
    token: 'D4LP',
    name: 'Sam Okafor',
    role: 'Product Designer',
    company: 'Tessellate',
    workingOn: 'an accessible design system for tiny embedded displays',
    lookingFor: 'engineers who care about accessibility on small screens',
    interests: ['design systems', 'embedded', 'accessibility'],
    matchIds: ['u2', 'u6'],
  },
  {
    id: 'u5',
    token: 'E8RT',
    name: 'Hannah Weiss',
    role: 'Head of Growth',
    company: 'Parcelly',
    workingOn: 'referral loops for a last-mile delivery marketplace',
    lookingFor: 'analytics people who have scaled a two-sided marketplace',
    interests: ['marketplaces', 'growth', 'analytics'],
    matchIds: ['u3', 'u6'],
  },
  {
    id: 'u6',
    token: 'F2VN',
    name: 'Kenji Mori',
    role: 'ML Researcher',
    company: 'Quanta Labs',
    workingOn: 'on-device models that describe screens for blind users',
    lookingFor: 'designers who want to test accessibility features with real users',
    interests: ['analytics', 'accessibility', 'on-device ML'],
    matchIds: ['u4', 'u5'],
  },
];

const byId = new Map(USERS.map((u) => [u.id, u]));
const byToken = new Map(USERS.map((u) => [u.token, u]));

export function getUserById(id: string | null | undefined): User | undefined {
  return id ? byId.get(id) : undefined;
}

export function getUserByToken(token: string): User | undefined {
  return byToken.get(token);
}

export function getMatches(user: User): User[] {
  return user.matchIds.map((id) => byId.get(id)).filter((u): u is User => !!u);
}

export function sharedInterests(a: User, b: User): string[] {
  return a.interests.filter((i) => b.interests.includes(i));
}

export function isMutual(a: User, b: User): boolean {
  return a.matchIds.includes(b.id) && b.matchIds.includes(a.id);
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

// Both phones derive this from the same static list, so a pair always agrees on its color.
// Colors are assigned greedily so nobody has two matches sharing one.
const pairColors = new Map<string, string>();
{
  const usedBy = new Map<string, Set<string>>(USERS.map((u) => [u.id, new Set()]));
  for (const user of USERS) {
    for (const otherId of user.matchIds) {
      const key = pairKey(user.id, otherId);
      if (pairColors.has(key)) continue;
      const mine = usedBy.get(user.id)!;
      const theirs = usedBy.get(otherId) ?? new Set<string>();
      const color =
        matchPalette.find((c) => !mine.has(c) && !theirs.has(c)) ??
        matchPalette[pairColors.size % matchPalette.length];
      pairColors.set(key, color);
      mine.add(color);
      theirs.add(color);
    }
  }
}

export function matchColor(a: User, b: User): string {
  return pairColors.get(pairKey(a.id, b.id)) ?? matchPalette[0];
}
