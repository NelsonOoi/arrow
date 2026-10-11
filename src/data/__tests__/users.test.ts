import { TOKEN_PATTERN } from '@/ble/constants';
import { getMatches, getUserById, getUserByToken, matchColor, matchKeyword, USERS } from '@/data/users';

describe('USERS', () => {
  it('has unique ids', () => {
    const ids = USERS.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique 4-character A-Z/0-9 tokens', () => {
    const tokens = USERS.map((u) => u.token);
    expect(new Set(tokens).size).toBe(tokens.length);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Z0-9]{4}$/);
      expect(token).toMatch(TOKEN_PATTERN);
    }
  });

  it('only lists existing users as matches, never self', () => {
    for (const user of USERS) {
      for (const id of user.matchIds) {
        expect(getUserById(id)).toBeDefined();
        expect(id).not.toBe(user.id);
      }
      expect(getMatches(user)).toHaveLength(user.matchIds.length);
    }
  });

  it('has symmetric matches', () => {
    for (const user of USERS) {
      for (const id of user.matchIds) {
        expect({ pair: [user.id, id], symmetric: getUserById(id)!.matchIds.includes(user.id) }).toEqual({
          pair: [user.id, id],
          symmetric: true,
        });
      }
    }
  });

  it('gives both sides of a match the same color, unique among each person’s matches', () => {
    for (const user of USERS) {
      const matches = getMatches(user);
      for (const match of matches) {
        expect(matchColor(user, match)).toBe(matchColor(match, user));
      }
      const colors = matches.map((m) => matchColor(user, m));
      expect(new Set(colors).size).toBe(colors.length);
    }
  });

  it('gives both sides of a match the same keyword, unique among each person’s matches', () => {
    for (const user of USERS) {
      const matches = getMatches(user);
      for (const match of matches) {
        expect(matchKeyword(user, match)).toBe(matchKeyword(match, user));
      }
      const words = matches.map((m) => matchKeyword(user, m));
      expect(new Set(words).size).toBe(words.length);
    }
  });

  it('resolves users by id and token', () => {
    for (const user of USERS) {
      expect(getUserById(user.id)).toBe(user);
      expect(getUserByToken(user.token)).toBe(user);
    }
    expect(getUserById(null)).toBeUndefined();
    expect(getUserByToken('ZZZZ')).toBeUndefined();
  });
});
