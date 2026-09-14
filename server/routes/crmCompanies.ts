/**
 * CRM — baza unică de firme + detectarea și unificarea duplicatelor.
 *
 * Logica de potrivire și `planMerge` sunt pure, în `server/lib/crm/duplicates.ts`
 * (portate din crm-vector). Aici e stratul de date, unde FIECARE query e filtrat
 * pe `tenantId` — nu există RLS, iar o unificare între workspace-uri ar fi cel
 * mai grav lucru pe care l-ar putea face modulul ăsta.
 *
 * Regula de unificare, preluată din sursă: duplicatul NU se șterge. Se marchează
 * cu `merged_into_id` (coloana exista deja în schemă, pregătită exact pentru
 * asta) și rândurile lui copil se mută pe fișa păstrată. Nimic nu dispare —
 * o unificare greșită trebuie să poată fi explicată după fapt.
 *
 * Montat la /api/crm/companies.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, inArray, isNull, or, ilike, sql } from "drizzle-orm";
import { db } from "../db/client";
import { crmCompanies } from "../db/schema/crmCompanies";
import { leads, leadInteractions, leadContacts, leadTags, leadFieldValues } from "../db/schema/leads";
import { crmLeadTasks } from "../db/schema/crmTasks";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { normalizeEmail, normalizePhone } from "../lib/crm/normalize";
import {
  groupDuplicates,
  leadToDedupRecord,
  planMerge,
  DUPLICATE_THRESHOLD,
  type LeadRecord,
} from "../lib/crm/duplicates";

export const crmCompaniesRoutes = new Hono<{ Variables: AuthVariables }>();
crmCompaniesRoutes.use("/*", requireAuth);

/** Numele normalizat pentru căutare și dedup. */
function normalizeName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return raw.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase() || null;
}

const companyInput = z.object({
  name: z.string().min(2, "Numele firmei e prea scurt"),
  idno: z.string().max(40).nullish(),
  industry: z.string().max(120).nullish(),
  region: z.string().max(120).nullish(),
  companySize: z.string().max(40).nullish(),
  website: z.string().max(300).nullish(),
  phone: z.string().max(32).nullish(),
  email: z.string().max(255).nullish(),
  address: z.string().max(500).nullish(),
  notes: z.string().nullish(),
});

// ─── Lista + căutare ─────────────────────────────────────────────────────────

crmCompaniesRoutes.get("/", async (c) => {
  const user = c.get("user");
  const search = (c.req.query("search") ?? "").trim();

  const conditions = [eq(crmCompanies.tenantId, user.tenantId)];
  if (search) {
    const like = `%${search}%`;
    const clause = or(
      ilike(crmCompanies.name, like),
      ilike(crmCompanies.idno, like),
      ilike(crmCompanies.email, like),
      ilike(crmCompanies.phone, like)
    );
    if (clause) conditions.push(clause);
  }

  const items = await db
    .select()
    .from(crmCompanies)
    .where(and(...conditions))
    .orderBy(crmCompanies.name)
    .limit(500);

  return c.json({ items });
});

crmCompaniesRoutes.post("/", zValidator("json", companyInput), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const [row] = await db
    .insert(crmCompanies)
    .values({
      tenantId: user.tenantId,
      name: body.name,
      nameNormalized: normalizeName(body.name),
      idno: body.idno ?? null,
      industry: body.industry ?? null,
      region: body.region ?? null,
      companySize: body.companySize ?? null,
      website: body.website ?? null,
      phone: body.phone ?? null,
      phoneNormalized: normalizePhone(body.phone),
      email: body.email ?? null,
      emailNormalized: normalizeEmail(body.email),
      address: body.address ?? null,
      notes: body.notes ?? null,
    })
    .returning();

  return c.json(row, 201);
});

crmCompaniesRoutes.patch("/:id", zValidator("json", companyInput.partial()), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select({ id: crmCompanies.id })
    .from(crmCompanies)
    .where(and(eq(crmCompanies.id, id), eq(crmCompanies.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const [row] = await db
    .update(crmCompanies)
    .set({
      ...(body.name !== undefined ? { name: body.name, nameNormalized: normalizeName(body.name) } : {}),
      ...(body.idno !== undefined ? { idno: body.idno ?? null } : {}),
      ...(body.industry !== undefined ? { industry: body.industry ?? null } : {}),
      ...(body.region !== undefined ? { region: body.region ?? null } : {}),
      ...(body.companySize !== undefined ? { companySize: body.companySize ?? null } : {}),
      ...(body.website !== undefined ? { website: body.website ?? null } : {}),
      ...(body.phone !== undefined
        ? { phone: body.phone ?? null, phoneNormalized: normalizePhone(body.phone) }
        : {}),
      ...(body.email !== undefined
        ? { email: body.email ?? null, emailNormalized: normalizeEmail(body.email) }
        : {}),
      ...(body.address !== undefined ? { address: body.address ?? null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(crmCompanies.id, id), eq(crmCompanies.tenantId, user.tenantId)))
    .returning();

  return c.json(row);
});

/** Lead-urile legate de o firmă. */
crmCompaniesRoutes.get("/:id/leads", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const items = await db
    .select({
      id: leads.id,
      fullName: leads.fullName,
      stage: leads.stage,
      valueCents: leads.valueCents,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(and(eq(leads.tenantId, user.tenantId), eq(leads.companyId, id)))
    .limit(200);

  return c.json({ items });
});

// ─── Duplicate ───────────────────────────────────────────────────────────────

/** Lead-urile active ale workspace-ului, în forma cerută de dedup. */
async function activeLeads(tenantId: string): Promise<LeadRecord[]> {
  const rows = await db
    .select({
      id: leads.id,
      fullName: leads.fullName,
      phone: leads.phone,
      phoneNormalized: leads.phoneNormalized,
      email: leads.email,
      emailNormalized: leads.emailNormalized,
      company: leads.company,
      companyId: leads.companyId,
      dealName: leads.dealName,
      interestCourse: leads.interestCourse,
      stage: leads.stage,
      valueCents: leads.valueCents,
      debtCents: leads.debtCents,
      assignedTo: leads.assignedTo,
      lostReason: leads.lostReason,
      notes: leads.notes,
    })
    .from(leads)
    // Fișele deja unificate nu mai intră în detecție — altfel ar reapărea la infinit.
    .where(and(eq(leads.tenantId, tenantId), isNull(leads.mergedIntoId)))
    .limit(5000);

  return rows.map((r) => ({ ...r, valueCents: r.valueCents ?? 0, debtCents: r.debtCents ?? 0 }));
}

crmCompaniesRoutes.get("/duplicates", async (c) => {
  const user = c.get("user");
  const rows = await activeLeads(user.tenantId);
  const clusters = groupDuplicates(rows.map(leadToDedupRecord), DUPLICATE_THRESHOLD);

  // Întoarcem fișele întregi, ca interfața să poată arăta comparația
  // cap-la-cap fără încă o cerere.
  const byId = new Map(rows.map((r) => [r.id, r]));
  return c.json({
    clusters: clusters.map((cl) => ({
      score: cl.score,
      reasons: cl.reasons,
      records: cl.records.map((r) => byId.get(r.id)).filter(Boolean),
    })),
  });
});

const mergeInput = z.object({
  primaryId: z.string().uuid(),
  duplicateIds: z.array(z.string().uuid()).min(1),
});

/** Previzualizarea unificării — pură, nu scrie nimic. */
crmCompaniesRoutes.post("/merge/preview", zValidator("json", mergeInput), async (c) => {
  const user = c.get("user");
  const { primaryId, duplicateIds } = c.req.valid("json");
  const rows = await activeLeads(user.tenantId);

  const primary = rows.find((r) => r.id === primaryId);
  const dups = rows.filter((r) => duplicateIds.includes(r.id));
  // Dacă vreun id nu e în workspace-ul curent, nu e „not found" întâmplător —
  // e exact tentativa pe care trebuie s-o refuzăm.
  if (!primary || dups.length !== duplicateIds.length) return c.json({ error: "not_found" }, 404);

  return c.json({ plan: planMerge(primary, dups) });
});

crmCompaniesRoutes.post("/merge", zValidator("json", mergeInput), async (c) => {
  const user = c.get("user");
  const { primaryId, duplicateIds } = c.req.valid("json");
  if (duplicateIds.includes(primaryId)) return c.json({ error: "cannot_merge_into_itself" }, 400);

  const rows = await activeLeads(user.tenantId);
  const primary = rows.find((r) => r.id === primaryId);
  const dups = rows.filter((r) => duplicateIds.includes(r.id));
  if (!primary || dups.length !== duplicateIds.length) return c.json({ error: "not_found" }, 404);

  const plan = planMerge(primary, dups);
  const dupIds = dups.map((d) => d.id);

  // ── Ordinea scrierilor ───────────────────────────────────────────────────
  // Întâi completăm fișa păstrată, apoi mutăm copiii, apoi marcăm duplicatele.
  // Dacă pică ceva la mijloc, cel mai rău caz e o fișă cu rânduri mutate dar
  // nemarcată ca unificată — vizibilă și reparabilă. Ordinea inversă ar putea
  // lăsa o fișă marcată ca unificată cu istoricul încă agățat de ea.

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const f of plan.fields) {
    if (f.keep === "duplicate") patch[f.field as string] = f.value;
  }
  patch.valueCents = plan.valueCentsTotal;
  patch.debtCents = plan.debtCentsTotal;
  await db
    .update(leads)
    .set(patch)
    .where(and(eq(leads.id, primaryId), eq(leads.tenantId, user.tenantId)));

  // Copiii se mută pe fișa păstrată. Tag-urile și valorile de câmpuri au
  // unicitate pe (lead, cheie): cele care s-ar ciocni rămân pe duplicatul
  // marcat — nu se șterge nimic, doar nu se re-inserează.
  await db
    .update(leadInteractions)
    .set({ leadId: primaryId })
    .where(and(eq(leadInteractions.tenantId, user.tenantId), inArray(leadInteractions.leadId, dupIds)));
  await db
    .update(leadContacts)
    .set({ leadId: primaryId })
    .where(and(eq(leadContacts.tenantId, user.tenantId), inArray(leadContacts.leadId, dupIds)));
  await db
    .update(crmLeadTasks)
    .set({ leadId: primaryId })
    .where(and(eq(crmLeadTasks.tenantId, user.tenantId), inArray(crmLeadTasks.leadId, dupIds)));

  const existingTags = await db
    .select({ tag: leadTags.tag })
    .from(leadTags)
    .where(and(eq(leadTags.tenantId, user.tenantId), eq(leadTags.leadId, primaryId)));
  const have = new Set(existingTags.map((t) => t.tag));
  const dupTags = await db
    .select({ id: leadTags.id, tag: leadTags.tag })
    .from(leadTags)
    .where(and(eq(leadTags.tenantId, user.tenantId), inArray(leadTags.leadId, dupIds)));
  const movable = dupTags.filter((t) => !have.has(t.tag)).map((t) => t.id);
  if (movable.length) {
    await db.update(leadTags).set({ leadId: primaryId }).where(inArray(leadTags.id, movable));
  }

  const existingFields = await db
    .select({ fieldId: leadFieldValues.fieldId })
    .from(leadFieldValues)
    .where(and(eq(leadFieldValues.tenantId, user.tenantId), eq(leadFieldValues.leadId, primaryId)));
  const haveFields = new Set(existingFields.map((f) => f.fieldId));
  const dupFields = await db
    .select({ id: leadFieldValues.id, fieldId: leadFieldValues.fieldId })
    .from(leadFieldValues)
    .where(and(eq(leadFieldValues.tenantId, user.tenantId), inArray(leadFieldValues.leadId, dupIds)));
  const movableFields = dupFields.filter((f) => !haveFields.has(f.fieldId)).map((f) => f.id);
  if (movableFields.length) {
    await db.update(leadFieldValues).set({ leadId: primaryId }).where(inArray(leadFieldValues.id, movableFields));
  }

  // Urma în istoric: ce s-a unificat și când. Fără ea, o unificare greșită
  // n-ar putea fi explicată după fapt.
  await db.insert(leadInteractions).values({
    tenantId: user.tenantId,
    leadId: primaryId,
    type: "system",
    direction: "internal",
    body: `Unificare: ${dups.map((d) => d.fullName).join(", ")} (${dupIds.length} fișe)`,
    metadata: { mergedIds: dupIds, plan: { fields: plan.fields.length } },
    userId: user.id,
  });

  // Duplicatele NU se șterg — se marchează.
  await db
    .update(leads)
    .set({ mergedIntoId: primaryId, updatedAt: new Date() })
    .where(and(eq(leads.tenantId, user.tenantId), inArray(leads.id, dupIds)));

  const [merged] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, primaryId), eq(leads.tenantId, user.tenantId)));

  return c.json({ ok: true, lead: merged, mergedCount: dupIds.length });
});
