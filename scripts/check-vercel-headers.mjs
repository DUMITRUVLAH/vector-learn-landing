#!/usr/bin/env node
/**
 * Poartă: `.vercel/output/config.json` trebuie să emită headerele de cache ȘI de securitate.
 *
 * Bug-ul pe care îl blochează (2026-08-08, găsit verificând producția DUPĂ deploy):
 * `server/middleware/securityHeaders.ts` punea CSP + X-Frame-Options pe fiecare răspuns al
 * aplicației Hono — dar pe Vercel, Hono servește DOAR `/api/*`. `index.html` și assets-urile vin
 * de la CDN, care nu trece prin niciun middleware. Rezultat măsurat în producție:
 *
 *     curl -I https://www.finflow.best/api/health   → x-frame-options: DENY   ✅
 *     curl -I https://www.finflow.best/            → (niciun header)          ❌
 *
 * Adică protecția lipsea exact unde contează: clickjacking-ul înseamnă să pui DOCUMENTUL în
 * iframe, peste butoanele de aprobare a plăților. Pe un răspuns JSON, X-Frame-Options nu apără nimic.
 *
 * Lecția, generalizată: un middleware al aplicației NU acoperă ce servește CDN-ul. Orice header
 * care trebuie să existe pe pagină, nu doar pe API, trebuie declarat în configurația de rutare —
 * și verificat în ARTEFACT, pentru că în cod arată corect în ambele cazuri.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const CONFIG = path.resolve(process.cwd(), ".vercel/output/config.json");

if (!existsSync(CONFIG)) {
  console.error("[check-vercel-headers] .vercel/output/config.json lipsește — rulează build-vercel.mjs întâi.");
  process.exit(1);
}

const config = JSON.parse(readFileSync(CONFIG, "utf8"));
const routes = config.routes ?? [];

/**
 * Headerele pe care CDN-ul le va emite pentru o cale.
 *
 * `existsAsFile` modelează faza `handle: "filesystem"` din Build Output API: dacă fișierul există
 * pe disc, cererea e servită ACOLO și nu mai ajunge la regulile de după (fallback-ul SPA).
 * Fără acest detaliu, verificarea credea că `/assets/x.js` primește `no-cache` de la regula de
 * final — un fals pozitiv care ar fi făcut poarta inutilă (ar fi picat mereu, deci ar fi fost
 * dezactivată).
 */
function headersFor(pathname, existsAsFile = true) {
  const out = {};
  for (const r of routes) {
    if (r.handle) {
      // `handle: "filesystem"` — un fișier real e servit aici; restul regulilor nu se mai aplică.
      if (r.handle === "filesystem" && existsAsFile) break;
      continue;
    }
    if (!r.src) continue;
    let re;
    try {
      re = new RegExp(`^${r.src}$`);
    } catch {
      continue;
    }
    if (!re.test(pathname)) continue;
    if (r.headers) Object.assign(out, r.headers);
    if (!r.continue) break; // regulă terminală (are `dest`) — oprește lanțul
  }
  return out;
}

/**
 * Regula TERMINALĂ care va servi o cale (`dest` sau `status`), nu doar headerele ei.
 * Necesară pentru verificarea 4: acolo nu contează ce headere primește cererea, ci CE i se
 * răspunde — pagina SPA sau un 404.
 */
function terminalRuleFor(pathname, existsAsFile = true) {
  for (const r of routes) {
    if (r.handle) {
      if (r.handle === "filesystem" && existsAsFile) return { servedFromDisk: true };
      continue;
    }
    if (!r.src) continue;
    let re;
    try {
      re = new RegExp(`^${r.src}$`);
    } catch {
      continue;
    }
    if (!re.test(pathname)) continue;
    if (!r.continue) return r;
  }
  return null;
}

const REQUIRED_SECURITY = [
  "content-security-policy",
  "x-frame-options",
  "x-content-type-options",
  "referrer-policy",
];

const problems = [];

// 1. Pagina HTML (documentul care poate fi încadrat în iframe) are nevoie de securitate.
const htmlHeaders = headersFor("/", false);
for (const h of REQUIRED_SECURITY) {
  if (!htmlHeaders[h]) problems.push(`pagina "/" nu emite headerul de securitate "${h}"`);
}

// 2. Assets-urile cu hash trebuie să fie imutabile — altfel revine simptomul „refresh-ul
//    reîncarcă tot", care e chiar motivul pentru care au fost adăugate headerele.
const assetHeaders = headersFor("/assets/index-ABC12345.js");
const cc = assetHeaders["cache-control"] ?? "";
if (!cc.includes("immutable")) {
  problems.push(`/assets/* nu e imutabil (cache-control: "${cc || "lipsă"}")`);
}

// 3. index.html NU are voie să fie cache-uit lung: ar face ca un deploy nou să nu mai fie văzut.
const htmlCC = htmlHeaders["cache-control"] ?? "";
if (/max-age=(?!0)\d+/.test(htmlCC) && !htmlCC.includes("no-cache")) {
  problems.push(`pagina "/" e cache-uită lung ("${htmlCC}") — un deploy nou n-ar mai fi văzut`);
}

// 4. Un chunk cu hash care NU există trebuie să dea 404, nu pagina SPA.
//    Bug 2026-08-29 („eroarea asta e mereu"): `/assets/<chunk>.js` lipsă cădea în fallback-ul SPA
//    și primea `200` + index.html. Browserul refuză HTML-ul ca modul ES → „Failed to fetch
//    dynamically imported module", iar service worker-ul, văzând un răspuns `ok`, îl cache-uia
//    PERMANENT sub URL-ul de JavaScript. Cum hash-ul unui modul nemodificat rămâne același la
//    deploy-urile următoare, eroarea nu mai dispărea niciodată pentru browserul acela.
const missingAsset = terminalRuleFor("/assets/ParDashboard-Cvn9ANnH.js", false);
if (!missingAsset || missingAsset.dest === "/index.html" || missingAsset.status !== 404) {
  problems.push(
    "un /assets/*.js inexistent nu primește 404 — cade în fallback-ul SPA și primește 200 + HTML, " +
      "ceea ce otrăvește cache-ul service worker-ului (vezi public/sw.js și src/lib/staleChunk.ts)"
  );
}

if (problems.length) {
  console.error("\n❌ [check-vercel-headers] Configurația de rutare Vercel e incompletă:\n");
  for (const p of problems) console.error(`   • ${p}`);
  console.error(`
   Reparare: în scripts/build-vercel.mjs, regulile din \`routes\`. Un middleware Hono NU e
   suficient — pe Vercel el rulează doar pentru /api/*, restul îl servește CDN-ul.
`);
  process.exit(1);
}

console.log("✅ [check-vercel-headers] headere de securitate pe pagină + cache imutabil pe assets.");
