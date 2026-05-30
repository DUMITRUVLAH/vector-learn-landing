import { getRequestListener } from "@hono/node-server";
import app from "../server/app";

/**
 * Vercel serverless entry for the whole API.
 *
 * Uses @hono/node-server's `getRequestListener` — a real Node (req, res) handler that
 * reads the request, runs the Hono app, and writes the Web Response back to res. This is
 * what the Vercel Node launcher (Build Output API, launcherType: Nodejs) expects.
 * (hono/vercel's `handle()` returns a Web Response the Node launcher doesn't write, which
 * left the function hanging → 504.)
 *
 * The bundle (scripts/build-vercel.mjs) inlines all server code; vercel.json/config.json
 * rewrites every /api/* request to this function. Node runtime — Postgres needs TCP.
 */
export default getRequestListener(app.fetch);
