import { createTokenCache, hexToToken, parseToken, tokenToHex } from '../token';

describe('parseToken', () => {
  it('accepts a valid local name', () => {
    expect(parseToken('ARA7K2')).toBe('A7K2');
  });

  it('normalizes case and whitespace', () => {
    expect(parseToken('ara7k2')).toBe('A7K2');
    expect(parseToken(' ARa7K2 ')).toBe('A7K2');
  });

  it.each([
    [''],
    [null],
    [undefined],
    ['AR'],
    ['ARA7K'],
    ['ARA7K22'],
    ['XXA7K2'],
    ["Nelson's iPhone"],
    ['AR-7K2'],
    ['   '],
  ])('rejects %p', (name) => {
    expect(parseToken(name)).toBeNull();
  });
});

describe('tokenToHex / hexToToken', () => {
  it('encodes ASCII as lowercase hex', () => {
    expect(tokenToHex('A7K2')).toBe('41374b32');
  });

  it('round-trips tokens', () => {
    for (const token of ['A7K2', '0000', 'ZZZZ', 'Q9X1']) {
      expect(hexToToken(tokenToHex(token))).toBe(token);
    }
  });

  it('accepts uppercase hex and a 0x prefix', () => {
    expect(hexToToken('41374B32')).toBe('A7K2');
    expect(hexToToken('0x41374b32')).toBe('A7K2');
  });

  it('uppercases lowercase token bytes', () => {
    expect(hexToToken(tokenToHex('a7k2'))).toBe('A7K2');
    expect(hexToToken('61376b32')).toBe('A7K2');
  });

  it.each([
    [''],
    ['zz374b32'],
    ['41374b3'],
    ['41374b'],
    ['41374b3241'],
    ['412d4b32'],
    ['00000000'],
  ])('rejects %p', (hex) => {
    expect(hexToToken(hex)).toBeNull();
  });
});

describe('createTokenCache', () => {
  const TTL = 1_000;

  it('returns a token set within the TTL', () => {
    const cache = createTokenCache(TTL);
    cache.set('dev-1', 'A7K2', 10_000);
    expect(cache.get('dev-1', 10_000)).toBe('A7K2');
    expect(cache.get('dev-1', 10_999)).toBe('A7K2');
  });

  it('misses for unknown devices', () => {
    const cache = createTokenCache(TTL);
    expect(cache.get('nope', 0)).toBeNull();
  });

  it('expires entries after the TTL and drops them', () => {
    const cache = createTokenCache(TTL);
    cache.set('dev-1', 'A7K2', 10_000);
    expect(cache.get('dev-1', 11_000)).toBeNull();
    expect(cache.get('dev-1', 10_500)).toBeNull();
  });

  it('refreshes the timestamp on set', () => {
    const cache = createTokenCache(TTL);
    cache.set('dev-1', 'A7K2', 10_000);
    cache.set('dev-1', 'B8L3', 10_800);
    expect(cache.get('dev-1', 11_500)).toBe('B8L3');
  });

  it('clear() empties the cache', () => {
    const cache = createTokenCache(TTL);
    cache.set('dev-1', 'A7K2', 0);
    cache.set('dev-2', 'B8L3', 0);
    cache.clear();
    expect(cache.get('dev-1', 1)).toBeNull();
    expect(cache.get('dev-2', 1)).toBeNull();
  });
});
