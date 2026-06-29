// In-memory cache with TTL for RagRadar
// Usage: import { cached, clearCache, cacheStats } from "./cache.js";

const store = new Map();

/**
 * Get cached value or compute + store it.
 * @param {string} key - Cache key
 * @param {Function} fn - Async function to compute value
 * @param {number} ttlMs - TTL in milliseconds (default 60s)
 * @returns {*} Cached or fresh value
 */
export async function cached(key, fn, ttlMs = 60_000) {
  const now = Date.now();
  const entry = store.get(key);
  if (entry && now < entry.expires) {
    return entry.value;
  }
  const value = await fn();
  store.set(key, { value, expires: now + ttlMs, created: now });
  return value;
}

/**
 * Clear all cache or specific key
 */
export function clearCache(key) {
  if (key) {
    store.delete(key);
  } else {
    store.clear();
  }
}

/**
 * Get cache stats
 */
export function cacheStats() {
  const now = Date.now();
  let active = 0;
  let expired = 0;
  for (const [, entry] of store) {
    if (now < entry.expires) active++;
    else expired++;
  }
  return { total: store.size, active, expired };
}

// Auto-cleanup expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now >= entry.expires) store.delete(key);
  }
}, 300_000);

// Cache TTL presets (in ms)
export const TTL = {
  FAST: 15_000,      // 15s — price data, gas
  SHORT: 30_000,     // 30s — token safety, social
  MEDIUM: 60_000,    // 60s — yields, protocol stats
  SLOW: 300_000,     // 5min — stablecoins, protocol health
  STATIC: 3600_000,  // 1h — chain config, supported tokens
};
