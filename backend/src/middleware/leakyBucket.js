import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './auth.js';

/**
 * Leaky-bucket rate limiter (in-memory, per process).
 *
 * Each key owns a bucket that fills by 1 per request and drains at `leakPerSec`.
 * A request is rejected only when the bucket would overflow `capacity`, so normal
 * bursty usage (page loads firing many calls) passes untouched and only sustained,
 * abnormal volume — scripts, floods, credential stuffing — gets a 429.
 *
 * Note: state is per Node process. Behind multiple instances each instance enforces
 * its own buckets, which is acceptable for an abuse guard (not a quota system).
 */
export function createLeakyBucket({ capacity, leakPerSec, keyFn, name = 'default', sweepMs = 60_000 }) {
  const buckets = new Map(); // key -> { level, last }

  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, b] of buckets) {
      if (b.level - ((now - b.last) / 1000) * leakPerSec <= 0) buckets.delete(key);
    }
  }, sweepMs);
  sweeper.unref();

  const middleware = (req, res, next) => {
    if (process.env.RATE_LIMIT_DISABLED === 'true') return next();

    const key = keyFn(req);
    if (!key) return next();

    const now = Date.now();
    const b = buckets.get(key) || { level: 0, last: now };
    const level = Math.max(0, b.level - ((now - b.last) / 1000) * leakPerSec);

    if (level + 1 > capacity) {
      b.level = level;
      b.last = now;
      buckets.set(key, b);
      const retryAfter = Math.max(1, Math.ceil((level + 1 - capacity) / leakPerSec));
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many requests, please slow down.', retryAfter });
    }

    b.level = level + 1;
    b.last = now;
    buckets.set(key, b);
    next();
  };

  middleware.limiterName = name;
  middleware.reset = () => buckets.clear();
  middleware.size = () => buckets.size;
  return middleware;
}

const num = (v, d) => (v !== undefined && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : d);

/** Key by authenticated user id when a valid token is present, otherwise by client IP. */
export function userOrIpKey(req) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies?.token;
  if (token) {
    try {
      const { sub, id } = jwt.verify(token, JWT_SECRET);
      if (sub ?? id) return `u:${sub ?? id}`;
    } catch {
      // fall through to IP
    }
  }
  return `ip:${req.ip}`;
}

// General API guard. Defaults: burst of 600 requests, draining 20/s (~72k/hour) per user/IP.
export const apiLimiter = createLeakyBucket({
  name: 'api',
  capacity: num(process.env.RATE_LIMIT_API_CAPACITY, 600),
  leakPerSec: num(process.env.RATE_LIMIT_API_LEAK_PER_SEC, 20),
  keyFn: userOrIpKey,
});

// Auth endpoints per IP. Campus traffic can share one NAT IP, so this is generous:
// burst of 300, draining 5/s.
export const authIpLimiter = createLeakyBucket({
  name: 'auth-ip',
  capacity: num(process.env.RATE_LIMIT_AUTH_IP_CAPACITY, 300),
  leakPerSec: num(process.env.RATE_LIMIT_AUTH_IP_LEAK_PER_SEC, 5),
  keyFn: (req) => `ip:${req.ip}`,
});

// Per-account guard against password guessing: 20 attempts burst, then 1 every 10s.
export const authAccountLimiter = createLeakyBucket({
  name: 'auth-account',
  capacity: num(process.env.RATE_LIMIT_AUTH_ACCOUNT_CAPACITY, 20),
  leakPerSec: num(process.env.RATE_LIMIT_AUTH_ACCOUNT_LEAK_PER_SEC, 0.1),
  keyFn: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : null;
    return email ? `acct:${email}` : null;
  },
});
