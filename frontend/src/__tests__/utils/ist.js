import { beforeAll, afterAll, it, expect } from 'vitest';

/**
 * The test container runs in UTC, but the app's users (and the FE-01/FE-14 bugs) live in IST.
 * Node >= 13 re-reads globalThis.process.env.TZ when it is assigned, so we switch the worker's local zone to
 * Asia/Kolkata for the duration of a file and restore it afterwards. A guard test proves the switch
 * took effect, so an `it.fails` can never "pass" just because the zone silently stayed UTC.
 */
export function runInIST() {
  let prev;
  beforeAll(() => {
    prev = globalThis.process.env.TZ;
    globalThis.process.env.TZ = 'Asia/Kolkata';
  });
  afterAll(() => {
    if (prev === undefined) delete globalThis.process.env.TZ;
    else globalThis.process.env.TZ = prev;
  });
  it('[guard] local timezone is IST (UTC+05:30) for this file', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(-330);
  });
}

/** Build a Date from IST wall-clock parts. */
export const ist = (y, mo, d, h = 0, mi = 0) => new Date(Date.UTC(y, mo - 1, d, h, mi) - 330 * 60 * 1000);
