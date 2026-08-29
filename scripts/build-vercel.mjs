/**
 * Vercel build via the Build Output API (v3).
 *
 * Vercel's default @vercel/node builder transpiles the API entry without bundling, so the
 * extensionless ESM imports (./app, ./routes/*, …) fail at runtime with ERR_MODULE_NOT_FOUND.
 * We instead esbuild-bundle the whole API into ONE self-contained file, so there are no
 * runtime relative-import resolutions at all.
 *
 * The entry lives at server/vercel-entry.ts (NOT a root api/ folder): a root api/ directory
 * makes Vercel auto-build it with @vercel/node and override this Build Output, reintroducing
 * the ERR_MODULE_NOT_FOUND. Keeping the entry in server/ leaves this script the sole builder.
 *
 * Run AFTER `vite build` (frontend → dist/). Produces .vercel/output/ which Vercel deploys.
 */
import { build } from "esbuild";
import { cpSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";

const OUT = ".vercel/output";
rmSync(OUT, { recursive: true, force: true });

// 1. Static frontend
mkdirSync(`${OUT}/static`, { recursive: true });
if (!existsSync("dist")) throw new Error("dist/ missing — run `vite build` first");
cpSync("dist", `${OUT}/static`, { recursive: true });

// 2. Bundle the serverless API into a single ESM file
const FN = `${OUT}/functions/api/index.func`;
mkdirSync(FN, { recursive: true });
await build({
  entryPoints: ["server/vercel-entry.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: `${FN}/index.mjs`,
  external: [
    // PGlite is local-only (lazy require in server/db/client.ts); keep it out of the bundle.
    "@electric-sql/pglite",
    "drizzle-orm/pglite",
    // Playwright is used only for local PDF rendering (server/routes/finInvoiceDoc.ts).
    // On Vercel, Chromium isn't installed, so chromium.launch() throws and the route falls
    // back to print-ready HTML. The package pulls in chromium-bidi, which esbuild cannot
    // resolve at bundle time; mark both external so the serverless build succeeds. They are
    // never required at runtime on the fallback path (the import throws before resolution).
    "playwright",
    "chromium-bidi",
    // NOTE: exceljs USED to be external here — that was a latent prod bug. The Build Output
    // API .func directory ships ONLY the bundled index.mjs (no node_modules), so an external
    // package can NEVER "resolve at runtime": `await import("exceljs")` threw "Cannot find
    // package 'exceljs'" → 500 on every .xlsx upload (statement import + PAR export). esbuild
    // bundles exceljs fine (verified: build OK, loads a real workbook), so we bundle it now.
    // Do NOT re-add exceljs (or any package request-path code imports) to this list.
  ],
  // Provide a CJS require for any externalized require() calls in the ESM output.
  banner: {
    js: "import{createRequire as ___cr}from'node:module';const require=___cr(import.meta.url);",
  },
  logLevel: "info",
});

writeFileSync(
  `${FN}/.vc-config.json`,
  // shouldAddHelpers MUST be false. With it true, Vercel's Node launcher pre-reads the request
  // body to populate req.body — which drains the stream before Hono's getRequestListener builds
  // the Web Request. Hono's c.req.json() then waits forever for an already-consumed body, so
  // EVERY POST (login, signup, …) hangs 30s → FUNCTION_INVOCATION_TIMEOUT. GET routes were fine
  // because they have no body. Disabling helpers lets Hono read the raw request stream itself.
  // maxDuration 60s (not 30): a COLD start that also extracts a multi-page PDF (unpdf first-load
  // + parse) measured ~22s — too close to a 30s cap. 60s gives headroom so uploads never 504.
  JSON.stringify({ runtime: "nodejs20.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 60 }, null, 2)
);

// 3. Routing: /api/* → the function; everything else → static (SPA index for unknown paths)
// NOTE: the AUTOBILL daily cron is triggered by a GitHub Action (.github/workflows/autobill-cron.yml)
// hitting /api/fin/cron/run-recurring — NOT a Vercel Cron. A `crons` entry here failed the deploy
// at the "Deploying outputs" step (account/plan cron validation), so we schedule externally.
// PERF-001: fără aceste headere, Vercel servea assets-urile cu revalidare la fiecare cerere —
// browserul redescărca 3 MB de JS la FIECARE refresh (simptomul „se reîncarcă tot"). Numele
// fișierelor din /assets/ conțin hash-ul de conținut, deci sunt imutabile prin construcție și
// pot fi cache-uite un an. index.html rămâne `no-cache`: dacă l-am cache-ui, un deploy nou n-ar
// mai fi văzut (HTML vechi → bundle-uri șterse → ecran alb).
/**
 * SEC-001 — headerele de securitate trebuie emise și de CDN, nu doar de funcția API.
 *
 * `server/middleware/securityHeaders.ts` le pune pe fiecare răspuns al aplicației Hono — dar pe
 * Vercel, Hono servește DOAR `/api/*`. Fișierele statice (inclusiv `index.html`) le servește CDN-ul,
 * care nu trece prin niciun middleware. Verificat în producție după primul deploy: `/api/health`
 * avea CSP + X-Frame-Options, iar pagina HTML nu avea niciunul.
 *
 * Asta făcea protecția inutilă exact acolo unde contează: clickjacking-ul înseamnă să pui
 * DOCUMENTUL într-un iframe, peste butoanele de aprobare a plăților. Un `X-Frame-Options` pe un
 * răspuns JSON nu apără nimic.
 *
 * Valorile sunt ținute identice cu cele din middleware. Dacă se schimbă acolo, se schimbă și aici.
 */
const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com https://checkout.stripe.com",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; "),
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy":
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
};

writeFileSync(
  `${OUT}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        // Headerele de securitate pe TOT ce iese din CDN. `continue: true` — doar adaugă
        // headere, apoi lasă cererea să meargă la regula ei de rutare de mai jos.
        { src: "/(.*)", headers: SECURITY_HEADERS, continue: true },
        { src: "/api/(.*)", dest: "/api" },
        {
          src: "/assets/(.*)",
          headers: { "cache-control": "public, max-age=31536000, immutable" },
          continue: true,
        },
        {
          src: "/(favicon\\.svg|manifest\\.json|.*\\.(png|jpg|jpeg|webp|avif|woff2?))",
          headers: { "cache-control": "public, max-age=86400, must-revalidate" },
          continue: true,
        },
        // Blogul e pre-randat ca fișiere .html; URL-urile publice nu poartă extensia.
        // Regulile astea stau ÎNAINTE de `handle: filesystem` pentru că maparea fără extensie nu
        // e implicită în Build Output API — fără ele, /blog/<slug> ar cădea în fallback-ul SPA și
        // ar servi shell-ul aplicației cu status 200, adică o pagină goală pentru crawlere.
        { src: "/blog/?$", dest: "/blog/index.html" },
        { src: "/blog/([^/.]+)/?$", dest: "/blog/$1.html" },
        { handle: "filesystem" },
        // Un fișier cu hash care NU există trebuie să dea 404, nu pagina SPA.
        // Bug 2026-08-29 („eroarea asta e mereu"): fără regula asta, `/assets/<chunk>.js` lipsă
        // cădea în fallback-ul de mai jos și primea `200` + index.html. Browserul refuza HTML-ul
        // ca modul → „Failed to fetch dynamically imported module", iar service worker-ul, văzând
        // un răspuns `ok`, îl cache-uia PERMANENT sub URL-ul de JavaScript — de unde caracterul
        // „mereu": hash-ul unui chunk nemodificat rămâne același la deploy-urile următoare, deci
        // se cerea la infinit exact intrarea otrăvită. Un 404 curat nu se cache-uiește și spune
        // adevărul: fila e veche, trebuie reîncărcată (src/lib/staleChunk.ts face asta singur).
        { src: "/assets/(.*)", status: 404 },
        {
          src: "/(.*)",
          dest: "/index.html",
          headers: { "cache-control": "no-cache" },
        },
      ],
    },
    null,
    2
  )
);

console.log("✅ Vercel Build Output ready (.vercel/output): bundled API + static frontend.");
