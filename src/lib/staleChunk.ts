/**
 * Recuperarea din „chunk vechi după deploy" — într-un singur loc, pentru că are DOUĂ locuri de
 * intrare (factory-ul `lazy()` din lazyWithTimeout și ErrorBoundary) și trebuie să se comporte
 * identic în ambele.
 *
 * Ce se întâmplă de fapt (raport 2026-08-29, vlah.business@gmail.com, „eroarea asta e mereu"):
 * fiecare deploy mintește nume noi de chunk-uri, iar o filă deschisă dinainte încă cere numele
 * vechi. Până aici e banal și se repară cu un reload. Ce l-a făcut PERMANENT a fost lanțul:
 *
 *   1. `/assets/<chunk>.js` inexistent NU întorcea 404 — cădea în fallback-ul SPA și primea
 *      `200` + index.html (HTML servit la un URL de modul → exact mesajul „Failed to fetch
 *      dynamically imported module");
 *   2. service worker-ul cache-uia „cache-first" orice răspuns cu `response.ok` — deci punea
 *      HTML-ul acela sub URL-ul de JS, într-un cache al cărui nume nu se schimba niciodată;
 *   3. hash-ul unui chunk depinde de conținut, deci după un deploy care nu atinge modulul,
 *      browserul cere ACELAȘI URL — și primește la nesfârșit HTML-ul otrăvit din cache.
 *      Reload-ul nu avea cum să ajute: nu ajungea niciodată la rețea.
 *
 * De aceea recuperarea de aici GOLEȘTE cache-urile înainte de reload. Cauzele 1 și 2 sunt reparate
 * la sursă (`scripts/build-vercel.mjs` + `server/index.ts` întorc 404, `public/sw.js` nu mai atinge
 * `/assets/`); asta rămâne plasa pentru filele care au deja cache-ul stricat.
 */

/** Formulările pe browsere pentru un chunk care nu se încarcă:
 *  Chrome/Edge: „Failed to fetch dynamically imported module: <url>"
 *  Firefox:     „error loading dynamically imported module: <url>"
 *  Safari:      „Importing a module script failed."
 *  Plus eroarea sintetică aruncată de `lazyWithTimeout` când importul ATÂRNĂ în loc să pice. */
const STALE_CHUNK_RE =
  /fetch dynamically imported module|loading dynamically imported module|importing a module script failed/i;

export function isStaleChunkError(message: string | null | undefined): boolean {
  return !!message && STALE_CHUNK_RE.test(message);
}

/** O singură recuperare per incident, nu o buclă: dacă reload-ul nu a rezolvat (indisponibilitate
 * reală, nu doar filă veche), a DOUA eroare în fereastra asta cade pe cardul manual. */
const RELOAD_KEY = "vl-stale-chunk-reload-at";
const RELOAD_COOLDOWN_MS = 15_000;

/** Golește cache-urile service worker-ului. Fără asta, reload-ul reciteste exact răspunsul
 * otrăvit care a produs eroarea. Best-effort: dacă `caches` nu există sau aruncă, mergem mai
 * departe cu reload-ul — tot are șanse să repare cazul simplu (doar filă veche). */
async function purgeCaches(): Promise<void> {
  try {
    if (typeof caches === "undefined") return;
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
  } catch {
    /* cache-ul indisponibil (mod privat / blocat) — reload-ul rămâne singura recuperare */
  }
}

/**
 * Încearcă recuperarea. Întoarce `true` dacă reload-ul a fost pornit (apelantul trebuie să NU mai
 * afișeze nimic și să NU raporteze eroarea — pagina dispare oricum), `false` dacă recuperarea a
 * fost deja încercată recent și a eșuat, caz în care eroarea e reală și merită arătată + raportată.
 */
export function recoverFromStaleChunk(): boolean {
  let lastAttempt = 0;
  try {
    lastAttempt = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
  } catch {
    // sessionStorage indisponibil — fără memorie între încercări nu putem garanta „o singură dată",
    // deci nu reîncărcăm deloc: mai bine cardul manual decât o buclă de reload-uri.
    return false;
  }
  if (Date.now() - lastAttempt <= RELOAD_COOLDOWN_MS) return false;

  try {
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }

  void purgeCaches().finally(() => {
    window.location.reload();
  });
  return true;
}
