/**
 * Tiny in-memory, per-session cache for "identity"-type fetches (who am I, my roles) that the
 * business shell reads on EVERY mount. Because each page renders its own shell, navigating
 * remounts the shell and used to re-fetch these — a visible loading flash + needless requests on
 * every click. Caching the resolved promise makes remounts instant and quiet.
 *
 * Deliberately simple: module-level Map, cleared on logout via clearSessionCache(). Optional TTL
 * for values that should occasionally refresh. Not for per-entity data (invoices, statements) —
 * only for stable session identity.
 */
interface Entry {
  promise: Promise<unknown>;
  at: number;
  resolved?: { value: unknown }; // set once the promise fulfils — enables a synchronous peek
}

const store = new Map<string, Entry>();

/**
 * Returns a cached promise for `key`, creating it via `fn` on first call (or after `ttlMs`).
 * A rejected fetch is NOT cached, so the next mount retries.
 */
export function cachedOnce<T>(key: string, fn: () => Promise<T>, ttlMs = 5 * 60_000): Promise<T> {
  const hit = store.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) {
    return hit.promise as Promise<T>;
  }
  const entry: Entry = { promise: Promise.resolve(), at: now };
  entry.promise = fn()
    .then((value) => {
      entry.resolved = { value };
      return value;
    })
    .catch((err) => {
      // Don't cache failures — let the next call retry.
      if (store.get(key) === entry) store.delete(key);
      throw err;
    });
  store.set(key, entry);
  return entry.promise as Promise<T>;
}

/** Synchronously read an already-resolved cached value (undefined if pending/absent/expired). */
export function peekResolved<T>(key: string, ttlMs = 5 * 60_000): T | undefined {
  const hit = store.get(key);
  if (hit?.resolved && Date.now() - hit.at < ttlMs) return hit.resolved.value as T;
  return undefined;
}

/** Drop everything (call on logout / tenant switch so a new session re-fetches identity). */
export function clearSessionCache(): void {
  store.clear();
}

/** Drop one key (e.g. after an action that changes roles/membership). */
export function invalidateSessionCache(key: string): void {
  store.delete(key);
}
