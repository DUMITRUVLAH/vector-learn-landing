/**
 * FinFlow — Service Worker (MOB-101), rescris 2026-08-29.
 *
 * ISTORIC — de ce arată altfel decât varianta „cache-first pe tot ce e static":
 *
 * Varianta veche a produs eroarea raportată de owner ca „e mereu":
 *   „Failed to fetch dynamically imported module: https://www.finflow.best/assets/ParDashboard-<hash>.js"
 *
 * Lanțul complet:
 *   1. un `/assets/<chunk>.js` care nu (mai) există cădea în fallback-ul SPA → `200` + index.html;
 *   2. handler-ul de aici cache-uia ORICE răspuns cu `response.ok`, deci punea acel HTML sub URL-ul
 *      de JavaScript;
 *   3. `CACHE_NAME` era o constantă care nu se schimba niciodată, deci intrarea otrăvită nu se mai
 *      ștergea; iar `activate` șterge doar cache-urile cu ALT nume;
 *   4. hash-ul unui chunk depinde de conținut: dacă modulul nu se schimbă, deploy-ul următor cere
 *      exact același URL — servit iar din cache-ul otrăvit. Eroarea devenea permanentă pentru acel
 *      browser, iar reload-ul automat nu avea cum s-o repare: cererea nu mai ajungea la rețea.
 *
 * Cele două reguli care fac clasa asta de bug-uri imposibilă:
 *   A. `/assets/*` NU trece deloc pe aici. Fișierele au hash de conținut în nume și headerul
 *      `cache-control: immutable, max-age=1y` (scripts/build-vercel.mjs), deci cache-ul HTTP al
 *      browserului le ține oricum — un al doilea cache nu adaugă nimic și poate strica totul.
 *   B. Nu se cache-uiește niciun răspuns HTML sub un URL care nu e navigație. Dacă serverul
 *      răspunde cu pagina în loc de fișier, e un simptom de reparat, nu ceva de păstrat.
 */

// Numele conține versiunea: la schimbarea lui, `activate` șterge cache-urile vechi — inclusiv
// intrările otrăvite ale utilizatorilor afectați. La orice schimbare de strategie, crește-l.
const CACHE_NAME = "vl-shell-v2";
const SHELL_ASSETS = ["/", "/index.html"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/** Un răspuns HTML la un URL care nu e navigație = fallback-ul SPA servit în locul fișierului
 * cerut. Nu-l cache-uim și nu-l servim din cache: e exact ce a otrăvit cache-ul înainte. */
function isHtml(response) {
  const type = response.headers.get("content-type") || "";
  return type.includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Cross-origin și API — mereu la rețea, fără intermediere.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Regula A: modulele cu hash nu trec pe aici NICIODATĂ (vezi comentariul de sus).
  if (url.pathname.startsWith("/assets/")) return;

  // Navigație (HTML): rețea întâi, cache doar ca plasă de offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok && isHtml(response)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put("/index.html", clone));
          }
          return response;
        })
        .catch(() =>
          caches.match("/index.html").then((r) => r ?? new Response("Offline", { status: 503 }))
        )
    );
    return;
  }

  // Restul (iconițe, manifest, imagini): cache-first, dar cu HTML-ul respins în ambele sensuri.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached && !isHtml(cached)) return cached;
      // Intrare veche otrăvită (HTML sub un URL de fișier): o ștergem și mergem la rețea.
      if (cached) caches.open(CACHE_NAME).then((cache) => cache.delete(request));
      return fetch(request).then((response) => {
        if (response.ok && request.method === "GET" && !isHtml(response)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      });
    })
  );
});
