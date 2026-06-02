import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, desc, or, ilike } from "drizzle-orm";
import { db } from "../db/client";
import { companyClients } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getCompanyByIdno, RegistryError } from "../lib/companyRegistry";

/**
 * CONT-PLATA: saved counterparties (clients/payers), per tenant.
 *   GET    /api/company-clients?q=        → list (optional name/idno filter)
 *   POST   /api/company-clients           → save a client manually
 *   POST   /api/company-clients/import    → import from the registry by IDNO
 *   GET    /api/company-clients/:id        → one
 *   PATCH  /api/company-clients/:id        → edit
 *   DELETE /api/company-clients/:id        → remove
 */
export const companyClientRoutes = new Hono<{ Variables: AuthVariables }>();

companyClientRoutes.use("*", requireAuth);

const clientSchema = z.object({
  idno: z.string().max(32).optional().nullable(),
  name: z.string().min(1).max(500),
  legalForm: z.string().max(255).optional().nullable(),
  status: z.string().max(64).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(255).optional().nullable(),
  cuatmCode: z.string().max(32).optional().nullable(),
  email: z.string().max(255).optional().nullable(),
  phone: z.string().max(64).optional().nullable(),
});

companyClientRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const q = (c.req.query("q") ?? "").trim();
  const where = q
    ? and(
        eq(companyClients.tenantId, tenantId),
        or(ilike(companyClients.name, `%${q}%`), ilike(companyClients.idno, `%${q}%`))
      )
    : eq(companyClients.tenantId, tenantId);
  const rows = await db
    .select()
    .from(companyClients)
    .where(where)
    .orderBy(desc(companyClients.updatedAt))
    .limit(200);
  return c.json({ data: rows });
});

companyClientRoutes.post("/", zValidator("json", clientSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  const [created] = await db
    .insert(companyClients)
    .values({ ...body, tenantId })
    .returning();
  return c.json({ data: created }, 201);
});

const importSchema = z.object({ idno: z.string().min(1).max(32) });

companyClientRoutes.post("/import", zValidator("json", importSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { idno } = c.req.valid("json");

  let detail;
  try {
    detail = await getCompanyByIdno(idno);
  } catch (err) {
    if (err instanceof RegistryError) {
      return c.json({ error: err.message }, err.status === 404 ? 404 : 502);
    }
    return c.json({ error: "registry_error" }, 502);
  }

  // Reuse an existing saved client with the same IDNO rather than duplicating.
  const [existing] = await db
    .select()
    .from(companyClients)
    .where(and(eq(companyClients.tenantId, tenantId), eq(companyClients.idno, idno)))
    .limit(1);

  const values = {
    name: detail.name,
    legalForm: detail.legalForm,
    status: detail.status,
    address: detail.address,
    city: detail.city,
    cuatmCode: detail.cuatmCode,
    email: detail.contacts.emails[0] ?? null,
    phone: detail.contacts.phones[0] ?? null,
    registrySnapshot: detail as unknown,
    updatedAt: new Date(),
  };

  if (existing) {
    const [updated] = await db
      .update(companyClients)
      .set(values)
      .where(eq(companyClients.id, existing.id))
      .returning();
    return c.json({ data: updated });
  }

  const [created] = await db
    .insert(companyClients)
    .values({ tenantId, idno, ...values })
    .returning();
  return c.json({ data: created }, 201);
});

companyClientRoutes.get("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const [row] = await db
    .select()
    .from(companyClients)
    .where(and(eq(companyClients.id, c.req.param("id")), eq(companyClients.tenantId, tenantId)))
    .limit(1);
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ data: row });
});

companyClientRoutes.patch("/:id", zValidator("json", clientSchema.partial()), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  const [updated] = await db
    .update(companyClients)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(companyClients.id, c.req.param("id")), eq(companyClients.tenantId, tenantId)))
    .returning();
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json({ data: updated });
});

companyClientRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const [deleted] = await db
    .delete(companyClients)
    .where(and(eq(companyClients.id, c.req.param("id")), eq(companyClients.tenantId, tenantId)))
    .returning({ id: companyClients.id });
  if (!deleted) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
