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
    // exceljs is used only by the PAR Excel export (server/routes/parReports.ts). It pulls in
    // optional native/stream deps esbuild struggles to bundle; mark external so it resolves at runtime.
    "exceljs",
    // pdfjs-dist (server/lib/ai/pdfText.ts) reads the text layer of uploaded PDFs (bank statements,
    // invoices). When BUNDLED by esbuild, the dynamic import("pdfjs-dist/legacy/build/pdf.mjs")
    // breaks on Vercel → extractPdfText() silently returns "" → statements extract 0 transactions.
    // Externalize so it resolves from node_modules at runtime (same fix as exceljs/playwright).
    "pdfjs-dist",
  ],
  // Provide a CJS require for any externalized require() calls in the ESM output.
  banner: {
    js: "import{createRequire as ___cr}from'node:module';const require=___cr(import.meta.url);",
  },
  logLevel: "info",
});

// 2b. Copy runtime-required externalized packages into the function's node_modules.
// Externalized deps are NOT bundled, so they must physically exist next to the function
// or `import("pkg")` throws ERR_MODULE_NOT_FOUND at runtime. pdfjs-dist MUST run on Vercel
// (it extracts the text layer of uploaded PDFs), so copy it + its lone dep.
const RUNTIME_DEPS = ["pdfjs-dist"];
for (const dep of RUNTIME_DEPS) {
  const src = `node_modules/${dep}`;
  if (existsSync(src)) {
    cpSync(src, `${FN}/node_modules/${dep}`, { recursive: true, dereference: true });
    console.log(`  ↳ copied ${dep} into function node_modules`);
  } else {
    console.warn(`  ⚠ ${dep} not found in node_modules — runtime import will fail`);
  }
}

writeFileSync(
  `${FN}/.vc-config.json`,
  // shouldAddHelpers MUST be false. With it true, Vercel's Node launcher pre-reads the request
  // body to populate req.body — which drains the stream before Hono's getRequestListener builds
  // the Web Request. Hono's c.req.json() then waits forever for an already-consumed body, so
  // EVERY POST (login, signup, …) hangs 30s → FUNCTION_INVOCATION_TIMEOUT. GET routes were fine
  // because they have no body. Disabling helpers lets Hono read the raw request stream itself.
  JSON.stringify({ runtime: "nodejs20.x", handler: "index.mjs", launcherType: "Nodejs", shouldAddHelpers: false, maxDuration: 30 }, null, 2)
);

// 3. Routing: /api/* → the function; everything else → static (SPA index for unknown paths)
writeFileSync(
  `${OUT}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/api/(.*)", dest: "/api" },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2
  )
);

console.log("✅ Vercel Build Output ready (.vercel/output): bundled API + static frontend.");
