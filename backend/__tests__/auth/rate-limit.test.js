// Leaky-bucket limiter (src/middleware/rateLimiter.js): unit tests + mounting on auth routes.
import { jest } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import app from '../../src/server.js';
import { createLeakyBucket, userOrIpKey, apiLimiter, authIpLimiter, authAccountLimiter } from '../../src/middleware/rateLimiter.js';
import { closeDb } from '../../test/helpers/factories.js';

afterAll(closeDb);

const ORIGINAL_FLAG = process.env.RATE_LIMIT_DISABLED;
let nowSpy;
let clock;
beforeEach(() => {
  process.env.RATE_LIMIT_DISABLED = 'false';
  clock = 1_700_000_000_000;
  nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
});
afterEach(() => {
  nowSpy.mockRestore();
  process.env.RATE_LIMIT_DISABLED = ORIGINAL_FLAG;
});

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.set = (k, v) => { res.headers[k.toLowerCase()] = v; return res; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}
/** Runs the middleware once; returns { passed, res }. */
function hit(mw, key = 'k') {
  const res = fakeRes();
  let passed = false;
  mw({ key }, res, () => { passed = true; });
  return { passed, res };
}
const bucket = (o = {}) => createLeakyBucket({ capacity: 3, leakPerSec: 1, keyFn: (req) => req.key, name: 't', ...o });

describe('createLeakyBucket', () => {
  test('a burst up to capacity passes; capacity+1 → 429 with Retry-After and JSON body', () => {
    const mw = bucket();
    for (let i = 0; i < 3; i++) expect(hit(mw).passed).toBe(true);
    const { passed, res } = hit(mw);
    expect(passed).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('1');
    expect(res.body).toEqual({ error: 'Too many requests, please slow down.', retryAfter: 1 });
  });

  test('Retry-After reflects how long until one slot leaks', () => {
    const mw = bucket({ capacity: 2, leakPerSec: 0.1 }); // one slot every 10s
    hit(mw); hit(mw);
    const { res } = hit(mw);
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('10');
  });

  test('the bucket leaks over time, letting requests through again at the leak rate', () => {
    const mw = bucket();
    hit(mw); hit(mw); hit(mw);
    expect(hit(mw).passed).toBe(false);
    clock += 999;
    expect(hit(mw).passed).toBe(false); // < 1 slot drained
    clock += 1;
    expect(hit(mw).passed).toBe(true); // exactly one slot drained
    expect(hit(mw).passed).toBe(false);
    clock += 3000; // fully drained
    for (let i = 0; i < 3; i++) expect(hit(mw).passed).toBe(true);
    expect(hit(mw).passed).toBe(false);
  });

  test('rejected requests do not fill the bucket further (no penalty spiral)', () => {
    const mw = bucket();
    hit(mw); hit(mw); hit(mw);
    for (let i = 0; i < 50; i++) expect(hit(mw).passed).toBe(false);
    clock += 1000;
    expect(hit(mw).passed).toBe(true);
  });

  test('keys are isolated', () => {
    const mw = bucket();
    hit(mw, 'a'); hit(mw, 'a'); hit(mw, 'a');
    expect(hit(mw, 'a').passed).toBe(false);
    expect(hit(mw, 'b').passed).toBe(true);
    expect(mw.size()).toBe(2);
  });

  test('a null key bypasses limiting', () => {
    const mw = createLeakyBucket({ capacity: 1, leakPerSec: 1, keyFn: () => null });
    for (let i = 0; i < 5; i++) expect(hit(mw).passed).toBe(true);
    expect(mw.size()).toBe(0);
  });

  test('RATE_LIMIT_DISABLED=true bypasses limiting entirely', () => {
    process.env.RATE_LIMIT_DISABLED = 'true';
    const mw = bucket({ capacity: 1 });
    for (let i = 0; i < 10; i++) expect(hit(mw).passed).toBe(true);
    expect(mw.size()).toBe(0);
  });

  test('reset() clears all buckets; limiterName is exposed', () => {
    const mw = bucket({ capacity: 1, name: 'named' });
    hit(mw);
    expect(hit(mw).passed).toBe(false);
    mw.reset();
    expect(mw.size()).toBe(0);
    expect(hit(mw).passed).toBe(true);
    expect(mw.limiterName).toBe('named');
  });

  test('the sweeper drops fully drained buckets', () => {
    nowSpy.mockRestore();
    jest.useFakeTimers({ now: 1_700_000_000_000 });
    try {
      const mw = bucket({ sweepMs: 1000 });
      hit(mw, 'x');
      expect(mw.size()).toBe(1);
      jest.advanceTimersByTime(2000); // 2s at 1/s drains the single unit, sweep runs
      expect(mw.size()).toBe(0);
    } finally {
      jest.useRealTimers();
      nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    }
  });
});

describe('userOrIpKey', () => {
  const req = (headers = {}, extra = {}) => ({ headers, ip: '10.1.2.3', ...extra });

  test('valid Bearer JWT → keyed by user id', () => {
    const token = jwt.sign({ sub: '42', sv: 0, typ: 'session' }, process.env.JWT_SECRET);
    expect(userOrIpKey(req({ authorization: `Bearer ${token}` }))).toBe('u:42');
  });

  test('valid token cookie → keyed by user id', () => {
    const token = jwt.sign({ sub: '7', sv: 0, typ: 'session' }, process.env.JWT_SECRET);
    expect(userOrIpKey(req({}, { cookies: { token } }))).toBe('u:7');
  });

  test.each([
    ['no token', {}],
    ['invalid token', { authorization: 'Bearer junk' }],
    ['wrong-secret token', { authorization: `Bearer ${jwt.sign({ id: 42 }, 'other')}` }],
    ['token without id', { authorization: `Bearer ${jwt.sign({ role: 'ADMIN' }, process.env.JWT_SECRET)}` }],
    ['legacy { id } token', { authorization: `Bearer ${jwt.sign({ id: 42 }, process.env.JWT_SECRET)}` }],
  ])('%s → keyed by IP', (_n, headers) => {
    expect(userOrIpKey(req(headers))).toBe('ip:10.1.2.3');
  });

  test('expired token → keyed by IP', () => {
    const token = jwt.sign({ id: 42 }, process.env.JWT_SECRET, { expiresIn: -10 });
    expect(userOrIpKey(req({ authorization: `Bearer ${token}` }))).toBe('ip:10.1.2.3');
  });
});

describe('limiters mounted on the app', () => {
  beforeEach(() => {
    nowSpy.mockRestore(); // real time for HTTP requests
    apiLimiter.reset(); authIpLimiter.reset(); authAccountLimiter.reset();
  });
  afterEach(() => {
    apiLimiter.reset(); authIpLimiter.reset(); authAccountLimiter.reset();
    nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock);
  });

  // dev-login for an email that is not in the (mock) ACL answers 403, so no session is created.
  test('dev-login is guarded by the per-account limiter (burst of 20, then 429 with Retry-After)', async () => {
    const email = `ratelimited.${Date.now()}@nsut.ac.in`;
    const statuses = [];
    for (let i = 0; i < 20; i++) {
      statuses.push((await request(app).post('/api/auth/dev-login').send({ email })).status);
    }
    expect(statuses.every((s) => s === 403)).toBe(true);
    const blocked = await request(app).post('/api/auth/dev-login').send({ email: email.toUpperCase() });
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThanOrEqual(1);
    expect(blocked.body.error).toMatch(/Too many requests/);
    // a different account from the same IP is unaffected
    const other = await request(app).post('/api/auth/dev-login').send({ email: `other.${Date.now()}@nsut.ac.in` });
    expect(other.status).toBe(403);
    // the IP and global API limiters also saw these requests
    expect(authIpLimiter.size()).toBeGreaterThanOrEqual(1);
    expect(apiLimiter.size()).toBeGreaterThanOrEqual(1);
  });

  test('POST /api/auth/google passes through the IP auth limiter (no email in the body → no account key)', async () => {
    await request(app).post('/api/auth/google').send({ credential: 'not-a-google-token' });
    expect(authIpLimiter.size()).toBe(1);
    expect(authAccountLimiter.size()).toBe(0);
  });

  test('logout is not behind the auth limiters', async () => {
    await request(app).post('/api/auth/logout').send({ email: 'x@nsut.ac.in' });
    expect(authIpLimiter.size()).toBe(0);
    expect(authAccountLimiter.size()).toBe(0);
  });

  test('[PERF-03] /api/health is in front of the API limiter (probes never count or get 429)', async () => {
    for (let i = 0; i < 5; i++) expect((await request(app).get('/api/health')).status).toBe(200);
    expect(apiLimiter.size()).toBe(0);
  });

  test('with RATE_LIMIT_DISABLED=true the limiters record nothing', async () => {
    process.env.RATE_LIMIT_DISABLED = 'true';
    await request(app).post('/api/auth/dev-login').send({ email: 'x@nsut.ac.in' });
    expect(apiLimiter.size() + authIpLimiter.size() + authAccountLimiter.size()).toBe(0);
  });
});
