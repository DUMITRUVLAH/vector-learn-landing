/**
 * INT-902: Outbound webhook endpoint management routes.
 *
 * GET    /api/settings/webhooks                 → list endpoints (no secret in clear)
 * POST   /api/settings/webhooks                 → create endpoint (returns signing secret ONCE)
 * PATCH  /api/settings/webhooks/:id             → toggle active
 * DELETE /api/settings/webhooks/:id             → delete endpoint
 * GET    /api/settings/webhooks/:id/deliveries  → recent delivery log for an endpoint
 *
 * The frontend (src/lib/api/webhooks.ts) calls these; without this route mounted the
 * requests fell through to the SPA HTML fallback and the page crashed on JSON.parse
 * ("Unexpected token '<'"). Mirrors the api-keys route style (session auth, tenant scoping).
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../db/client";
import { webhookEndpoints, webhookDeliveries } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const WEBHOOK_EVENTS = [
  "lead.created",
  "lead.updated",
  "student.enrolled",
  "payment.received",
] as const;

const createSchema = z.object({
  url: z.string().url().max(2048),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});

const patchSchema = z.object({
  active: z.boolean(),
});

function generateSecret(): string {
  return `whsec_${randomBytes(24).toString("base64url")}`;
}

export const webhookSettingsRoutes = new Hono<{ Variables: AuthVariables }>();

webhookSettingsRoutes.use("/*", requireAuth);

/** GET /api/settings/webhooks — list endpoints (secret omitted). */
webhookSettingsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const rows = await db
    .select({
      id: webhookEndpoints.id,
      url: webhookEndpoints.url,
      events: webhookEndpoints.events,
      active: webhookEndpoints.active,
      createdAt: webhookEndpoints.createdAt,
      updatedAt: webhookEndpoints.updatedAt,
    })
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.tenantId, user.tenantId))
    .orderBy(desc(webhookEndpoints.createdAt));

  return c.json(rows.map((r) => ({ ...r, events: r.events ?? [] })));
});

/** POST /api/settings/webhooks — create. Returns the signing secret ONCE. */
webhookSettingsRoutes.post("/", zValidator("json", createSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  const secret = generateSecret();

  const [created] = await db
    .insert(webhookEndpoints)
    .values({
      tenantId: user.tenantId,
      url: body.url,
      secret,
      events: body.events,
    })
    .returning({
      id: webhookEndpoints.id,
      url: webhookEndpoints.url,
      events: webhookEndpoints.events,
      active: webhookEndpoints.active,
      createdAt: webhookEndpoints.createdAt,
      updatedAt: webhookEndpoints.updatedAt,
    });

  return c.json({ ...created, events: created.events ?? [], secret }, 201);
});

/** PATCH /api/settings/webhooks/:id — toggle active (tenant-scoped). */
webhookSettingsRoutes.patch("/:id", zValidator("json", patchSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { active } = c.req.valid("json");

  const existing = await db.query.webhookEndpoints.findFirst({
    where: and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, user.tenantId)),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db
    .update(webhookEndpoints)
    .set({ active, updatedAt: new Date() })
    .where(eq(webhookEndpoints.id, id));

  return c.json({ ok: true });
});

/** DELETE /api/settings/webhooks/:id — delete (tenant-scoped). */
webhookSettingsRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const existing = await db.query.webhookEndpoints.findFirst({
    where: and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, user.tenantId)),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, id));
  return c.json({ ok: true });
});

/** GET /api/settings/webhooks/:id/deliveries — recent delivery log (tenant-scoped, last 50). */
webhookSettingsRoutes.get("/:id/deliveries", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const endpoint = await db.query.webhookEndpoints.findFirst({
    where: and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.tenantId, user.tenantId)),
  });
  if (!endpoint) return c.json({ error: "not_found" }, 404);

  const rows = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(eq(webhookDeliveries.endpointId, id), eq(webhookDeliveries.tenantId, user.tenantId))
    )
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(50);

  return c.json(rows);
});
