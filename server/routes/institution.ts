/**
 * INST-001: Institution type API
 * GET   /api/settings/institution — current tenant's institution type
 * PATCH /api/settings/institution — update it (gradinita | scoala | mixt)
 *
 * Kept as its own tiny route (not folded into tenantSettings) so it has no
 * dependency on columns that route references.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { tenants } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const institutionRoutes = new Hono<{ Variables: AuthVariables }>();

institutionRoutes.use("*", requireAuth);

const institutionTypeSchema = z.object({
  institutionType: z.enum(["gradinita", "scoala", "mixt"]),
});

institutionRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const [t] = await db
    .select({ institutionType: tenants.institutionType })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!t) return c.json({ error: "not_found" }, 404);
  return c.json({ institutionType: t.institutionType });
});

institutionRoutes.patch("/", zValidator("json", institutionTypeSchema), async (c) => {
  const user = c.get("user");
  // Only admins/managers may change which modules the whole workspace shows.
  if (user.role !== "admin" && user.role !== "manager") {
    return c.json({ error: "forbidden" }, 403);
  }
  const { institutionType } = c.req.valid("json");
  const [updated] = await db
    .update(tenants)
    .set({ institutionType, updatedAt: new Date() })
    .where(eq(tenants.id, user.tenantId))
    .returning({ institutionType: tenants.institutionType });
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ institutionType: updated.institutionType });
});
