/**
 * PAR-VENDOR360 — fișa furnizorului: domenii, evaluări, note interne, oferte, documente.
 *
 * Montat pe ACELAȘI prefix ca registrul (`/api/par/vendors`), dar ÎNAINTEA lui în app.ts: rutele de
 * aici sunt mai specifice (`/categories`, `/:id/profile`, `/ratings/:ratingId`), iar ce nu se
 * potrivește cade mai departe pe routerul de registru, care păstrează CRUD-ul de rechizite.
 *
 * Acces: citirea cere orice rol PAR (fișa conține IDNO/IBAN — vezi PARQA-005). Evaluările și notele
 * le poate scrie oricine are un rol PAR: cel care a cerut serviciul știe cel mai bine cum a fost
 * prestat. Blocarea unui furnizor și administrarea domeniilor rămân la `par_admin` — sunt decizii
 * de politică, nu observații.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { parVendors, parRequests, parPayments, parQuotes } from "../db/schema/par";
import {
  parVendorCategories,
  parVendorCategoryLinks,
  parVendorRatings,
  parVendorNotes,
  parVendorOffers,
  parVendorDocuments,
} from "../db/schema/parVendorProfile";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole, getUserPARRoles } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { zodFieldErrorsHook } from "../lib/zodFieldErrors";
import {
  DEFAULT_VENDOR_CATEGORIES,
  computeVendorKpis,
  detectRiskFlags,
  slugifyCategory,
  summarizeRatings,
  type RatingRow,
  type VendorRequestRow,
} from "../lib/par/vendorProfile";

export const parVendorProfileRoutes = new Hono<{ Variables: AuthVariables }>();
parVendorProfileRoutes.use("*", requireAuth);
parVendorProfileRoutes.use("*", requirePARRole("requestor", "approver", "finance", "par_admin"));
/**
 * Garda de UUID se pune PE FIECARE rută `/:id/...`, nu global cu `use("/:id/*")`.
 *
 * Cu înregistrarea globală, `/categories/seed` s-ar potrivi și el pe `/:id/*` cu id="categories",
 * iar garda ar întoarce 404 pentru o rută perfect validă. Rutele literale și cele pe alt param
 * (`/ratings/:ratingId`) își pun singure garda potrivită.
 */
const requireVendorUuid = parUuidGuard("id");

/** Rândurile la care se poate ajunge doar cu drept de administrare (politică, nu observație). */
const adminOnly = requirePARRole("par_admin");

/** Autorul își poate retrage propria însemnare; altfel e nevoie de par_admin. */
async function canRemove(
  c: { get: (k: "user") => { id: string; tenantId: string; role?: string } },
  authorUserId: string
): Promise<boolean> {
  const user = c.get("user");
  if (authorUserId === user.id) return true;
  const roles = await getUserPARRoles(user.id, user.tenantId, user.role);
  return roles.includes("par_admin");
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function loadVendor(tenantId: string, vendorId: string) {
  const [row] = await db
    .select()
    .from(parVendors)
    .where(and(eq(parVendors.id, vendorId), eq(parVendors.tenantId, tenantId)))
    .limit(1);
  return row ?? null;
}

/**
 * Cererile care aparțin furnizorului.
 *
 * Nu e suficient `vendor_id`: registrul s-a completat în timp, iar cererile vechi păstrează doar
 * numele și IBAN-ul beneficiarului (snapshot). Dacă am filtra doar pe cheia străină, fișa unui
 * furnizor cu 3 ani de istoric ar arăta goală — exact opusul scopului. Potrivim, în ordinea
 * încrederii: cheia străină, apoi IBAN-ul normalizat, apoi numele exact.
 */
function vendorRequestsWhere(tenantId: string, vendor: { id: string; name: string; iban: string | null }) {
  const matches = [eq(parRequests.vendorId, vendor.id)];
  if (vendor.iban) matches.push(eq(parRequests.payeeIban, vendor.iban.replace(/\s/g, "").toUpperCase()));
  if (vendor.name) matches.push(ilike(parRequests.payeeName, vendor.name));
  return and(eq(parRequests.tenantId, tenantId), or(...matches));
}

function rowsOf<T>(result: T[] | { rows?: T[] }): T[] {
  // DB-portability (CLAUDE.md §3.5.1): PGlite și Postgres întorc forme diferite.
  return Array.isArray(result) ? result : (result.rows ?? []);
}

async function userNames(ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
  if (!unique.length) return new Map();
  const rows = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, unique));
  return new Map(rowsOf(rows).map((u) => [u.id, u.name || u.email || "Utilizator"]));
}

// ─────────────────────────────────────────────────────────────────────────────
// Domenii (categorii)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/par/vendors/categories — domeniile + câți furnizori are fiecare. */
parVendorProfileRoutes.get("/categories", async (c) => {
  const tenantId = c.get("user").tenantId;
  const cats = rowsOf(
    await db
      .select()
      .from(parVendorCategories)
      .where(eq(parVendorCategories.tenantId, tenantId))
      .orderBy(asc(parVendorCategories.name))
  );
  const counts = rowsOf(
    await db
      .select({
        categoryId: parVendorCategoryLinks.categoryId,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(parVendorCategoryLinks)
      .where(eq(parVendorCategoryLinks.tenantId, tenantId))
      .groupBy(parVendorCategoryLinks.categoryId)
  );
  const byId = new Map(counts.map((r) => [r.categoryId, Number(r.count ?? 0)]));
  return c.json({
    categories: cats.map((cat) => ({ ...cat, vendorCount: byId.get(cat.id) ?? 0 })),
    suggestions: DEFAULT_VENDOR_CATEGORIES,
  });
});

const categorySchema = z.object({ name: z.string().min(1).max(120) });

/** POST /api/par/vendors/categories — adaugă un domeniu. */
parVendorProfileRoutes.post("/categories", adminOnly, zValidator("json", categorySchema, zodFieldErrorsHook), async (c) => {
  const tenantId = c.get("user").tenantId;
  const name = c.req.valid("json").name.trim();
  const slug = slugifyCategory(name);
  if (!slug) return c.json({ error: "invalid_name" }, 400);

  const existing = rowsOf(
    await db
      .select()
      .from(parVendorCategories)
      .where(and(eq(parVendorCategories.tenantId, tenantId), eq(parVendorCategories.slug, slug)))
      .limit(1)
  );
  // Idempotent: „Birotică" scris a doua oară reactivează domeniul, nu creează un duplicat care ar
  // împărți furnizorii în două liste identice la nume.
  if (existing[0]) {
    const [row] = await db
      .update(parVendorCategories)
      .set({ name, active: true, updatedAt: new Date() })
      .where(eq(parVendorCategories.id, existing[0].id))
      .returning();
    return c.json(row, 200);
  }

  const [row] = await db.insert(parVendorCategories).values({ tenantId, name, slug }).returning();
  return c.json(row, 201);
});

/** POST /api/par/vendors/categories/seed — pune lista implicită, sărind peste ce există deja. */
parVendorProfileRoutes.post("/categories/seed", adminOnly, async (c) => {
  const tenantId = c.get("user").tenantId;
  const existing = new Set(
    rowsOf(
      await db
        .select({ slug: parVendorCategories.slug })
        .from(parVendorCategories)
        .where(eq(parVendorCategories.tenantId, tenantId))
    ).map((r) => r.slug)
  );
  const toAdd = DEFAULT_VENDOR_CATEGORIES.filter((name) => !existing.has(slugifyCategory(name))).map((name) => ({
    tenantId,
    name,
    slug: slugifyCategory(name),
  }));
  if (toAdd.length) await db.insert(parVendorCategories).values(toAdd);
  return c.json({ added: toAdd.length });
});

const categoryPatchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  active: z.boolean().optional(),
});

parVendorProfileRoutes.patch(
  "/categories/:categoryId",
  adminOnly,
  parUuidGuard("categoryId"),
  zValidator("json", categoryPatchSchema, zodFieldErrorsHook),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const body = c.req.valid("json");
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name != null) {
      patch.name = body.name.trim();
      patch.slug = slugifyCategory(body.name);
    }
    if (body.active != null) patch.active = body.active;
    const [row] = await db
      .update(parVendorCategories)
      .set(patch)
      .where(and(eq(parVendorCategories.id, c.req.param("categoryId")), eq(parVendorCategories.tenantId, tenantId)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

parVendorProfileRoutes.delete("/categories/:categoryId", adminOnly, parUuidGuard("categoryId"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const [row] = await db
    .delete(parVendorCategories)
    .where(and(eq(parVendorCategories.id, c.req.param("categoryId")), eq(parVendorCategories.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Directorul de furnizori (lista cu filtre)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/par/vendors/directory — lista cu tot ce trebuie ca s-o poți filtra și sorta:
 * domenii, notă medie, cât s-a plătit, când a fost ultima plată, starea relației.
 *
 * Query: `q`, `category` (id), `relationship`, `min_rating`, `sort` (name|paid|rating|recent),
 * `include_inactive`.
 */
parVendorProfileRoutes.get("/directory", async (c) => {
  const tenantId = c.get("user").tenantId;
  const q = c.req.query("q")?.trim();
  const categoryId = c.req.query("category")?.trim();
  const relationship = c.req.query("relationship")?.trim();
  const minRating = Number(c.req.query("min_rating") ?? "") || null;
  const sort = c.req.query("sort") ?? "name";
  const includeInactive = c.req.query("include_inactive") === "1";

  const conditions = [eq(parVendors.tenantId, tenantId)];
  if (!includeInactive) conditions.push(eq(parVendors.active, true));
  if (relationship) conditions.push(eq(parVendors.relationship, relationship));
  if (q) {
    const match = or(ilike(parVendors.name, `%${q}%`), ilike(parVendors.idnp, `%${q}%`), ilike(parVendors.iban, `%${q}%`));
    if (match) conditions.push(match);
  }

  const vendors = rowsOf(
    await db.select().from(parVendors).where(and(...conditions)).orderBy(asc(parVendors.name))
  );
  if (!vendors.length) return c.json({ vendors: [], total: 0 });

  const vendorIds = vendors.map((v) => v.id);

  const links = rowsOf(
    await db
      .select({
        vendorId: parVendorCategoryLinks.vendorId,
        categoryId: parVendorCategoryLinks.categoryId,
        name: parVendorCategories.name,
      })
      .from(parVendorCategoryLinks)
      .innerJoin(parVendorCategories, eq(parVendorCategories.id, parVendorCategoryLinks.categoryId))
      .where(and(eq(parVendorCategoryLinks.tenantId, tenantId), inArray(parVendorCategoryLinks.vendorId, vendorIds)))
  );
  const catsByVendor = new Map<string, { id: string; name: string }[]>();
  for (const l of links) {
    const list = catsByVendor.get(l.vendorId) ?? [];
    list.push({ id: l.categoryId, name: l.name });
    catsByVendor.set(l.vendorId, list);
  }

  const ratingRows = rowsOf(
    await db
      .select({
        vendorId: parVendorRatings.vendorId,
        avg: sql<number>`avg(${parVendorRatings.stars})`,
        count: sql<number>`cast(count(*) as integer)`,
      })
      .from(parVendorRatings)
      .where(and(eq(parVendorRatings.tenantId, tenantId), inArray(parVendorRatings.vendorId, vendorIds)))
      .groupBy(parVendorRatings.vendorId)
  );
  const ratingByVendor = new Map(
    ratingRows.map((r) => [r.vendorId, { avg: r.avg == null ? null : Math.round(Number(r.avg) * 100) / 100, count: Number(r.count ?? 0) }])
  );

  // Totalurile de plată se leagă pe vendor_id ACOLO UNDE EXISTĂ; pentru cererile vechi (snapshot de
  // nume/IBAN) recuperăm mai jos, pe nume normalizat, ca fișa să nu arate 0 lei la un furnizor cu
  // istoric. Aceeași regulă ca în `vendorRequestsWhere`.
  const spendRows = rowsOf(
    await db
      .select({
        vendorId: parRequests.vendorId,
        payeeName: parRequests.payeeName,
        status: parRequests.status,
        currency: parRequests.currency,
        totalEstimatedCents: parRequests.totalEstimatedCents,
        totalMdlCents: parRequests.totalMdlCents,
        actualAmountCents: parPayments.actualAmountCents,
        paidAt: parRequests.paidAt,
        submittedAt: parRequests.submittedAt,
        approvedAt: parRequests.approvedAt,
        payeeIban: parRequests.payeeIban,
        id: parRequests.id,
      })
      .from(parRequests)
      .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
      .where(eq(parRequests.tenantId, tenantId))
  );

  const byVendorId = new Map<string, VendorRequestRow[]>();
  const byName = new Map<string, VendorRequestRow[]>();
  for (const r of spendRows) {
    const row: VendorRequestRow = {
      id: r.id,
      status: String(r.status),
      currency: r.currency,
      totalEstimatedCents: Number(r.totalEstimatedCents ?? 0),
      totalMdlCents: r.totalMdlCents == null ? null : Number(r.totalMdlCents),
      actualAmountCents: r.actualAmountCents == null ? null : Number(r.actualAmountCents),
      payeeIban: r.payeeIban ?? null,
      submittedAt: r.submittedAt ?? null,
      approvedAt: r.approvedAt ?? null,
      paidAt: r.paidAt ?? null,
    };
    if (r.vendorId) {
      const list = byVendorId.get(r.vendorId) ?? [];
      list.push(row);
      byVendorId.set(r.vendorId, list);
    } else if (r.payeeName) {
      const key = r.payeeName.trim().toLowerCase();
      const list = byName.get(key) ?? [];
      list.push(row);
      byName.set(key, list);
    }
  }

  let items = vendors.map((v) => {
    const requests = [...(byVendorId.get(v.id) ?? []), ...(byName.get(v.name.trim().toLowerCase()) ?? [])];
    const kpis = computeVendorKpis(requests);
    const rating = ratingByVendor.get(v.id) ?? { avg: null, count: 0 };
    return {
      id: v.id,
      name: v.name,
      kind: v.kind,
      idnp: v.idnp,
      relationship: v.relationship,
      blockedReason: v.blockedReason,
      active: v.active,
      contactName: v.contactName,
      contactPhone: v.contactPhone,
      contactEmail: v.contactEmail,
      website: v.website,
      paymentTermsDays: v.paymentTermsDays,
      categories: catsByVendor.get(v.id) ?? [],
      ratingAvg: rating.avg,
      ratingCount: rating.count,
      paidCents: kpis.paidCents,
      requestCount: kpis.requestCount,
      lastPaidAt: kpis.lastPaidAt,
    };
  });

  if (categoryId) items = items.filter((v) => v.categories.some((cat) => cat.id === categoryId));
  if (minRating) items = items.filter((v) => (v.ratingAvg ?? 0) >= minRating);

  items.sort((a, b) => {
    if (sort === "paid") return b.paidCents - a.paidCents;
    if (sort === "rating") return (b.ratingAvg ?? -1) - (a.ratingAvg ?? -1);
    if (sort === "recent") return (b.lastPaidAt ?? "").localeCompare(a.lastPaidAt ?? "");
    return a.name.localeCompare(b.name, "ro");
  });

  return c.json({ vendors: items, total: items.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// Evaluări de dat (popup-ul de după plată)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/par/vendors/pending-ratings — cererile MELE plătite, cu furnizor cunoscut, pe care nu
 * le-am evaluat încă. Alimentează popup-ul care apare după plată.
 *
 * Doar cererile proprii: cel care a cerut serviciul e cel care a văzut cum a fost prestat. Finanțele
 * pot evalua oricând din fișă, dar nu sunt bătute la cap cu popup-uri pentru cereri străine.
 */
parVendorProfileRoutes.get("/pending-ratings", async (c) => {
  const user = c.get("user");
  const rows = rowsOf(
    await db
      .select({
        parId: parRequests.id,
        requestNo: parRequests.requestNo,
        paidAt: parRequests.paidAt,
        vendorId: parRequests.vendorId,
        payeeName: parRequests.payeeName,
        vendorName: parVendors.name,
        totalMdlCents: parRequests.totalMdlCents,
        totalEstimatedCents: parRequests.totalEstimatedCents,
        currency: parRequests.currency,
        ratingId: parVendorRatings.id,
      })
      .from(parRequests)
      .innerJoin(parVendors, eq(parVendors.id, parRequests.vendorId))
      .leftJoin(
        parVendorRatings,
        and(eq(parVendorRatings.parId, parRequests.id), eq(parVendorRatings.authorUserId, user.id))
      )
      .where(
        and(
          eq(parRequests.tenantId, user.tenantId),
          eq(parRequests.requestedByUserId, user.id),
          eq(parRequests.status, "paid"),
          isNull(parVendorRatings.id)
        )
      )
      .orderBy(desc(parRequests.paidAt))
      .limit(10)
  );

  return c.json({
    pending: rows.map((r) => ({
      parId: r.parId,
      requestNo: r.requestNo,
      paidAt: r.paidAt,
      vendorId: r.vendorId,
      vendorName: r.vendorName ?? r.payeeName,
      amountCents: Number(r.totalMdlCents ?? r.totalEstimatedCents ?? 0),
      currency: r.currency,
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fișa unui furnizor
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/par/vendors/:id/profile — tot ce se vede când deschizi „pagina companiei". */
parVendorProfileRoutes.get("/:id/profile", requireVendorUuid, async (c) => {
  const tenantId = c.get("user").tenantId;
  const vendor = await loadVendor(tenantId, c.req.param("id"));
  if (!vendor) return c.json({ error: "not_found" }, 404);

  const requestRows = rowsOf(
    await db
      .select({
        id: parRequests.id,
        requestNo: parRequests.requestNo,
        status: parRequests.status,
        purpose: parRequests.purpose,
        currency: parRequests.currency,
        totalEstimatedCents: parRequests.totalEstimatedCents,
        totalMdlCents: parRequests.totalMdlCents,
        actualAmountCents: parPayments.actualAmountCents,
        payeeIban: parRequests.payeeIban,
        dateOfRequest: parRequests.dateOfRequest,
        submittedAt: parRequests.submittedAt,
        approvedAt: parRequests.approvedAt,
        paidAt: parRequests.paidAt,
        endUse: parRequests.endUse,
      })
      .from(parRequests)
      .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
      .where(vendorRequestsWhere(tenantId, vendor))
      .orderBy(desc(parRequests.dateOfRequest))
  );

  const requests: VendorRequestRow[] = requestRows.map((r) => ({
    id: r.id,
    status: String(r.status),
    currency: r.currency,
    totalEstimatedCents: Number(r.totalEstimatedCents ?? 0),
    totalMdlCents: r.totalMdlCents == null ? null : Number(r.totalMdlCents),
    actualAmountCents: r.actualAmountCents == null ? null : Number(r.actualAmountCents),
    payeeIban: r.payeeIban ?? null,
    submittedAt: r.submittedAt ?? null,
    approvedAt: r.approvedAt ?? null,
    paidAt: r.paidAt ?? null,
  }));

  const ratingRows = rowsOf(
    await db
      .select()
      .from(parVendorRatings)
      .where(and(eq(parVendorRatings.tenantId, tenantId), eq(parVendorRatings.vendorId, vendor.id)))
      .orderBy(desc(parVendorRatings.createdAt))
  );
  const ratings = summarizeRatings(ratingRows as RatingRow[]);

  const documents = rowsOf(
    await db
      .select()
      .from(parVendorDocuments)
      .where(and(eq(parVendorDocuments.tenantId, tenantId), eq(parVendorDocuments.vendorId, vendor.id)))
      .orderBy(desc(parVendorDocuments.createdAt))
  );

  const categories = rowsOf(
    await db
      .select({ id: parVendorCategories.id, name: parVendorCategories.name })
      .from(parVendorCategoryLinks)
      .innerJoin(parVendorCategories, eq(parVendorCategories.id, parVendorCategoryLinks.categoryId))
      .where(and(eq(parVendorCategoryLinks.tenantId, tenantId), eq(parVendorCategoryLinks.vendorId, vendor.id)))
      .orderBy(asc(parVendorCategories.name))
  );

  const flags = detectRiskFlags({
    vendor: {
      relationship: vendor.relationship,
      blockedReason: vendor.blockedReason,
      idnp: vendor.idnp,
      kind: vendor.kind,
      companyStatus: vendor.companyStatus,
      isPatentHolder: (vendor as { isPatentHolder?: boolean | null }).isPatentHolder ?? null,
      patentValidUntil: (vendor as { patentValidUntil?: string | null }).patentValidUntil ?? null,
    },
    requests,
    ratings,
    documents: documents.map((d) => ({ title: d.title, kind: d.kind, validUntil: d.validUntil })),
  });

  return c.json({
    vendor: { ...vendor, categories },
    kpis: computeVendorKpis(requests),
    ratings,
    flags,
    requests: requestRows.map((r) => ({
      id: r.id,
      requestNo: r.requestNo,
      status: r.status,
      purpose: r.purpose,
      currency: r.currency,
      totalEstimatedCents: Number(r.totalEstimatedCents ?? 0),
      totalMdlCents: r.totalMdlCents == null ? null : Number(r.totalMdlCents),
      actualAmountCents: r.actualAmountCents == null ? null : Number(r.actualAmountCents),
      dateOfRequest: r.dateOfRequest,
      paidAt: r.paidAt,
      endUse: r.endUse,
    })),
  });
});

/** PUT /api/par/vendors/:id/categories — setează domeniile furnizorului (înlocuiește lista). */
parVendorProfileRoutes.put(
  "/:id/categories",
  requireVendorUuid,
  zValidator("json", z.object({ category_ids: z.array(z.string().uuid()).max(20) }), zodFieldErrorsHook),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const vendorId = c.req.param("id");
    const vendor = await loadVendor(tenantId, vendorId);
    if (!vendor) return c.json({ error: "not_found" }, 404);
    const ids = Array.from(new Set(c.req.valid("json").category_ids));

    // Doar domenii din TENANTUL curent — altfel un id ghicit ar lega furnizorul de un domeniu străin.
    const valid = ids.length
      ? rowsOf(
          await db
            .select({ id: parVendorCategories.id })
            .from(parVendorCategories)
            .where(and(eq(parVendorCategories.tenantId, tenantId), inArray(parVendorCategories.id, ids)))
        ).map((r) => r.id)
      : [];

    await db
      .delete(parVendorCategoryLinks)
      .where(and(eq(parVendorCategoryLinks.tenantId, tenantId), eq(parVendorCategoryLinks.vendorId, vendorId)));
    if (valid.length) {
      await db.insert(parVendorCategoryLinks).values(valid.map((categoryId) => ({ tenantId, vendorId, categoryId })));
    }
    return c.json({ ok: true, categoryIds: valid });
  }
);

const relationshipSchema = z.object({
  relationship: z.enum(["preferred", "active", "trial", "blocked"]),
  blocked_reason: z.string().max(1000).optional().nullable(),
  website: z.string().max(300).optional().nullable(),
  payment_terms_days: z.number().int().min(0).max(365).optional().nullable(),
});

/**
 * PATCH /api/par/vendors/:id/relationship — preferat / activ / în probă / blocat.
 *
 * Blocarea cere motiv: un furnizor blocat fără explicație e un blocaj pe care nimeni nu-l poate
 * ridica în cunoștință de cauză peste șase luni. Motivul se salvează ȘI ca notă fixată, ca să
 * rămână în istoricul fișei chiar dacă cineva deblochează furnizorul mai târziu.
 */
parVendorProfileRoutes.patch(
  "/:id/relationship",
  requireVendorUuid,
  adminOnly,
  zValidator("json", relationshipSchema, zodFieldErrorsHook),
  async (c) => {
    const user = c.get("user");
    const vendorId = c.req.param("id");
    const body = c.req.valid("json");
    if (body.relationship === "blocked" && !body.blocked_reason?.trim()) {
      return c.json({ error: "blocked_reason_required", fieldErrors: { blocked_reason: "Scrie de ce blochezi furnizorul." } }, 400);
    }
    const vendor = await loadVendor(user.tenantId, vendorId);
    if (!vendor) return c.json({ error: "not_found" }, 404);

    const [row] = await db
      .update(parVendors)
      .set({
        relationship: body.relationship,
        blockedReason: body.relationship === "blocked" ? body.blocked_reason!.trim() : null,
        website: body.website === undefined ? vendor.website : body.website,
        paymentTermsDays: body.payment_terms_days === undefined ? vendor.paymentTermsDays : body.payment_terms_days,
        updatedAt: new Date(),
      })
      .where(and(eq(parVendors.id, vendorId), eq(parVendors.tenantId, user.tenantId)))
      .returning();

    if (body.relationship === "blocked" || vendor.relationship === "blocked") {
      await db.insert(parVendorNotes).values({
        tenantId: user.tenantId,
        vendorId,
        authorUserId: user.id,
        pinned: body.relationship === "blocked",
        body:
          body.relationship === "blocked"
            ? `Furnizor blocat: ${body.blocked_reason!.trim()}`
            : `Furnizor deblocat (era blocat pentru: ${vendor.blockedReason ?? "motiv nenotat"}).`,
      });
    }

    return c.json(row);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Evaluări
// ─────────────────────────────────────────────────────────────────────────────

const starField = z.number().int().min(1).max(5);
const ratingSchema = z.object({
  stars: starField,
  par_id: z.string().uuid().optional().nullable(),
  quality_stars: starField.optional().nullable(),
  timeliness_stars: starField.optional().nullable(),
  price_stars: starField.optional().nullable(),
  communication_stars: starField.optional().nullable(),
  comment: z.string().max(4000).optional().nullable(),
  would_use_again: z.boolean().optional().nullable(),
});

parVendorProfileRoutes.get("/:id/ratings", requireVendorUuid, async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = rowsOf(
    await db
      .select({
        rating: parVendorRatings,
        requestNo: parRequests.requestNo,
      })
      .from(parVendorRatings)
      .leftJoin(parRequests, eq(parRequests.id, parVendorRatings.parId))
      .where(and(eq(parVendorRatings.tenantId, tenantId), eq(parVendorRatings.vendorId, c.req.param("id"))))
      .orderBy(desc(parVendorRatings.createdAt))
  );
  const names = await userNames(rows.map((r) => r.rating.authorUserId));
  return c.json({
    ratings: rows.map((r) => ({
      ...r.rating,
      authorName: names.get(r.rating.authorUserId) ?? "Utilizator",
      requestNo: r.requestNo ?? null,
    })),
    summary: summarizeRatings(rows.map((r) => r.rating as RatingRow)),
  });
});

/**
 * POST /api/par/vendors/:id/ratings — notează prestația.
 *
 * Dacă evaluarea e legată de o cerere, cererea trebuie să fie din același tenant. Reevaluarea
 * aceleiași cereri de către același om suprascrie nota veche (unic pe par_id + autor), ca să nu
 * ajungem cu două păreri contradictorii de la același om despre același serviciu.
 */
parVendorProfileRoutes.post("/:id/ratings", requireVendorUuid, zValidator("json", ratingSchema, zodFieldErrorsHook), async (c) => {
  const user = c.get("user");
  const vendorId = c.req.param("id");
  const body = c.req.valid("json");
  const vendor = await loadVendor(user.tenantId, vendorId);
  if (!vendor) return c.json({ error: "not_found" }, 404);

  if (body.par_id) {
    const [par] = rowsOf(
      await db
        .select({ id: parRequests.id })
        .from(parRequests)
        .where(and(eq(parRequests.id, body.par_id), eq(parRequests.tenantId, user.tenantId)))
        .limit(1)
    );
    if (!par) return c.json({ error: "par_not_found" }, 404);

    const [existing] = rowsOf(
      await db
        .select({ id: parVendorRatings.id })
        .from(parVendorRatings)
        .where(and(eq(parVendorRatings.parId, body.par_id), eq(parVendorRatings.authorUserId, user.id)))
        .limit(1)
    );
    if (existing) {
      const [updated] = await db
        .update(parVendorRatings)
        .set({
          stars: body.stars,
          qualityStars: body.quality_stars ?? null,
          timelinessStars: body.timeliness_stars ?? null,
          priceStars: body.price_stars ?? null,
          communicationStars: body.communication_stars ?? null,
          comment: body.comment?.trim() || null,
          wouldUseAgain: body.would_use_again ?? null,
          updatedAt: new Date(),
        })
        .where(eq(parVendorRatings.id, existing.id))
        .returning();
      return c.json(updated, 200);
    }
  }

  const [row] = await db
    .insert(parVendorRatings)
    .values({
      tenantId: user.tenantId,
      vendorId,
      parId: body.par_id ?? null,
      authorUserId: user.id,
      stars: body.stars,
      qualityStars: body.quality_stars ?? null,
      timelinessStars: body.timeliness_stars ?? null,
      priceStars: body.price_stars ?? null,
      communicationStars: body.communication_stars ?? null,
      comment: body.comment?.trim() || null,
      wouldUseAgain: body.would_use_again ?? null,
    })
    .returning();
  return c.json(row, 201);
});

parVendorProfileRoutes.delete("/ratings/:ratingId", parUuidGuard("ratingId"), async (c) => {
  const user = c.get("user");
  const [row] = rowsOf(
    await db
      .select()
      .from(parVendorRatings)
      .where(and(eq(parVendorRatings.id, c.req.param("ratingId")), eq(parVendorRatings.tenantId, user.tenantId)))
      .limit(1)
  );
  if (!row) return c.json({ error: "not_found" }, 404);
  // Autorul își poate retrage părerea; altcineva nu poate șterge o evaluare incomodă.
  if (!(await canRemove(c, row.authorUserId))) return c.json({ error: "forbidden" }, 403);
  await db.delete(parVendorRatings).where(eq(parVendorRatings.id, row.id));
  return c.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Note interne
// ─────────────────────────────────────────────────────────────────────────────

parVendorProfileRoutes.get("/:id/notes", requireVendorUuid, async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = rowsOf(
    await db
      .select()
      .from(parVendorNotes)
      .where(and(eq(parVendorNotes.tenantId, tenantId), eq(parVendorNotes.vendorId, c.req.param("id"))))
      .orderBy(desc(parVendorNotes.pinned), desc(parVendorNotes.createdAt))
  );
  const names = await userNames(rows.map((r) => r.authorUserId));
  return c.json({ notes: rows.map((n) => ({ ...n, authorName: names.get(n.authorUserId) ?? "Utilizator" })) });
});

parVendorProfileRoutes.post(
  "/:id/notes",
  requireVendorUuid,
  zValidator("json", z.object({ body: z.string().min(1).max(4000), pinned: z.boolean().optional() }), zodFieldErrorsHook),
  async (c) => {
    const user = c.get("user");
    const vendor = await loadVendor(user.tenantId, c.req.param("id"));
    if (!vendor) return c.json({ error: "not_found" }, 404);
    const body = c.req.valid("json");
    const [row] = await db
      .insert(parVendorNotes)
      .values({
        tenantId: user.tenantId,
        vendorId: vendor.id,
        authorUserId: user.id,
        body: body.body.trim(),
        pinned: body.pinned ?? false,
      })
      .returning();
    return c.json(row, 201);
  }
);

parVendorProfileRoutes.delete("/notes/:noteId", parUuidGuard("noteId"), async (c) => {
  const user = c.get("user");
  const [row] = rowsOf(
    await db
      .select()
      .from(parVendorNotes)
      .where(and(eq(parVendorNotes.id, c.req.param("noteId")), eq(parVendorNotes.tenantId, user.tenantId)))
      .limit(1)
  );
  if (!row) return c.json({ error: "not_found" }, 404);
  if (!(await canRemove(c, row.authorUserId))) return c.json({ error: "forbidden" }, 403);
  await db.delete(parVendorNotes).where(eq(parVendorNotes.id, row.id));
  return c.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Oferte
// ─────────────────────────────────────────────────────────────────────────────

const offerSchema = z.object({
  title: z.string().min(1).max(300),
  category_id: z.string().uuid().optional().nullable(),
  amount_cents: z.number().int().min(0).max(2_147_483_647).optional().nullable(),
  currency: z.string().length(3).optional(),
  unit_label: z.string().max(50).optional().nullable(),
  unit_price_cents: z.number().int().min(0).max(2_147_483_647).optional().nullable(),
  offered_at: z.string().optional().nullable(),
  valid_until: z.string().optional().nullable(),
  status: z.enum(["received", "accepted", "rejected", "expired"]).optional(),
  file_url: z.string().optional().nullable(),
  file_name: z.string().max(300).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * GET /api/par/vendors/:id/offers — ofertele adăugate manual PLUS cele colectate pe cereri.
 *
 * Ofertele de pe o cerere „obținere oferte" trăiesc deja în `par_quotes` (VF-501). Le arătăm în
 * același tab, marcate cu sursa, ca omul să vadă un singur istoric de prețuri — nu două liste care
 * spun lucruri diferite despre același furnizor.
 */
parVendorProfileRoutes.get("/:id/offers", requireVendorUuid, async (c) => {
  const tenantId = c.get("user").tenantId;
  const vendorId = c.req.param("id");
  const vendor = await loadVendor(tenantId, vendorId);
  if (!vendor) return c.json({ error: "not_found" }, 404);

  const manual = rowsOf(
    await db
      .select()
      .from(parVendorOffers)
      .where(and(eq(parVendorOffers.tenantId, tenantId), eq(parVendorOffers.vendorId, vendorId)))
      .orderBy(desc(parVendorOffers.offeredAt))
  );

  const quotes = rowsOf(
    await db
      .select({
        id: parQuotes.id,
        parId: parQuotes.parId,
        requestNo: parRequests.requestNo,
        vendorName: parQuotes.vendorName,
        totalCents: parQuotes.totalCents,
        currency: parQuotes.currency,
        validUntil: parQuotes.validUntil,
        notes: parQuotes.notes,
        fileUrl: parQuotes.fileUrl,
        selected: parQuotes.selected,
        createdAt: parQuotes.createdAt,
      })
      .from(parQuotes)
      .leftJoin(parRequests, eq(parRequests.id, parQuotes.parId))
      .where(
        and(
          eq(parQuotes.tenantId, tenantId),
          or(eq(parQuotes.vendorId, vendorId), ilike(parQuotes.vendorName, vendor.name))
        )
      )
      .orderBy(desc(parQuotes.createdAt))
  );

  return c.json({
    offers: manual.map((o) => ({ ...o, source: "manual" as const })),
    quotes: quotes.map((q) => ({
      id: q.id,
      source: "par_quote" as const,
      parId: q.parId,
      requestNo: q.requestNo,
      title: q.requestNo ? `Ofertă la cererea ${q.requestNo}` : "Ofertă la o cerere",
      amountCents: Number(q.totalCents ?? 0),
      currency: q.currency,
      validUntil: q.validUntil,
      notes: q.notes,
      fileUrl: q.fileUrl,
      selected: q.selected,
      offeredAt: q.createdAt,
    })),
  });
});

parVendorProfileRoutes.post("/:id/offers", requireVendorUuid, zValidator("json", offerSchema, zodFieldErrorsHook), async (c) => {
  const user = c.get("user");
  const vendor = await loadVendor(user.tenantId, c.req.param("id"));
  if (!vendor) return c.json({ error: "not_found" }, 404);
  const body = c.req.valid("json");
  const [row] = await db
    .insert(parVendorOffers)
    .values({
      tenantId: user.tenantId,
      vendorId: vendor.id,
      title: body.title.trim(),
      categoryId: body.category_id ?? null,
      amountCents: body.amount_cents ?? null,
      currency: (body.currency ?? "MDL").toUpperCase(),
      unitLabel: body.unit_label?.trim() || null,
      unitPriceCents: body.unit_price_cents ?? null,
      offeredAt: parseDate(body.offered_at) ?? new Date(),
      validUntil: parseDate(body.valid_until),
      status: body.status ?? "received",
      fileUrl: body.file_url ?? null,
      fileName: body.file_name ?? null,
      notes: body.notes?.trim() || null,
      createdByUserId: user.id,
    })
    .returning();
  return c.json(row, 201);
});

parVendorProfileRoutes.patch(
  "/offers/:offerId",
  parUuidGuard("offerId"),
  zValidator("json", offerSchema.partial(), zodFieldErrorsHook),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.title != null) patch.title = body.title.trim();
    if (body.category_id !== undefined) patch.categoryId = body.category_id;
    if (body.amount_cents !== undefined) patch.amountCents = body.amount_cents;
    if (body.currency != null) patch.currency = body.currency.toUpperCase();
    if (body.unit_label !== undefined) patch.unitLabel = body.unit_label?.trim() || null;
    if (body.unit_price_cents !== undefined) patch.unitPriceCents = body.unit_price_cents;
    if (body.offered_at !== undefined) patch.offeredAt = parseDate(body.offered_at) ?? new Date();
    if (body.valid_until !== undefined) patch.validUntil = parseDate(body.valid_until);
    if (body.status != null) patch.status = body.status;
    if (body.file_url !== undefined) patch.fileUrl = body.file_url;
    if (body.file_name !== undefined) patch.fileName = body.file_name;
    if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;

    const [row] = await db
      .update(parVendorOffers)
      .set(patch)
      .where(and(eq(parVendorOffers.id, c.req.param("offerId")), eq(parVendorOffers.tenantId, user.tenantId)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

parVendorProfileRoutes.delete("/offers/:offerId", parUuidGuard("offerId"), async (c) => {
  const user = c.get("user");
  const [row] = await db
    .delete(parVendorOffers)
    .where(and(eq(parVendorOffers.id, c.req.param("offerId")), eq(parVendorOffers.tenantId, user.tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// Documente (contracte, certificate, licențe)
// ─────────────────────────────────────────────────────────────────────────────

const documentSchema = z.object({
  kind: z.enum(["contract", "certificat", "licenta", "polita", "alt"]).optional(),
  title: z.string().min(1).max(300),
  number: z.string().max(100).optional().nullable(),
  issued_at: z.string().optional().nullable(),
  valid_until: z.string().optional().nullable(),
  file_url: z.string().optional().nullable(),
  file_name: z.string().max(300).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
});

parVendorProfileRoutes.get("/:id/documents", requireVendorUuid, async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = rowsOf(
    await db
      .select()
      .from(parVendorDocuments)
      .where(and(eq(parVendorDocuments.tenantId, tenantId), eq(parVendorDocuments.vendorId, c.req.param("id"))))
      .orderBy(desc(parVendorDocuments.createdAt))
  );
  return c.json({ documents: rows });
});

parVendorProfileRoutes.post("/:id/documents", requireVendorUuid, zValidator("json", documentSchema, zodFieldErrorsHook), async (c) => {
  const user = c.get("user");
  const vendor = await loadVendor(user.tenantId, c.req.param("id"));
  if (!vendor) return c.json({ error: "not_found" }, 404);
  const body = c.req.valid("json");
  const [row] = await db
    .insert(parVendorDocuments)
    .values({
      tenantId: user.tenantId,
      vendorId: vendor.id,
      kind: body.kind ?? "contract",
      title: body.title.trim(),
      number: body.number?.trim() || null,
      issuedAt: parseDate(body.issued_at),
      validUntil: parseDate(body.valid_until),
      fileUrl: body.file_url ?? null,
      fileName: body.file_name ?? null,
      notes: body.notes?.trim() || null,
      createdByUserId: user.id,
    })
    .returning();
  return c.json(row, 201);
});

parVendorProfileRoutes.patch(
  "/documents/:docId",
  parUuidGuard("docId"),
  zValidator("json", documentSchema.partial(), zodFieldErrorsHook),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.kind != null) patch.kind = body.kind;
    if (body.title != null) patch.title = body.title.trim();
    if (body.number !== undefined) patch.number = body.number?.trim() || null;
    if (body.issued_at !== undefined) patch.issuedAt = parseDate(body.issued_at);
    if (body.valid_until !== undefined) patch.validUntil = parseDate(body.valid_until);
    if (body.file_url !== undefined) patch.fileUrl = body.file_url;
    if (body.file_name !== undefined) patch.fileName = body.file_name;
    if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;

    const [row] = await db
      .update(parVendorDocuments)
      .set(patch)
      .where(and(eq(parVendorDocuments.id, c.req.param("docId")), eq(parVendorDocuments.tenantId, user.tenantId)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

parVendorProfileRoutes.delete("/documents/:docId", parUuidGuard("docId"), async (c) => {
  const user = c.get("user");
  const [row] = await db
    .delete(parVendorDocuments)
    .where(and(eq(parVendorDocuments.id, c.req.param("docId")), eq(parVendorDocuments.tenantId, user.tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
