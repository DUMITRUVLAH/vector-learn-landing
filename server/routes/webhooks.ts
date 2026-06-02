/**
 * INT-902: Webhook endpoint management routes.
 *
 * POST   /api/settings/webhooks          → register endpoint
 * GET    /api/settings/webhooks          → list endpoints
 * GET    /api/settings/webhooks/:id/deliveries → delivery history
 * DELETE /api/settings/webhooks/:id     → delete endpoint
 * PATCH  /api/settings/webhooks/:id     → toggle active
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { db } from "../db/client";
import { webhookEndpoints, webhookDeliveries } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const ALL_EVENTS = ["lead.created", "lead.updated", "student.enrolled", "payment.received"] as const;
type WebhookEventType = (typeof ALL_EVENTS)[number];

const createEndpointSchema = z.object({
  url: z.string().url().max(2048),
  events: z
    .array(z.enum(ALL_EVENTS))
    .optional()
    .default([]),
  /** If not provided, a secret is auto-generated */
  secret: z.string().min(16).max(255).optional(),
});

const updateEndpointSchema = z.object({
  active: z.boolean().optional(),
  events: z.array(z.enum(ALL_EVENTS)).optional(),
});

export const webhookRoutes = new Hono<{ Variables: AuthVariables }>();
webhookRoutes.use("/*", requireAuth);

/**
 * POST /api/settings/webhooks
 * Body: { url, events?, secret? }
 * Returns: { id, url, events, secret, active, createdAt }
 * Note: secret is returned in clear HERE for the user to save; not shown again.
 */
webhookRoutes.post("/", zValidator("json", createEndpointSchema), async (c) => {
  const body = c.req.valid("json");
  const user = c.get("user");

  const secret = body.secret ?? randomBytes(32).toString("base64url");

  const [created] = await db
    .insert(webhookEndpoints)
    .values({
      tenantId: user.tenantId,
      url: body.url,
      secret,
      events: body.events && body.events.length > 0 ? body.events : null,
      active: true,
    })
    .returning();

  return c.json(
    {
      id: created.id,
      url: created.url,
      events: (created.events as WebhookEventType[] | null) ?? [],
      active: created.active,
      createdAt: created.createdAt,
      secret, // shown once for user to verify signature
    },
    201
  );
});

/**
 * GET /api/settings/webhooks
 * Returns array of endpoints for the tenant.
 */
webhookRoutes.get("/", async (c) => {
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

  return c.json(
    rows.map((r) => ({
      ...r,
      events: (r.events as WebhookEventType[] | null) ?? [],
    }))
  );
});

/**
 * GET /api/settings/webhooks/:id/deliveries
 * Returns recent deliveries for the endpoint.
 */
webhookRoutes.get("/:id/deliveries", async (c) => {
  const user = c.get("user");
  const endpointId = c.req.param("id");

  // Verify ownership
  const ep = await db.query.webhookEndpoints.findFirst({
    where: and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.tenantId, user.tenantId)),
  });
  if (!ep) return c.json({ error: "not_found" }, 404);

  const deliveries = await db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.endpointId, endpointId))
    .orderBy(desc(webhookDeliveries.createdAt))
    .limit(50);

  return c.json(deliveries);
});

/**
 * PATCH /api/settings/webhooks/:id
 * Body: { active?, events? }
 */
webhookRoutes.patch("/:id", zValidator("json", updateEndpointSchema), async (c) => {
  const user = c.get("user");
  const endpointId = c.req.param("id");
  const body = c.req.valid("json");

  const existing = await db.query.webhookEndpoints.findFirst({
    where: and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.tenantId, user.tenantId)),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  const updateData: Partial<typeof webhookEndpoints.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.active !== undefined) updateData.active = body.active;
  if (body.events !== undefined) {
    updateData.events = body.events.length > 0 ? body.events : null;
  }

  await db.update(webhookEndpoints).set(updateData).where(eq(webhookEndpoints.id, endpointId));

  return c.json({ ok: true });
});

/**
 * DELETE /api/settings/webhooks/:id
 * Permanently removes the endpoint and all its deliveries (cascade).
 */
webhookRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const endpointId = c.req.param("id");

  const existing = await db.query.webhookEndpoints.findFirst({
    where: and(eq(webhookEndpoints.id, endpointId), eq(webhookEndpoints.tenantId, user.tenantId)),
  });
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(webhookEndpoints).where(eq(webhookEndpoints.id, endpointId));

  return c.json({ ok: true, id: endpointId });
});
