import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import path from "node:path";
import { app } from "./app";
import { contactRoutes } from "./routes/contacts";

/**
 * LOCAL DEV ONLY — not committed, not used in prod.
 *
 * The shared `app` (server/app.ts) is owned/rewritten by the autopilot orchestrator
 * and currently does NOT mount the CRM-114 contacts route, so the lead detail page
 * crashes (`/api/leads/:id/contacts` falls through to the SPA HTML fallback).
 *
 * This entry mounts the contacts route on top of the shared app — BEFORE the static
 * + SPA fallback below — so a server restart keeps the lead page working without us
 * editing the contested app.ts. Delete once app.ts mounts contacts itself.
 */
app.route("/api", contactRoutes); // /api/leads/:id/contacts/...

const distDir = path.resolve(process.cwd(), "dist");
if (existsSync(distDir)) {
  console.log(`📦 Serving frontend from ${distDir}`);
  app.use("/*", serveStatic({ root: "./dist" }));
  app.notFound(async (c) => {
    const indexPath = path.join(distDir, "index.html");
    if (existsSync(indexPath)) {
      const html = await import("node:fs/promises").then((fs) => fs.readFile(indexPath, "utf8"));
      return c.html(html);
    }
    return c.text("Not found", 404);
  });
}

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 Vector Learn (dev+contacts) running on http://localhost:${info.port}`);
});
