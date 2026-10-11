import { matchPalette } from '@/theme';
import type { MatchOutcome, User } from '@/types';

/** The six demo people you can pick on the "Who are you?" screen. */
const DEMO_USERS: User[] = [
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
    contact: { phone: '+1 514 555 0142', email: 'maya@loomwise.example', linkedin: 'linkedin.com/in/mayachen', twitter: 'mayabuilds' },
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
    contact: { phone: '+1 514 555 0178', email: 'diego@northbeam.example', linkedin: 'linkedin.com/in/diegoalvarez', twitter: 'diegofirmware' },
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
    contact: { email: 'priya@fieldstone.example', linkedin: 'linkedin.com/in/priyanatarajan', twitter: 'priyainvests' },
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
    contact: { phone: '+1 438 555 0109', email: 'sam@tessellate.example' },
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
    contact: { phone: '+1 438 555 0133', email: 'hannah@parcelly.example', linkedin: 'linkedin.com/in/hannahweiss' },
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
    contact: { email: 'kenji@quanta.example', linkedin: 'linkedin.com/in/kenjimori', twitter: 'kenjiml' },
  },
];

/**
 * MOCK: extra attendees matched with every demo person, so the find -> decide flow can be
 * replayed several times per person. Names and companies are fictional.
 */
const TEST_ATTENDEES: User[] = [
  {
    id: 't1',
    token: 'T1AX',
    name: 'Sun Ha',
    role: 'Frontend Engineer',
    company: 'Shopify',
    workingOn: 'voice agents that answer phones for barbershops',
    lookingFor: 'a team building a voice or agent product that needs a frontend engineer',
    interests: ['voice AI', 'design systems', 'React animation'],
    matchIds: [],
    contact: { phone: '+1 514 555 0190', email: 'sun@example.com', linkedin: 'linkedin.com/in/sunha', twitter: 'sunha_dev' },
  },
  {
    id: 't2',
    token: 'T2BQ',
    name: 'Léa Fortin',
    role: 'Research Scientist',
    company: 'Northwind AI',
    workingOn: 'small language models that run on a phone',
    lookingFor: 'product people who want to ship on-device AI',
    interests: ['on-device ML', 'privacy', 'robotics'],
    matchIds: [],
    contact: { email: 'lea@northwind.example', linkedin: 'linkedin.com/in/leafortin' },
  },
  {
    id: 't3',
    token: 'T3CR',
    name: 'Omar Haddad',
    role: 'Founder',
    company: 'Shelfwise',
    workingOn: 'computer vision that counts inventory on grocery shelves',
    lookingFor: 'a technical cofounder with retail experience',
    interests: ['computer vision', 'retail', 'fundraising'],
    matchIds: [],
    contact: { phone: '+1 438 555 0161', email: 'omar@shelfwise.example' },
  },
  {
    id: 't4',
    token: 'T4DS',
    name: 'Grace Lin',
    role: 'Product Manager',
    company: 'Clearpath Health',
    workingOn: 'an AI scribe for family doctors',
    lookingFor: 'engineers who have worked with health data',
    interests: ['health tech', 'LLMs', 'accessibility'],
    matchIds: [],
    contact: { phone: '+1 514 555 0127', email: 'grace@clearpath.example', linkedin: 'linkedin.com/in/gracelin' },
  },
  {
    id: 't5',
    token: 'T5EV',
    name: 'Marcus Bell',
    role: 'Angel Investor',
    company: 'Independent',
    workingOn: 'a small fund for first-time AI founders in Montréal',
    lookingFor: 'founders raising their first round',
    interests: ['fundraising', 'marketplaces', 'climate tech'],
    matchIds: [],
    contact: { email: 'marcus@example.com', linkedin: 'linkedin.com/in/marcusbell' },
  },
  {
    id: 't6',
    token: 'T6FW',
    name: 'Aiko Tanaka',
    role: 'Design Engineer',
    company: 'Lumen Studio',
    workingOn: 'interfaces for talking to agents by voice',
    lookingFor: 'teams who need help making their agent feel human',
    interests: ['voice AI', 'design systems', 'prototyping'],
    matchIds: [],
    contact: { phone: '+1 438 555 0184', email: 'aiko@lumen.example', twitter: 'aikodesigns' },
  },
];

const demoIds = DEMO_USERS.map((u) => u.id);
const testIds = TEST_ATTENDEES.map((u) => u.id);

/** Everyone at the event. Demo people come first, then the test attendees, in match order. */
export const USERS: User[] = [
  ...DEMO_USERS.map((u) => ({ ...u, matchIds: [...u.matchIds, ...testIds] })),
  ...TEST_ATTENDEES.map((u) => ({ ...u, matchIds: demoIds })),
];

/** Only demo people are offered on the "Who are you?" screen. */
export const DEMO_PEOPLE: User[] = USERS.filter((u) => demoIds.includes(u.id));

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

/** Matches still on my list: everyone I haven't decided on yet. */
export function activeMatches(user: User, outcomes: Record<string, MatchOutcome>): User[] {
  return getMatches(user).filter((m) => {
    const outcome = outcomes[m.id];
    return outcome === undefined || outcome === 'found';
  });
}

/**
 * MOCK: whether `other` also chose to swap contacts with `me`. The backend will hold both
 * answers; until then mutual matches always say yes and one-way matches say no.
 */
export function otherWantsToSwap(me: User, other: User): boolean {
  return isMutual(me, other);
}

/** People I've swapped contacts with: we both said yes. */
export function swappedContacts(user: User, outcomes: Record<string, MatchOutcome>): User[] {
  return getMatches(user).filter(
    (m) => outcomes[m.id] === 'interested' && otherWantsToSwap(user, m),
  );
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

/** Short, easy to say out loud across a room. Same style as the host app's pair keywords. */
const KEYWORDS = [
  'LANTERN', 'COMET', 'ORBIT', 'HARBOR', 'FERN', 'MAPLE', 'TIDE', 'QUILL',
  'VELVET', 'EMBER', 'CEDAR', 'PRISM', 'BIRCH', 'CORAL', 'DUNE', 'FABLE',
];

// Like colors, every pair gets a keyword from the shared list, so both phones agree, and nobody
// has two matches with the same word. MOCK: the backend will assign keywords when it makes a pair.
const pairKeywords = new Map<string, string>();
{
  const usedBy = new Map<string, Set<string>>(USERS.map((u) => [u.id, new Set()]));
  for (const user of USERS) {
    for (const otherId of user.matchIds) {
      const key = pairKey(user.id, otherId);
      if (pairKeywords.has(key)) continue;
      const mine = usedBy.get(user.id)!;
      const theirs = usedBy.get(otherId) ?? new Set<string>();
      const word =
        KEYWORDS.find((w) => !mine.has(w) && !theirs.has(w)) ??
        KEYWORDS[pairKeywords.size % KEYWORDS.length];
      pairKeywords.set(key, word);
      mine.add(word);
      theirs.add(word);
    }
  }
}

/** The pair's passcode word. Together with `matchColor`, it's how two matched people confirm each other. */
export function matchKeyword(a: User, b: User): string {
  return pairKeywords.get(pairKey(a.id, b.id)) ?? KEYWORDS[0];
}
