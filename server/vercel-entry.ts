import { getRequestListener } from "@hono/node-server";
import app from "./app";

/**
 * Vercel serverless entry for the whole API.
 *
 * IMPORTANT: this file lives in `server/`, NOT in a root `api/` folder. A root `api/`
 * directory triggers Vercel's zero-config @vercel/node detection, which transpiles the
 * entry WITHOUT bundling — so its extensionless imports (`./app`, `./routes/*`) fail at
 * runtime with ERR_MODULE_NOT_FOUND ('Cannot find module /var/task/server/app'), 500ing
 * every /api/* request. Keeping the entry out of `api/` lets the Build Output API in
 * scripts/build-vercel.mjs be the sole source of truth: it esbuild-bundles everything
 * into one self-contained .vercel/output function with no runtime relative-import resolution.
 *
 * Uses @hono/node-server's `getRequestListener` — a real Node (req, res) handler that
 * reads the request, runs the Hono app, and writes the Web Response back to res. This is
 * what the Vercel Node launcher (Build Output API, launcherType: Nodejs) expects.
 * (hono/vercel's `handle()` returns a Web Response the Node launcher doesn't write, which
 * left the function hanging → 504.)
 *
 * config.json (built by scripts/build-vercel.mjs) rewrites every /api/* request to this
 * function. Node runtime — Postgres needs TCP.
 */
export default getRequestListener(app.fetch);
