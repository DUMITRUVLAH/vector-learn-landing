/**
 * PAR-003: Vendor / Payee registry CRUD
 * GET/POST/PATCH/DELETE /api/par/vendors
 * GDPR-sensitive: IDNP + IBAN.
 * Validates IBAN (mod-97) + IDNP (13 digits) on write.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import { parVendors } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { isValidMoldovaIBAN, isValidIDNP } from "../lib/par/validators";

export const parVendorsRoutes = new Hono<{ Variables: AuthVariables }>();
parVendorsRoutes.use("*", requireAuth);

const vendorSchema = z.object({
  name: z.string().min(1).max(300),
  idnp: z.string().max(13).optional().nullable(),
  iban: z.string().max(34).optional().nullable(),
  bank: z.string().max(300).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});

function validateVendorFields(body: {
  idnp?: string | null;
  iban?: string | null;
}): { ok: false; error: string } | { ok: true } {
  if (body.idnp && !isValidIDNP(body.idnp)) {
    return { ok: false, error: "invalid_idnp: must be exactly 13 digits" };
  }
  if (body.iban && !isValidMoldovaIBAN(body.iban)) {
    return { ok: false, error: "invalid_iban: must be a valid MD IBAN (mod-97 checksum)" };
  }
  return { ok: true };
}

/** GET — list all active vendors */
parVendorsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db
    .select()
    .from(parVendors)
    .where(and(eq(parVendors.tenantId, tenantId), eq(parVendors.active, true)))
    .orderBy(asc(parVendors.name));
  return c.json({ vendors: rows });
});

/** POST */
parVendorsRoutes.post(
  "/",
  zValidator("json", vendorSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");

    const validation = validateVendorFields(body);
    if (!validation.ok) return c.json({ error: validation.error }, 400);

    const [row] = await db
      .insert(parVendors)
      .values({
        tenantId,
        name: body.name,
        idnp: body.idnp ?? null,
        iban: body.iban ?? null,
        bank: body.bank ?? null,
        notes: body.notes ?? null,
      })
      .returning();
    return c.json(row, 201);
  }
);

/** PATCH /:id */
parVendorsRoutes.patch(
  "/:id",
  zValidator("json", vendorSchema.partial()),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const validation = validateVendorFields(body);
    if (!validation.ok) return c.json({ error: validation.error }, 400);

    const [row] = await db
      .update(parVendors)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(parVendors.id, id), eq(parVendors.tenantId, tenantId)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

/** DELETE /:id — soft delete */
parVendorsRoutes.delete("/:id", requirePARRole("par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [row] = await db
    .update(parVendors)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(parVendors.id, id), eq(parVendors.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
