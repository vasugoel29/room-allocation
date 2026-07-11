import logger from './logger.js';

class SimpleCache {
  constructor(defaultTtlSeconds = 60) {
    this.cache = new Map();
    this.defaultTtl = defaultTtlSeconds * 1000;

    // Active background cleanup of expired keys every 60s
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now > entry.expiry) {
          this.cache.delete(key);
          logger.info('Cache auto-expired', { key });
        }
      }
    }, 60000);
    
    if (this.cleanupInterval && typeof this.cleanupInterval.unref === 'function') {
      this.cleanupInterval.unref();
    }
  }

  set(key, value, ttlMs = this.defaultTtl) {
    const expiry = Date.now() + ttlMs;
    this.cache.set(key, { value, expiry });
    logger.info('Cache set', { key, expiry: new Date(expiry).toISOString() });
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      logger.info('Cache expired', { key });
      return null;
    }

    return entry.value;
  }

  delete(key) {
    this.cache.delete(key);
    logger.info('Cache deleted', { key });
  }

  clear() {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  /**
   * Delete keys matching a pattern (e.g., room_status_*)
   */
  deletePattern(pattern) {
    const regex = new RegExp(pattern);
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
      }
    }
  }
}

const cache = new SimpleCache(30); // 30s default TTL for rapid UI updates
export default cache;
