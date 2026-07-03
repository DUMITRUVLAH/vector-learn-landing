/**
 * AUTOBILL: the scheduled recurring-billing trigger.
 *
 * Vercel serverless can't self-schedule, so a Vercel Cron (vercel.json `crons`) hits
 * GET /api/fin/cron/run-recurring once a day. Vercel automatically attaches
 * `Authorization: Bearer <CRON_SECRET>` when the CRON_SECRET env var is set — we require it so
 * the endpoint can't be triggered by the public. It runs the cross-tenant auto-billing engine.
 *
 * A session-authenticated POST /run-now lets an owner trigger their OWN tenant on demand (test /
 * reassurance) without exposing the cross-tenant job.
 */
import { Hono } from "hono";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { runAutoBilling } from "../lib/fin/autoBillRunner";

export const finCronRoutes = new Hono<{ Variables: AuthVariables }>();

/** GET /api/fin/cron/run-recurring — Vercel Cron entrypoint (CRON_SECRET-gated, cross-tenant). */
finCronRoutes.get("/run-recurring", async (c) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return c.json({ error: "cron_not_configured", detail: "CRON_SECRET env var is not set." }, 503);
  }
  const auth = c.req.header("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return c.json({ error: "unauthorized" }, 401);
  }

  const summary = await runAutoBilling();
  return c.json({ ok: true, ...summary });
});

/** POST /api/fin/cron/run-now — session-authed, scoped to the caller's tenant (manual trigger). */
finCronRoutes.post("/run-now", requireAuth, async (c) => {
  const user = c.get("user");
  const summary = await runAutoBilling({ tenantId: user.tenantId });
  return c.json({ ok: true, ...summary });
});
