/**
 * PERF-002 — deduplicare + micro-cache pentru cererile GET.
 *
 * Măsurat înainte de acest fișier, o singură încărcare a paginii `/business/par` făcea **34 de
 * cereri API**, dintre care `GET /api/business/auth/me` de **6 ori** și `GET /api/par/me` de 4 ori.
 * Cauza: fiecare componentă care are nevoie de identitate (`BusinessGuardPage`, `BusinessShell`,
 * `ParGuardPage`, paginile) își face propriul `fetch` la montare, iar `src/lib/api.ts` era un
 * `fetch` gol — fără cunoștință despre ce cerere e deja în zbor.
 *
 * Trei mecanisme, în ordinea siguranței:
 *
 * 1. **Deduplicare în zbor** — două GET-uri identice pornite în același timp împart o singură
 *    cerere de rețea. Întotdeauna corect: nu poate întoarce date mai vechi decât cererea pe care
 *    o înlocuiește.
 *
 * 2. **Micro-cache (1,5 s)** — un GET repetat imediat după altul primește răspunsul precedent.
 *    Acoperă remontările din timpul unei singure navigări (shell + guard + pagină). Fereastra e
 *    sub timpul de reacție uman, deci nu se poate vedea ca „date învechite".
 *
 * 3. **Cache de identitate (5 min)** — doar pentru rutele din `IDENTITY_TTL`: cine sunt, ce roluri
 *    am, ce module sunt active. Se schimbă la login/logout/schimbare de roluri, momente în care
 *    cache-ul e golit explicit.
 *
 * **Invalidarea e agresivă intenționat:** ORICE cerere non-GET golește tot cache-ul de GET-uri.
 * O aplicație care aprobă plăți nu are voie să arate o listă învechită după o acțiune; a plăti
 * cu o cerere de rețea în plus după fiecare mutație e schimbul corect.
 */

interface CacheEntry {
  promise: Promise<unknown>;
  at: number;
  /** Setat când promisiunea se rezolvă — permite o citire sincronă (fără spinner la remontare). */
  resolved?: { value: unknown };
}

const cache = new Map<string, CacheEntry>();

/** Fereastra implicită: acoperă remontările dintr-o navigare, prea scurtă ca să se vadă. */
const DEFAULT_TTL_MS = 1_500;

/**
 * Rute de identitate — stabile pe durata sesiunii. Golite explicit la logout
 * (`clearApiCache`) și după acțiuni care schimbă rolurile (`invalidateApiCache`).
 */
const IDENTITY_TTL_MS = 5 * 60_000;
const IDENTITY_PATHS = [
  "/api/business/auth/me",
  "/api/auth/me",
  "/api/par/me",
  "/api/modules",
  "/api/fin/members/me",
  "/api/platform/catalog",
];

function ttlFor(path: string): number {
  return IDENTITY_PATHS.some((p) => path === p || path.startsWith(p + "?"))
    ? IDENTITY_TTL_MS
    : DEFAULT_TTL_MS;
}

/**
 * Rulează `fn` pentru `key`, refolosind cererea în zbor sau răspunsul proaspăt din cache.
 * Erorile NU se cache-uiesc: o cerere picată trebuie să poată fi reîncercată imediat.
 *
 * `force: true` ocolește cache-ul și îl rescrie. Necesar pentru reîncărcările cerute EXPLICIT de
 * utilizator (butoanele „Reîncarcă"): fără el, un clic la mai puțin de 1,5 s după încărcarea
 * paginii ar primi exact răspunsul dinainte, adică butonul ar părea că nu face nimic.
 */
export function dedupe<T>(key: string, fn: () => Promise<T>, force = false): Promise<T> {
  const hit = cache.get(key);
  if (!force && hit && Date.now() - hit.at < ttlFor(key)) {
    return hit.promise as Promise<T>;
  }

  const entry: CacheEntry = { promise: Promise.resolve(), at: Date.now() };
  entry.promise = fn()
    .then((value) => {
      entry.resolved = { value };
      return value;
    })
    .catch((err) => {
      if (cache.get(key) === entry) cache.delete(key);
      throw err;
    });
  cache.set(key, entry);
  return entry.promise as Promise<T>;
}

/**
 * Citește sincron o valoare deja rezolvată din cache. Folosit de hook-uri ca să randeze datele
 * imediat la remontare, în loc să pornească de la „se încarcă" și să pâlpâie la fiecare navigare.
 */
export function peekApiCache<T>(key: string): T | undefined {
  const hit = cache.get(key);
  if (hit?.resolved && Date.now() - hit.at < ttlFor(key)) return hit.resolved.value as T;
  return undefined;
}

/** Golește tot cache-ul de GET-uri. Apelat după fiecare mutație și la logout. */
export function clearApiCache(): void {
  cache.clear();
}

/** Golește intrările a căror cheie începe cu `prefix` (ex. după o acțiune pe un singur modul). */
export function invalidateApiCache(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
