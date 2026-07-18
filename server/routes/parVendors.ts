/**
 * PAR-003: Vendor / Payee registry CRUD
 * GET/POST/PATCH/DELETE /api/par/vendors
 * GDPR-sensitive: IDNP + IBAN.
 * Validates IBAN (mod-97) + IDNP (13 digits) on write.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, ilike, or } from "drizzle-orm";
import { db } from "../db/client";
import { parVendors } from "../db/schema/par";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { isValidMoldovaIBAN, isValidIDNP } from "../lib/par/validators";
import { parUuidGuard } from "../middleware/parUuidGuard";

export const parVendorsRoutes = new Hono<{ Variables: AuthVariables }>();
parVendorsRoutes.use("*", requireAuth);
parVendorsRoutes.use("/:id", parUuidGuard("id"));

const vendorSchema = z.object({
  name: z.string().min(1).max(300),
  idnp: z.string().max(13).optional().nullable(),
  iban: z.string().max(34).optional().nullable(),
  bank: z.string().max(300).optional().nullable(),
  bic_swift: z.string().max(32).optional().nullable(),
  bank_account: z.string().max(100).optional().nullable(),
  bank_account_currency: z.string().length(3).optional().nullable(),
  legal_address: z.string().max(1000).optional().nullable(),
  contact_name: z.string().max(300).optional().nullable(),
  contact_phone: z.string().max(100).optional().nullable(),
  contact_email: z.string().email().max(255).optional().nullable(),
  administrator_name: z.string().max(300).optional().nullable(),
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
// PARQA-005 (GDPR): the vendor registry exposes IDNP (13-digit national ID) + IBAN. Reading it
// requires a PAR role too — a tenant user with NO PAR role (e.g. an invited "teacher" account)
// must not be able to enumerate beneficiary bank data. (Matches the write routes below.)
parVendorsRoutes.get("/", requirePARRole("requestor", "approver", "finance", "par_admin"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const q = c.req.query("q")?.trim();
  const conditions = [eq(parVendors.tenantId, tenantId), eq(parVendors.active, true)];
  if (q) {
    const match = or(ilike(parVendors.name, `%${q}%`), ilike(parVendors.idnp, `%${q}%`), ilike(parVendors.iban, `%${q}%`));
    if (match) conditions.push(match);
  }
  const rows = await db
    .select()
    .from(parVendors)
    .where(and(...conditions))
    .orderBy(asc(parVendors.name));
  return c.json({ vendors: rows });
});

/** POST */
parVendorsRoutes.post(
  "/",
  // PARQA-005 (GDPR): the vendor registry holds IDNP + IBAN. Writing requires a PAR role — a
  // requestor legitimately adds a payee inline while creating a PAR, so all four roles are allowed,
  // but a tenant user with NO PAR role (e.g. an invited "teacher" account) cannot write bank data.
  requirePARRole("requestor", "approver", "finance", "par_admin"),
  zValidator("json", vendorSchema),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");

    const validation = validateVendorFields(body);
    if (!validation.ok) return c.json({ error: validation.error }, 400);

    // VM1-05: dedup by IBAN (normalized) so saving the same beneficiary repeatedly — whether typed
    // manually or filled by AI — links to the existing registry entry instead of creating duplicates.
    // Backfill any fields the existing record was missing. Returns 200 (existing) vs 201 (created).
    const normIban = body.iban ? body.iban.replace(/\s/g, "").toUpperCase() : null;
    if (normIban) {
      const existing = await db
        .select()
        .from(parVendors)
        .where(and(eq(parVendors.tenantId, tenantId), eq(parVendors.iban, normIban)))
        .limit(1);
      if (existing[0]) {
        const e = existing[0];
        const patch: Record<string, unknown> = {};
        if (!e.idnp && body.idnp) patch.idnp = body.idnp;
        if (!e.bank && body.bank) patch.bank = body.bank;
        if (!e.bicSwift && body.bic_swift) patch.bicSwift = body.bic_swift;
        if (!e.bankAccount && body.bank_account) patch.bankAccount = body.bank_account;
        if (!e.bankAccountCurrency && body.bank_account_currency) patch.bankAccountCurrency = body.bank_account_currency;
        if (!e.legalAddress && body.legal_address) patch.legalAddress = body.legal_address;
        if (!e.contactName && body.contact_name) patch.contactName = body.contact_name;
        if (!e.contactPhone && body.contact_phone) patch.contactPhone = body.contact_phone;
        if (!e.contactEmail && body.contact_email) patch.contactEmail = body.contact_email;
        if (!e.administratorName && body.administrator_name) patch.administratorName = body.administrator_name;
        if (!e.active) patch.active = true;
        if (Object.keys(patch).length) {
          const [updated] = await db
            .update(parVendors)
            .set({ ...patch, updatedAt: new Date() })
            .where(and(eq(parVendors.id, e.id), eq(parVendors.tenantId, tenantId)))
            .returning();
          return c.json(updated, 200);
        }
        return c.json(e, 200);
      }
    }

    const [row] = await db
      .insert(parVendors)
      .values({
        tenantId,
        name: body.name,
        idnp: body.idnp ?? null,
        iban: normIban,
        bank: body.bank ?? null,
        bicSwift: body.bic_swift ?? null,
        bankAccount: body.bank_account ?? null,
        bankAccountCurrency: body.bank_account_currency ?? null,
        legalAddress: body.legal_address ?? null,
        contactName: body.contact_name ?? null,
        contactPhone: body.contact_phone ?? null,
        contactEmail: body.contact_email ?? null,
        administratorName: body.administrator_name ?? null,
        notes: body.notes ?? null,
      })
      .returning();
    return c.json(row, 201);
  }
);

/** PATCH /:id */
parVendorsRoutes.patch(
  "/:id",
  // PARQA-005 (GDPR/fraud): editing an existing beneficiary's bank details (IBAN/IDNP) is the sharp
  // risk — changing an IBAN redirects money. Restrict to par_admin (matches DELETE). Only the admin
  // Vendors UI calls this; the requestor create flow always POSTs (dedup backfills, never PATCHes).
  requirePARRole("par_admin"),
  zValidator("json", vendorSchema.partial()),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const validation = validateVendorFields(body);
    if (!validation.ok) return c.json({ error: validation.error }, 400);

    const update = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.idnp !== undefined ? { idnp: body.idnp } : {}),
      ...(body.iban !== undefined ? { iban: body.iban?.replace(/\s/g, "").toUpperCase() ?? null } : {}),
      ...(body.bank !== undefined ? { bank: body.bank } : {}),
      ...(body.bic_swift !== undefined ? { bicSwift: body.bic_swift } : {}),
      ...(body.bank_account !== undefined ? { bankAccount: body.bank_account } : {}),
      ...(body.bank_account_currency !== undefined ? { bankAccountCurrency: body.bank_account_currency } : {}),
      ...(body.legal_address !== undefined ? { legalAddress: body.legal_address } : {}),
      ...(body.contact_name !== undefined ? { contactName: body.contact_name } : {}),
      ...(body.contact_phone !== undefined ? { contactPhone: body.contact_phone } : {}),
      ...(body.contact_email !== undefined ? { contactEmail: body.contact_email } : {}),
      ...(body.administrator_name !== undefined ? { administratorName: body.administrator_name } : {}),
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
      updatedAt: new Date(),
    };
    const [row] = await db
      .update(parVendors)
      .set(update)
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
