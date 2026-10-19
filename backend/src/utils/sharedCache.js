/**
 * Short-lived cache for data every viewer shares (the calendar window), PERF-01.
 *
 * - Any successful API write clears it (server.js), so a change is visible on the next read;
 *   the TTL only bounds staleness from writes that bypass the API.
 * - A read that started before a write never stores its (older) result: entries carry the
 *   generation they were built in.
 * - Concurrent misses for one key share a single build (no stampede at expiry).
 */
let generation = 0;
const store = new Map(); // key -> { gen, at, value }
const inflight = new Map(); // key -> { gen, promise }
const MAX_KEYS = 500;

export const sharedCacheTtl = () =>
  Number(process.env.SHARED_CACHE_MS ?? (process.env.NODE_ENV === 'test' ? 0 : 5000));

export function invalidateShared() {
  generation++;
  store.clear();
  inflight.clear();
}

export async function sharedCached(key, build) {
  const ttl = sharedCacheTtl();
  if (!ttl) return build();
  const hit = store.get(key);
  if (hit && hit.gen === generation && Date.now() - hit.at < ttl) return hit.value;
  const running = inflight.get(key);
  if (running && running.gen === generation) return running.promise;

  const gen = generation;
  const promise = (async () => {
    try {
      const value = await build();
      if (gen === generation) {
        store.set(key, { gen, at: Date.now(), value });
        if (store.size > MAX_KEYS) store.delete(store.keys().next().value);
      }
      return value;
    } finally {
      if (inflight.get(key)?.promise === promise) inflight.delete(key);
    }
  })();
  inflight.set(key, { gen, promise });
  return promise;
}
