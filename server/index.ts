import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import path from "node:path";
import { app } from "./app";

/**
 * Local / container single-port server: the shared Hono `app` (API) + static
 * frontend (dist) on one port. On Vercel the API runs via server/vercel-entry.ts
 * and the static frontend is served by Vercel's CDN, so this file is not used there.
 */
const distDir = path.resolve(process.cwd(), "dist");
if (existsSync(distDir)) {
  console.log(`📦 Serving frontend from ${distDir}`);
  app.use("/*", serveStatic({ root: "./dist" }));
  // SPA fallback: any unknown path returns index.html
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
  console.log(`🚀 Vector Learn running on http://localhost:${info.port}`);
});

export default app;
