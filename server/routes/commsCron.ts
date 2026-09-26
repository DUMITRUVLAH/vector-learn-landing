/**
 * COMMS-301 — cronul zilnic al modulului de comunicare. Montat la /api/comms/cron.
 *
 *   GET /daily  (Authorization: Bearer <CRON_SECRET>, ca /api/crm/cron/daily)
 *     1. reînnoiește `users.watch` pe fiecare cutie Gmail (expiră după 7 zile — Google recomandă zilnic);
 *     2. rulează sincronizarea Gmail ca plasă de siguranță (Google: notificările „pot întârzia sau lipsi");
 *     3. curăță jurnalul de webhook-uri mai vechi de 14 zile.
 */
import { Hono } from "hono";
import { and, eq, lt } from "drizzle-orm";
import { db } from "../db/client";
import { commChannels, commWebhookEvents } from "../db/schema/comms";
import { ensureGmailWatch, syncGmailChannel } from "../lib/comms/gmailService";

export const commsCronRoutes = new Hono();

commsCronRoutes.get("/daily", async (c) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) return c.json({ error: "cron_not_configured", detail: "CRON_SECRET env var is not set." }, 503);
  if ((c.req.header("authorization") ?? "") !== `Bearer ${secret}`) return c.json({ error: "unauthorized" }, 401);

  const mailboxes = await db
    .select()
    .from(commChannels)
    .where(and(eq(commChannels.kind, "gmail"), eq(commChannels.status, "active")));
  let watched = 0;
  let synced = 0;
  let failed = 0;
  for (const ch of mailboxes) {
    if ((ch.config as Record<string, unknown>)?.mock === true) continue;
    try {
      if (await ensureGmailWatch(ch)) watched++;
      await syncGmailChannel(ch.id);
      synced++;
    } catch (e) {
      failed++;
      console.error("[comms/cron] cutia", ch.id, e instanceof Error ? e.message : e);
    }
  }

  const cutoff = new Date(Date.now() - 14 * 86_400_000);
  await db.delete(commWebhookEvents).where(lt(commWebhookEvents.receivedAt, cutoff));

  return c.json({ ok: true, gmail: { mailboxes: mailboxes.length, watched, synced, failed } });
});
