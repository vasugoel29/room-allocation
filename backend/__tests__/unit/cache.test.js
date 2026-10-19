// Unit tests for src/utils/cache.js (in-process TTL cache singleton). Keys are unique per test.
import { jest } from '@jest/globals';
import cache from '../../src/utils/cache.js';

let n = 0;
const key = (p = 'k') => `unit_${p}_${process.pid}_${n++}`;

afterEach(() => {
  jest.restoreAllMocks();
});

test('get returns what was set; missing keys return null', () => {
  const k = key();
  const value = { rooms: [1, 2, 3] };
  cache.set(k, value);
  expect(cache.get(k)).toBe(value);
  expect(cache.get(key('missing'))).toBeNull();
});

test('falsy values are returned as stored (0, false, empty string)', () => {
  for (const v of [0, false, '']) {
    const k = key();
    cache.set(k, v);
    expect(cache.get(k)).toBe(v);
  }
});

test('explicit TTL is in milliseconds; entries expire after it and are evicted on read', () => {
  const t0 = 1_800_000_000_000;
  const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
  const k = key('ttl');
  cache.set(k, 'v', 1000);
  now.mockReturnValue(t0 + 1000);
  expect(cache.get(k)).toBe('v'); // still valid at exactly the expiry instant
  now.mockReturnValue(t0 + 1001);
  expect(cache.get(k)).toBeNull();
  now.mockReturnValue(t0); // evicted, so going "back in time" doesn't resurrect it
  expect(cache.get(k)).toBeNull();
});

test('default TTL is 30 seconds', () => {
  const t0 = 1_800_000_000_000;
  const now = jest.spyOn(Date, 'now').mockReturnValue(t0);
  const k = key('default');
  cache.set(k, 'v');
  now.mockReturnValue(t0 + 30_000);
  expect(cache.get(k)).toBe('v');
  now.mockReturnValue(t0 + 30_001);
  expect(cache.get(k)).toBeNull();
});

test('set overwrites value and expiry', () => {
  const k = key();
  cache.set(k, 'a', 10);
  cache.set(k, 'b', 60_000);
  expect(cache.get(k)).toBe('b');
});

test('delete removes a single key; deleting a missing key is a no-op', () => {
  const k1 = key();
  const k2 = key();
  cache.set(k1, 1);
  cache.set(k2, 2);
  cache.delete(k1);
  expect(cache.get(k1)).toBeNull();
  expect(cache.get(k2)).toBe(2);
  expect(() => cache.delete(key('never'))).not.toThrow();
});

test('deletePattern removes every key matching the regex and nothing else', () => {
  const tag = `${process.pid}_${n++}`;
  const a = `admin_status_${tag}_1`;
  const b = `admin_status_${tag}_2`;
  const other = `room_availability_${tag}`;
  [a, b, other].forEach((k) => cache.set(k, k));
  cache.deletePattern(`admin_status_${tag}_.*`);
  expect(cache.get(a)).toBeNull();
  expect(cache.get(b)).toBeNull();
  expect(cache.get(other)).toBe(other);
});

// The pattern is not anchored, so 'room_availability_.*' also clears e.g. 'my_room_availability_x'.
test('deletePattern is an unanchored regex match (current behaviour)', () => {
  const k = `prefix_room_availability_${process.pid}_${n++}`;
  cache.set(k, 1);
  cache.deletePattern('room_availability_.*');
  expect(cache.get(k)).toBeNull();
});
