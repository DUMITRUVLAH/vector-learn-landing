import { handle } from "hono/vercel";
import app from "../server/app";

/**
 * Vercel serverless entry for the whole API.
 * `vercel.json` rewrites every `/api/*` request to this function; Hono matches
 * the original `/api/...` path against the routes defined in server/app.ts.
 *
 * Node runtime (default) is required — the Postgres driver uses TCP sockets.
 */
export default handle(app);
