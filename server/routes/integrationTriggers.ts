/**
 * INT-903: Zapier-compatible REST triggers.
 *
 * Zapier polling triggers hit these endpoints every ~15 minutes.
 * They return the most recent N records in a stable format.
 * Authentication: X-API-Key header (INT-901 middleware).
 *
 * --- Connecting Zapier (instructions) ---
 * 1. In Zapier: New Zap → Trigger → Webhooks by Zapier (OR use custom integration)
 * 2. Choose "Polling" mode
 * 3. URL: https://your-app.vercel.app/api/integrations/triggers/leads
 * 4. Auth method: Custom Request Headers → Key: X-API-Key  Value: <your API key>
 * 5. Test & enable. Zapier will poll every 15 min for new leads.
 *
 * Alternatively, use the outbound webhooks (INT-902) for push instead of poll.
 */

import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { leads, payments } from "../db/schema";
import { requireApiKey, getAuthUser } from "../middleware/requireApiKey";
import type { AuthVariables } from "../middleware/requireAuth";

export const integrationTriggersRoutes = new Hono<{ Variables: AuthVariables }>();

// All trigger endpoints require API key (or session — requireApiKey also accepts session via requireAuthOrApiKey,
// but triggers are typically called headlessly so requireApiKey is appropriate here).
integrationTriggersRoutes.use("/*", requireApiKey);

/**
 * GET /api/integrations/triggers/leads
 *
 * Zapier polling trigger: returns the 10 most recently created leads for the tenant.
 * Each lead includes id, fullName, email, phone, interestCourse, source, stage, createdAt.
 * The `id` field is used by Zapier as the deduplication key.
 */
integrationTriggersRoutes.get("/leads", async (c) => {
  const user = getAuthUser(c);

  const rows = await db
    .select({
      id: leads.id,
      fullName: leads.fullName,
      email: leads.email,
      phone: leads.phone,
      interestCourse: leads.interestCourse,
      source: leads.source,
      stage: leads.stage,
      assignedTo: leads.assignedTo,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
    })
    .from(leads)
    .where(eq(leads.tenantId, user.tenantId))
    .orderBy(desc(leads.createdAt))
    .limit(10);

  return c.json(rows);
});

/**
 * GET /api/integrations/triggers/payments
 *
 * Zapier polling trigger: returns the 10 most recently recorded payments.
 * Each payment includes id, studentId, amountCents, currency, method, status, paidAt, createdAt.
 * The `id` field is the Zapier deduplication key.
 */
integrationTriggersRoutes.get("/payments", async (c) => {
  const user = getAuthUser(c);

  const rows = await db
    .select({
      id: payments.id,
      studentId: payments.studentId,
      amountCents: payments.amountCents,
      currency: payments.currency,
      status: payments.status,
      description: payments.description,
      paidAt: payments.paidAt,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .where(eq(payments.tenantId, user.tenantId))
    .orderBy(desc(payments.createdAt))
    .limit(10);

  return c.json(rows);
});
