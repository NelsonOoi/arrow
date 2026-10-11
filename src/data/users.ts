import type { User } from '@/types';

export const USERS: User[] = [
  {
    id: 'u1',
    token: 'A7K2',
    name: 'Maya Chen',
    role: 'Founder',
    company: 'Loomwise',
    interests: ['climate tech', 'hardware', 'fundraising'],
    matchIds: ['u2', 'u3'],
  },
  {
    id: 'u2',
    token: 'B3QX',
    name: 'Diego Alvarez',
    role: 'Staff Engineer',
    company: 'Northbeam',
    interests: ['hardware', 'BLE', 'embedded'],
    matchIds: ['u1', 'u4'],
  },
  {
    id: 'u3',
    token: 'C9MD',
    name: 'Priya Natarajan',
    role: 'Partner',
    company: 'Fieldstone Ventures',
    interests: ['fundraising', 'climate tech', 'marketplaces'],
    matchIds: ['u1', 'u5'],
  },
  {
    id: 'u4',
    token: 'D4LP',
    name: 'Sam Okafor',
    role: 'Product Designer',
    company: 'Tessellate',
    interests: ['design systems', 'embedded', 'accessibility'],
    matchIds: ['u2', 'u6'],
  },
  {
    id: 'u5',
    token: 'E8RT',
    name: 'Hannah Weiss',
    role: 'Head of Growth',
    company: 'Parcelly',
    interests: ['marketplaces', 'growth', 'analytics'],
    matchIds: ['u3', 'u6'],
  },
  {
    id: 'u6',
    token: 'F2VN',
    name: 'Kenji Mori',
    role: 'ML Researcher',
    company: 'Quanta Labs',
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
