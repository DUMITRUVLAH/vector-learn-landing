import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { compress } from "hono/compress";
import { existsSync } from "node:fs";
import path from "node:path";
import { app } from "./app";

/**
 * Local single-port Node server. Reuses the SHARED `app` from server/app.ts (the same router
 * Vercel runs via vercel-entry.ts) and only adds static-file serving + SPA fallback + the port
 * binding. This file used to redefine its OWN `new Hono()` mounting only 8 of 56 routes and still
 * had the `.rows` portability bug — a drift hazard (architecture #2 / database). It now has no
 * route definitions of its own, so there is exactly one route list and `dev-entry-contacts.ts`
 * (the throwaway "mount contacts on top of app" hack) is obsolete.
 */

const distDir = path.resolve(process.cwd(), "dist");
if (existsSync(distDir)) {
  console.log(`📦 Serving frontend from ${distDir}`);
  // PERF-001: comprimă răspunsurile text (JS/CSS/HTML/JSON). Bundle-ul de 3 MB pleca necomprimat
  // pe firul local, ceea ce făcea ca măsurătorile locale să nu semene deloc cu prod-ul.
  // `compress()` sare singur peste ce e deja comprimat (imagini, fonturi woff2).
  app.use("/*", compress());
  app.use("/*", serveStatic({ root: "./dist" }));
  app.notFound(async (c) => {
    const indexPath = path.join(distDir, "index.html");
    if (existsSync(indexPath)) {
      const html = await import("node:fs/promises").then((fs) => fs.readFile(indexPath, "utf8"));
      // PERF-001: shell-ul SPA trebuie revalidat la fiecare cerere. Dacă ar fi cache-uit, un
      // deploy nou n-ar mai fi văzut: browserul ar servi HTML vechi care indică bundle-uri
      // șterse → ecran alb până la golirea manuală a cache-ului.
      c.header("Cache-Control", "no-cache");
      return c.html(html);
    }
    return c.text("Not found", 404);
  });
}

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 Vector Learn running on http://localhost:${info.port}`);
});

export default app;
