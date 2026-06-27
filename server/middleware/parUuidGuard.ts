import type { MiddlewareHandler } from "hono";

/**
 * UUID path-param guard for PAR routers.
 *
 * Several PAR routers are mounted at the bare `/api/par` prefix and expose `/:id/...` routes.
 * A request whose first segment is a literal word rather than a UUID (e.g. `GET /api/par/payments`,
 * `GET /api/par/foo/timeline`) falls through to one of these `/:id` handlers, which then runs a
 * Postgres query with the word as a uuid → "invalid input syntax for type uuid" → 500.
 *
 * Two commits already patched this inline for `GET /:id` (par.ts) and `/:id/match` (parPayments.ts),
 * but every sibling route on the same routers still 500s. This middleware closes the whole class.
 *
 * IMPORTANT: it must be registered with a path pattern that NAMES the param it should validate, e.g.
 *   router.use("/:id/*", parUuidGuard("id"));
 *   router.use("/:id",   parUuidGuard("id"));
 *   router.use("/:parId/*", parUuidGuard("parId"));
 * A wildcard registration (`router.use("*", parUuidGuard())`) does NOT work — Hono only exposes a
 * param to a middleware whose own matching pattern declares it. Literal sibling routes (`/inbox`,
 * `/finance`, `/bulk-approve`) are single-segment and never match `/:id/*`, so they stay untouched.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parUuidGuard(paramName = "id"): MiddlewareHandler {
  return async (c, next) => {
    const value = c.req.param(paramName);
    if (value !== undefined && !UUID_RE.test(value)) {
      return c.json({ error: "not_found" }, 404);
    }
    return next();
  };
}
