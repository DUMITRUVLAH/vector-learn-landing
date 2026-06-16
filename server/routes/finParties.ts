/**
 * PARTY-002/003/004: FinDesk business partners API
 *
 * GET    /api/fin/parties                              → list parties (filterable)
 * GET    /api/fin/parties/analytics/top-clients        → top-N clients by revenue (PARTY-004)
 * GET    /api/fin/parties/analytics/segments           → segment distribution VIP/Regular/New (PARTY-004)
 * GET    /api/fin/parties/:id                          → single party with segment field (PARTY-004)
 * GET    /api/fin/parties/:id/aging                    → real aging buckets (PARTY-004)
 * GET    /api/fin/parties/:id/metrics                  → legacy compat: revenue+balance+aging
 * POST   /api/fin/parties                              → create party
 * PATCH  /api/fin/parties/:id                         → partial update
 * DELETE /api/fin/parties/:id                         → soft delete (isActive=false)
 * GET    /api/fin/parties/:id/contacts                → list contacts for party
 * POST   /api/fin/parties/:id/contacts                → add contact
 * DELETE /api/fin/parties/:id/contacts/:contactId     → remove contact
 */

import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, ilike, or, sql, desc, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { finParties, finPartyContacts } from "../db/schema/finParties";
import { finInvoices } from "../db/schema/finInvoices";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

// ─── Segment computation ──────────────────────────────────────────────────────

/** VIP threshold: 50 000 MDL in cents. */
const VIP_THRESHOLD_CENTS = 5_000_000;

type Segment = "VIP" | "Regular" | "New";

/** Derive segment from cumulative paid revenue in cents. */
function computeSegment(totalRevenueCents: number, hasAnyInvoice: boolean): Segment {
  if (totalRevenueCents >= VIP_THRESHOLD_CENTS) return "VIP";
  if (hasAnyInvoice) return "Regular";
  return "New";
}

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

// ─── Analytics: top clients (PARTY-004) — must come before /:id ─────────────

/**
 * GET /api/fin/parties/analytics/top-clients?limit=10&currency=MDL
 * Returns top-N client|both parties sorted DESC by cumulative paid revenue.
 * Gracefully returns [] if fin_invoices not accessible.
 */
finPartiesRoutes.get("/analytics/top-clients", async (c) => {
  const user = c.get("user");
  const limitParam = c.req.query("limit");
  const limit = Math.min(Math.max(parseInt(limitParam ?? "10", 10) || 10, 1), 50);

  try {
    // Aggregate paid revenue per party
    const rows = await db
      .select({
        partyId: finInvoices.partyId,
        totalRevenueCents: sql<number>`coalesce(sum(${finInvoices.totalCents}),0)::int`,
      })
      .from(finInvoices)
      .where(
        and(
          eq(finInvoices.tenantId, user.tenantId),
          eq(finInvoices.status, "paid")
        )
      )
      .groupBy(finInvoices.partyId)
      .orderBy(desc(sql`sum(${finInvoices.totalCents})`))
      .limit(limit);

    // Collect partyIds that have any invoice (paid or issued/overdue) for segment
    const partyIdsWithRevenue = rows.map((r) => r.partyId).filter(Boolean) as string[];

    if (partyIdsWithRevenue.length === 0) {
      return c.json({ data: [] });
    }

    // Fetch open balances for those parties
    const openRows = await db
      .select({
        partyId: finInvoices.partyId,
        openBalanceCents: sql<number>`coalesce(sum(${finInvoices.totalCents}),0)::int`,
      })
      .from(finInvoices)
      .where(
        and(
          eq(finInvoices.tenantId, user.tenantId),
          inArray(finInvoices.status, ["issued", "overdue"]),
          inArray(finInvoices.partyId, partyIdsWithRevenue)
        )
      )
      .groupBy(finInvoices.partyId);

    const openMap = new Map(openRows.map((r) => [r.partyId, r.openBalanceCents]));

    // Fetch party names
    const parties = await db
      .select({ id: finParties.id, name: finParties.name, kind: finParties.kind })
      .from(finParties)
      .where(
        and(
          eq(finParties.tenantId, user.tenantId),
          inArray(finParties.id, partyIdsWithRevenue)
        )
      );

    const partyNameMap = new Map(parties.map((p) => [p.id, { name: p.name, kind: p.kind }]));

    const data = rows
      .filter((r) => r.partyId && partyNameMap.has(r.partyId as string))
      .map((r) => {
        const pid = r.partyId as string;
        const rev = r.totalRevenueCents;
        const open = openMap.get(pid) ?? 0;
        const segment = computeSegment(rev, true);
        return {
          partyId: pid,
          partyName: partyNameMap.get(pid)?.name ?? "—",
          totalRevenueCents: rev,
          openBalanceCents: open,
          segment,
        };
      });

    return c.json({ data });
  } catch {
    // fin_invoices may not be available on this DB — graceful empty response
    return c.json({ data: [] });
  }
});

// ─── Analytics: segment distribution (PARTY-004) ─────────────────────────────

/**
 * GET /api/fin/parties/analytics/segments
 * Returns count of parties per segment: { VIP, Regular, New }
 */
finPartiesRoutes.get("/analytics/segments", async (c) => {
  const user = c.get("user");

  try {
    // All active client/both parties for tenant
    const allParties = await db
      .select({ id: finParties.id })
      .from(finParties)
      .where(
        and(
          eq(finParties.tenantId, user.tenantId),
          eq(finParties.isActive, true),
          inArray(finParties.kind, ["client", "both"])
        )
      );

    const allIds = allParties.map((p) => p.id);

    if (allIds.length === 0) {
      return c.json({ data: { VIP: 0, Regular: 0, New: 0 } });
    }

    // Paid revenue per party
    const revenueRows = await db
      .select({
        partyId: finInvoices.partyId,
        totalRevenueCents: sql<number>`coalesce(sum(${finInvoices.totalCents}),0)::int`,
      })
      .from(finInvoices)
      .where(
        and(
          eq(finInvoices.tenantId, user.tenantId),
          eq(finInvoices.status, "paid"),
          inArray(finInvoices.partyId, allIds)
        )
      )
      .groupBy(finInvoices.partyId);

    // Parties that have any invoice (paid or otherwise)
    const anyInvoiceRows = await db
      .select({ partyId: finInvoices.partyId })
      .from(finInvoices)
      .where(
        and(
          eq(finInvoices.tenantId, user.tenantId),
          inArray(finInvoices.partyId, allIds)
        )
      )
      .groupBy(finInvoices.partyId);

    const revenueMap = new Map(revenueRows.map((r) => [r.partyId as string, r.totalRevenueCents]));
    const withInvoiceSet = new Set(anyInvoiceRows.map((r) => r.partyId as string));

    const dist = { VIP: 0, Regular: 0, New: 0 };
    for (const { id } of allParties) {
      const rev = revenueMap.get(id) ?? 0;
      const hasInv = withInvoiceSet.has(id);
      const seg = computeSegment(rev, hasInv);
      dist[seg]++;
    }

    return c.json({ data: dist });
  } catch {
    return c.json({ data: { VIP: 0, Regular: 0, New: 0 } });
  }
});

// ─── Metrics (PARTY-003) — specific route must come before /:id ──────────────

/**
 * GET /api/fin/parties/:id/metrics
 * Returns totalRevenue, openBalance, and aging breakdown for the party.
 * If fin_invoices doesn't exist yet, returns graceful zeros (stub-safe).
 */
finPartiesRoutes.get("/:id/metrics", async (c) => {
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

  // Graceful stub: fin_invoices table doesn't exist yet (BILL-001 will create it).
  // Return zeroed metrics so the UI works without crashing.
  const zeroMetrics = {
    totalRevenue: 0,
    openBalance: 0,
    aging: { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 },
  };

  try {
    // Once BILL-001 lands, this block will be replaced with real queries.
    // For now, try querying fin_invoices; fall back to zeros on any error.
    const now = new Date();

    // Dynamic import to avoid hard dependency on a not-yet-existing table.
    // If fin_invoices schema isn't exported yet, the catch block returns zeros.
    const schemaModule = await import("../db/schema/index.js").catch(() => null);
    if (!schemaModule || !("finInvoices" in schemaModule)) {
      return c.json({ data: zeroMetrics });
    }

    // finInvoices exists — compute real metrics
    const { finInvoices } = schemaModule as { finInvoices: { partyId: unknown; status: unknown; totalCents: unknown; dueDate: unknown } };
    const { eq: eqOp, and: andOp, sql: sqlFn, inArray } = await import("drizzle-orm");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inv = finInvoices as any;

    const [revenue, open] = await Promise.all([
      db
        .select({ total: sqlFn<number>`coalesce(sum(${inv.totalCents}),0)::int` })
        .from(inv)
        .where(andOp(eqOp(inv.partyId, id), eqOp(inv.status, "paid"))),
      db
        .select({ total: sqlFn<number>`coalesce(sum(${inv.totalCents}),0)::int`, dueDate: inv.dueDate })
        .from(inv)
        .where(andOp(eqOp(inv.partyId, id), inArray(inv.status, ["issued", "overdue"]))),
    ]);

    const totalRevenue = revenue[0]?.total ?? 0;
    const openRows = open as Array<{ total: number; dueDate: string }>;
    const openBalance = openRows.reduce((s, r) => s + r.total, 0);

    const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };
    for (const row of openRows) {
      if (!row.dueDate) continue;
      const days = Math.floor((now.getTime() - new Date(row.dueDate).getTime()) / 86_400_000);
      if (days <= 30) aging.d0_30 += row.total;
      else if (days <= 60) aging.d31_60 += row.total;
      else if (days <= 90) aging.d61_90 += row.total;
      else aging.d90plus += row.total;
    }

    return c.json({ data: { totalRevenue, openBalance, aging } });
  } catch {
    // fin_invoices not ready yet — return stub zeros
    return c.json({ data: zeroMetrics });
  }
});

// ─── Aging per party — real data (PARTY-004) ─────────────────────────────────

/**
 * GET /api/fin/parties/:id/aging
 * Real aging breakdown for overdue/open invoices.
 * Replaces the stub in /metrics.
 */
finPartiesRoutes.get("/:id/aging", async (c) => {
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

  const aging = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 };

  try {
    const now = new Date();
    const openInvoices = await db
      .select({ totalCents: finInvoices.totalCents, dueDate: finInvoices.dueDate })
      .from(finInvoices)
      .where(
        and(
          eq(finInvoices.tenantId, user.tenantId),
          eq(finInvoices.partyId, id),
          inArray(finInvoices.status, ["issued", "overdue"])
        )
      );

    for (const inv of openInvoices) {
      if (!inv.dueDate) continue;
      const days = Math.floor((now.getTime() - new Date(inv.dueDate).getTime()) / 86_400_000);
      if (days <= 30) aging.d0_30 += inv.totalCents;
      else if (days <= 60) aging.d31_60 += inv.totalCents;
      else if (days <= 90) aging.d61_90 += inv.totalCents;
      else aging.d90plus += inv.totalCents;
    }
  } catch {
    // fin_invoices not ready — return zeros
  }

  return c.json({ data: aging });
});

// ─── Get single party with segment (PARTY-004) ───────────────────────────────

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

  // Compute segment (graceful: falls back to "New" if fin_invoices unavailable)
  let segment: Segment = "New";
  try {
    const [revRow] = await db
      .select({ totalRevenueCents: sql<number>`coalesce(sum(${finInvoices.totalCents}),0)::int` })
      .from(finInvoices)
      .where(
        and(
          eq(finInvoices.tenantId, user.tenantId),
          eq(finInvoices.partyId, id),
          eq(finInvoices.status, "paid")
        )
      );
    const [anyRow] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(finInvoices)
      .where(and(eq(finInvoices.tenantId, user.tenantId), eq(finInvoices.partyId, id)));
    const rev = revRow?.totalRevenueCents ?? 0;
    const hasInv = (anyRow?.cnt ?? 0) > 0;
    segment = computeSegment(rev, hasInv);
  } catch {
    // fin_invoices unavailable — segment stays "New"
  }

  return c.json({ data: { ...rows[0], segment } });
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
