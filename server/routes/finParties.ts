/**
 * PARTY-002: FinDesk business partners API
 *
 * GET    /api/fin/parties                         → list parties (filterable)
 * GET    /api/fin/parties/:id                     → single party or 404
 * POST   /api/fin/parties                         → create party
 * PATCH  /api/fin/parties/:id                     → partial update
 * DELETE /api/fin/parties/:id                     → soft delete (isActive=false)
 * GET    /api/fin/parties/:id/contacts            → list contacts for party
 * POST   /api/fin/parties/:id/contacts            → add contact
 * DELETE /api/fin/parties/:id/contacts/:contactId → remove contact
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { finParties, finPartyContacts } from "../db/schema/finParties";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const finPartiesRoutes = new Hono<{ Variables: AuthVariables }>();

// All routes require authentication
finPartiesRoutes.use("/*", requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

/** IDNO validation: 13 numeric chars for MD; general CIF-like string for other countries */
const idnoRegex = /^[A-Z0-9]{1,13}$/i;

/** Basic IBAN format: 2 uppercase letters + 2 digits + 4-30 alphanumeric */
const ibanRegex = /^[A-Z]{2}\d{2}[A-Z0-9]{4,30}$/;

const createPartySchema = z.object({
  kind: z.enum(["client", "supplier", "both"]),
  name: z.string().min(1, "Denumirea este obligatorie").max(500),
  country: z.string().length(2, "Codul țării trebuie să fie ISO 3166-1 alpha-2 (ex: MD, RO)"),
  idno: z
    .string()
    .max(13, "IDNO/CIF nu poate depăși 13 caractere")
    .regex(idnoRegex, "IDNO/CIF conține caractere invalide")
    .optional()
    .nullable(),
  vatCode: z.string().max(20).optional().nullable(),
  iban: z
    .string()
    .regex(ibanRegex, "Format IBAN invalid (ex: MD24AG000225100013104168)")
    .optional()
    .nullable(),
  address: z.string().max(500).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  postalCode: z.string().max(20).optional().nullable(),
  email: z.string().email("Adresa de email este invalidă").optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  isActive: z.boolean().optional().default(true),
  notes: z.string().max(2000).optional().nullable(),
});

const updatePartySchema = createPartySchema.partial();

const createContactSchema = z.object({
  name: z.string().min(1, "Numele contactului este obligatoriu").max(300),
  role: z.string().max(100).optional().nullable(),
  email: z.string().email("Adresa de email este invalidă").optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  isPrimary: z.boolean().optional().default(false),
});

// ─── List parties ─────────────────────────────────────────────────────────────

/**
 * GET /api/fin/parties
 * Query params: kind, country, isActive (default "true"), search, limit (default 50), offset (default 0)
 */
finPartiesRoutes.get("/", async (c) => {
  const user = c.get("user");
  const {
    kind,
    country,
    isActive: isActiveParam,
    search,
    limit: limitParam,
    offset: offsetParam,
  } = c.req.query();

  const limit = Math.min(parseInt(limitParam ?? "50", 10) || 50, 200);
  const offset = parseInt(offsetParam ?? "0", 10) || 0;

  const conditions = [eq(finParties.tenantId, user.tenantId)];

  if (kind && ["client", "supplier", "both"].includes(kind)) {
    conditions.push(eq(finParties.kind, kind as "client" | "supplier" | "both"));
  }

  if (country) {
    conditions.push(eq(finParties.country, country.toUpperCase().slice(0, 2) as string));
  }

  // Default: return only active parties; pass isActive=false to include inactive
  if (isActiveParam !== "false") {
    conditions.push(eq(finParties.isActive, true));
  }

  if (search) {
    conditions.push(
      or(
        ilike(finParties.name, `%${search}%`),
        ilike(finParties.idno, `%${search}%`),
        ilike(finParties.city, `%${search}%`)
      )!
    );
  }

  const where = and(...conditions);

  const [rows, countResult] = await Promise.all([
    db.select().from(finParties).where(where).limit(limit).offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(finParties)
      .where(where),
  ]);

  return c.json({ data: rows, total: countResult[0]?.count ?? 0 });
});

// ─── Get single party ─────────────────────────────────────────────────────────

finPartiesRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const rows = await db
    .select()
    .from(finParties)
    .where(and(eq(finParties.id, id), eq(finParties.tenantId, user.tenantId)))
    .limit(1);

  if (rows.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  return c.json({ data: rows[0] });
});

// ─── Create party ─────────────────────────────────────────────────────────────

finPartiesRoutes.post("/", zValidator("json", createPartySchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const [created] = await db
    .insert(finParties)
    .values({
      tenantId: user.tenantId,
      kind: body.kind,
      name: body.name,
      country: body.country.toUpperCase(),
      idno: body.idno ?? null,
      vatCode: body.vatCode ?? null,
      iban: body.iban ?? null,
      address: body.address ?? null,
      city: body.city ?? null,
      postalCode: body.postalCode ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      isActive: body.isActive ?? true,
      notes: body.notes ?? null,
    })
    .returning();

  return c.json({ data: created }, 201);
});

// ─── Partial update ───────────────────────────────────────────────────────────

finPartiesRoutes.patch("/:id", zValidator("json", updatePartySchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  // Check ownership
  const existing = await db
    .select({ id: finParties.id })
    .from(finParties)
    .where(and(eq(finParties.id, id), eq(finParties.tenantId, user.tenantId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  const updateData: Partial<typeof finParties.$inferInsert> = {};
  if (body.kind !== undefined) updateData.kind = body.kind;
  if (body.name !== undefined) updateData.name = body.name;
  if (body.country !== undefined) updateData.country = body.country.toUpperCase();
  if (body.idno !== undefined) updateData.idno = body.idno ?? null;
  if (body.vatCode !== undefined) updateData.vatCode = body.vatCode ?? null;
  if (body.iban !== undefined) updateData.iban = body.iban ?? null;
  if (body.address !== undefined) updateData.address = body.address ?? null;
  if (body.city !== undefined) updateData.city = body.city ?? null;
  if (body.postalCode !== undefined) updateData.postalCode = body.postalCode ?? null;
  if (body.email !== undefined) updateData.email = body.email ?? null;
  if (body.phone !== undefined) updateData.phone = body.phone ?? null;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;
  if (body.notes !== undefined) updateData.notes = body.notes ?? null;

  if (Object.keys(updateData).length === 0) {
    return c.json({ error: "no_fields_to_update" }, 422);
  }

  updateData.updatedAt = new Date();

  const [updated] = await db
    .update(finParties)
    .set(updateData)
    .where(and(eq(finParties.id, id), eq(finParties.tenantId, user.tenantId)))
    .returning();

  return c.json({ data: updated });
});

// ─── Soft delete ──────────────────────────────────────────────────────────────

finPartiesRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const existing = await db
    .select({ id: finParties.id })
    .from(finParties)
    .where(and(eq(finParties.id, id), eq(finParties.tenantId, user.tenantId)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  await db
    .update(finParties)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(finParties.id, id), eq(finParties.tenantId, user.tenantId)));

  return c.json({ success: true });
});

// ─── Contacts: list ───────────────────────────────────────────────────────────

finPartiesRoutes.get("/:id/contacts", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  // Verify party belongs to tenant
  const party = await db
    .select({ id: finParties.id })
    .from(finParties)
    .where(and(eq(finParties.id, id), eq(finParties.tenantId, user.tenantId)))
    .limit(1);

  if (party.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  const contacts = await db
    .select()
    .from(finPartyContacts)
    .where(eq(finPartyContacts.partyId, id));

  return c.json({ data: contacts });
});

// ─── Contacts: add ────────────────────────────────────────────────────────────

finPartiesRoutes.post("/:id/contacts", zValidator("json", createContactSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  // Verify party belongs to tenant
  const party = await db
    .select({ id: finParties.id })
    .from(finParties)
    .where(and(eq(finParties.id, id), eq(finParties.tenantId, user.tenantId)))
    .limit(1);

  if (party.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  const [created] = await db
    .insert(finPartyContacts)
    .values({
      partyId: id,
      name: body.name,
      role: body.role ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      isPrimary: body.isPrimary ?? false,
    })
    .returning();

  return c.json({ data: created }, 201);
});

// ─── Contacts: delete ─────────────────────────────────────────────────────────

finPartiesRoutes.delete("/:id/contacts/:contactId", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const contactId = c.req.param("contactId");

  // Verify party belongs to tenant
  const party = await db
    .select({ id: finParties.id })
    .from(finParties)
    .where(and(eq(finParties.id, id), eq(finParties.tenantId, user.tenantId)))
    .limit(1);

  if (party.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  const existing = await db
    .select({ id: finPartyContacts.id })
    .from(finPartyContacts)
    .where(and(eq(finPartyContacts.id, contactId), eq(finPartyContacts.partyId, id)))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ error: "not_found" }, 404);
  }

  await db.delete(finPartyContacts).where(eq(finPartyContacts.id, contactId));

  return c.json({ success: true });
});
