/**
 * PERF-001 — politica de cache HTTP.
 *
 * Simptomul raportat de owner („la fiecare refresh se reîncarcă tot") avea o cauză exactă:
 * serverul nu trimitea NICIUN `Cache-Control`, `ETag` sau `Last-Modified` pe fișierele statice,
 * deci browserul redescărca 3,06 MB de JavaScript la fiecare F5.
 *
 * Regulile de mai jos sunt cele standard pentru un SPA cu assets cu hash de conținut:
 *
 *   /assets/<nume>-<hash>.js|css   → imutabil, un an. Numele se schimbă când se schimbă
 *                                    conținutul, deci nu există risc de conținut învechit.
 *   alte fișiere statice            → o zi, cu revalidare (imagini, fonturi, manifest).
 *   index.html                      → `no-cache`: se revalidează mereu, altfel un deploy nou
 *                                    n-ar mai fi văzut niciodată (browserul ar servi HTML-ul
 *                                    vechi care indică bundle-uri șterse → ecran alb).
 *   /api/*                          → `no-store`: date de tenant, niciodată în cache-uri
 *                                    intermediare. Excepțiile explicite (rate de schimb etc.)
 *                                    își setează singure headerul, iar acest middleware nu-l
 *                                    suprascrie.
 */
import type { MiddlewareHandler } from "hono";

/** `assets/index-Bkm4ihWH.js` — numele conține hash-ul de conținut generat de Vite. */
const HASHED_ASSET = /\/assets\/.+-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|png|jpg|jpeg|svg|webp|avif)$/;
const STATIC_ASSET = /\.(js|css|woff2?|png|jpg|jpeg|gif|svg|webp|avif|ico|json|txt|webmanifest)$/;

export const IMMUTABLE = "public, max-age=31536000, immutable";
export const REVALIDATE_DAILY = "public, max-age=86400, must-revalidate";
export const NO_CACHE = "no-cache";
export const NO_STORE = "no-store";

export const httpCache: MiddlewareHandler = async (c, next) => {
  await next();

  // Ruta și-a ales deja politica (ex. un export cu `attachment`) — n-o suprascriem.
  if (c.res.headers.get("Cache-Control")) return;

  const path = new URL(c.req.url).pathname;

  if (path.startsWith("/api/")) {
    c.header("Cache-Control", NO_STORE);
    return;
  }

  if (HASHED_ASSET.test(path)) {
    c.header("Cache-Control", IMMUTABLE);
    return;
  }

  if (STATIC_ASSET.test(path)) {
    c.header("Cache-Control", REVALIDATE_DAILY);
    return;
  }

  // Orice altceva e shell-ul SPA (index.html servit pentru rute necunoscute).
  c.header("Cache-Control", NO_CACHE);
};
