import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { sharedCached, invalidateShared } from '../../src/utils/sharedCache.js';
import { verifySessionToken } from '../../src/auth/session.js';

describe('sharedCached', () => {
  beforeEach(() => { process.env.SHARED_CACHE_MS = '60000'; invalidateShared(); });
  afterAll(() => { delete process.env.SHARED_CACHE_MS; });

  test('builds once, then serves the cached value', async () => {
    const build = jest.fn(async () => 'v');
    expect(await sharedCached('k', build)).toBe('v');
    expect(await sharedCached('k', build)).toBe('v');
    expect(build).toHaveBeenCalledTimes(1);
  });

  test('concurrent misses share one build', async () => {
    let release;
    const build = jest.fn(() => new Promise((r) => { release = r; }));
    const both = Promise.all([sharedCached('k', build), sharedCached('k', build)]);
    release('once');
    expect(await both).toEqual(['once', 'once']);
    expect(build).toHaveBeenCalledTimes(1);
  });

  test('invalidateShared drops entries; a build that started before it is not stored', async () => {
    let release;
    const slow = sharedCached('k', () => new Promise((r) => { release = r; }));
    invalidateShared(); // a write lands while the read is in flight
    release('stale');
    expect(await slow).toBe('stale'); // the in-flight caller still gets its answer…
    expect(await sharedCached('k', async () => 'fresh')).toBe('fresh'); // …but it was never cached
  });

  test('a failed build is not cached', async () => {
    await expect(sharedCached('k', async () => { throw new Error('db down'); })).rejects.toThrow('db down');
    expect(await sharedCached('k', async () => 'ok')).toBe('ok');
  });

  test('TTL 0 disables caching', async () => {
    process.env.SHARED_CACHE_MS = '0';
    const build = jest.fn(async () => 'v');
    await sharedCached('k', build); await sharedCached('k', build);
    expect(build).toHaveBeenCalledTimes(2);
  });
});

describe('[PERF-06] verifySessionToken caching stays safe', () => {
  const secret = process.env.JWT_SECRET;
  afterEach(() => { process.env.JWT_SECRET = secret; });

  test('a verified token is accepted again; a tampered or wrongly signed one never is', () => {
    const token = jwt.sign({ sub: '42', sv: 3, typ: 'session' }, secret, { expiresIn: '1h' });
    expect(verifySessionToken(token)).toEqual({ userId: 42, sv: 3 });
    expect(verifySessionToken(token)).toEqual({ userId: 42, sv: 3 });
    const [h, , sig] = token.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: '1', sv: 0 })).toString('base64url')}.${sig}`;
    expect(() => verifySessionToken(forged)).toThrow();
    expect(() => verifySessionToken(jwt.sign({ sub: '42' }, 'another-secret', { expiresIn: '1h' }))).toThrow();
  });

  test('expiry is honoured for cached tokens', () => {
    const nowSpy = jest.spyOn(Date, 'now');
    const token = jwt.sign({ sub: '7', typ: 'session', exp: Math.floor(Date.now() / 1000) + 60 }, secret);
    expect(verifySessionToken(token).userId).toBe(7);
    nowSpy.mockReturnValue(Date.now() + 120_000);
    expect(() => verifySessionToken(token)).toThrow();
    nowSpy.mockRestore();
  });

  test('rotating JWT_SECRET invalidates cached verifications', () => {
    const token = jwt.sign({ sub: '9', typ: 'session' }, secret, { expiresIn: '1h' });
    expect(verifySessionToken(token).userId).toBe(9);
    process.env.JWT_SECRET = 'rotated-secret-rotated-secret-123';
    expect(() => verifySessionToken(token)).toThrow();
  });
});
