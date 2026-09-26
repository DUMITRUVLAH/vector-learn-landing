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
import { and, desc, eq, inArray, isNull, or, ilike, sql } from "drizzle-orm";
import { db } from "../db/client";
import { crmCompanies } from "../db/schema/crmCompanies";
import { leads, leadInteractions, leadContacts, leadTags, leadFieldValues } from "../db/schema/leads";
import { crmLeadTasks } from "../db/schema/crmTasks";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { crmPipelines } from "../db/schema/crmPipelines";
import { docDocuments } from "../db/schema/docs";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";
import { normalizeEmail, normalizePhone } from "../lib/crm/normalize";
import { parseDelimited, parseWorkbookTable, detectDelimiter, normalizeIdno } from "../lib/crm/importFile";
import {
  applyCompanyMapping,
  companyColumns,
  companyPatch,
  countCompanyPlan,
  isCompanyImportTarget,
  normalizeCompanyName,
  planCompanyImport,
  rebaseHeader,
  suggestCompanyMapping,
  type CompanyDraft,
  type CompanyFieldMapping,
} from "../lib/crm/companyImport";
import { logCrmAudit } from "../lib/crm/audit";
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

  // Câte oportunități are fiecare firmă — lista arată unde e vânzare, nu doar nume și coduri.
  const counts = new Map<string, number>();
  if (items.length > 0) {
    try {
      const rows = await db
        .select({ companyId: leads.companyId, n: sql<number>`count(*)::int` })
        .from(leads)
        .where(
          and(
            eq(leads.tenantId, user.tenantId),
            isNull(leads.mergedIntoId),
            inArray(
              leads.companyId,
              items.map((i) => i.id)
            )
          )
        )
        .groupBy(leads.companyId);
      for (const r of rows) if (r.companyId) counts.set(r.companyId, Number(r.n));
    } catch {
      // Numărătoarea e un bonus; lista de firme se arată oricum.
    }
  }

  return c.json({ items: items.map((i) => ({ ...i, leadCount: counts.get(i.id) ?? 0 })) });
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

  // O firmă inexistentă sau a altui workspace e 404, ca la `/:id/overview` — nu o listă goală
  // care se poate confunda cu „firma există, dar n-are leaduri".
  const [company] = await db
    .select({ id: crmCompanies.id })
    .from(crmCompanies)
    .where(and(eq(crmCompanies.id, id), eq(crmCompanies.tenantId, user.tenantId)));
  if (!company) return c.json({ error: "not_found" }, 404);

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

// ─── Fișa clientului ─────────────────────────────────────────────────────────

/**
 * Tot ce știe CRM-ul despre o firmă, într-o singură cerere: datele ei, oportunitățile, oamenii de
 * contact, sarcinile deschise, actele și istoricul. Istoricul unei firme e suma istoricelor
 * lead-urilor ei — nu există o a doua cronologie de ținut în sincron.
 */
crmCompaniesRoutes.get("/:id/overview", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return c.json({ error: "not_found" }, 404);

  const [company] = await db
    .select()
    .from(crmCompanies)
    .where(and(eq(crmCompanies.id, id), eq(crmCompanies.tenantId, user.tenantId)));
  if (!company) return c.json({ error: "not_found" }, 404);

  const leadRows = await db
    .select({
      id: leads.id,
      fullName: leads.fullName,
      dealName: leads.dealName,
      phone: leads.phone,
      email: leads.email,
      stage: leads.stage,
      pipelineId: leads.pipelineId,
      valueCents: leads.valueCents,
      assignedTo: leads.assignedTo,
      createdAt: leads.createdAt,
      updatedAt: leads.updatedAt,
    })
    .from(leads)
    .where(and(eq(leads.tenantId, user.tenantId), eq(leads.companyId, id), isNull(leads.mergedIntoId)))
    .orderBy(desc(leads.updatedAt))
    .limit(200);
  const leadIds = leadRows.map((l) => l.id);

  // Cererile care depind doar de lista de lead-uri pleacă împreună; fiecare se degradează la gol
  // dacă tabela ei lipsește pe un workspace vechi — fișa se deschide oricum.
  const safe = async <T>(q: () => Promise<T[]>): Promise<T[]> => {
    try {
      return await q();
    } catch {
      return [];
    }
  };
  const none = leadIds.length === 0;
  const [stages, pipelines, contacts, tasks, activity, documents, owners] = await Promise.all([
    safe(() =>
      db
        .select({
          key: crmPipelineStages.key,
          label: crmPipelineStages.label,
          pipelineId: crmPipelineStages.pipelineId,
          isWon: crmPipelineStages.isWon,
          isLost: crmPipelineStages.isLost,
        })
        .from(crmPipelineStages)
        .where(eq(crmPipelineStages.tenantId, user.tenantId))
    ),
    safe(() =>
      db
        .select({ id: crmPipelines.id, name: crmPipelines.name })
        .from(crmPipelines)
        .where(eq(crmPipelines.tenantId, user.tenantId))
    ),
    none
      ? Promise.resolve([])
      : safe(() =>
          db
            .select({
              id: leadContacts.id,
              leadId: leadContacts.leadId,
              fullName: leadContacts.fullName,
              role: leadContacts.role,
              phone: leadContacts.phone,
              email: leadContacts.email,
              isPrimary: leadContacts.isPrimary,
            })
            .from(leadContacts)
            .where(and(eq(leadContacts.tenantId, user.tenantId), inArray(leadContacts.leadId, leadIds)))
            .limit(200)
        ),
    none
      ? Promise.resolve([])
      : safe(() =>
          db
            .select({
              id: crmLeadTasks.id,
              leadId: crmLeadTasks.leadId,
              title: crmLeadTasks.title,
              dueAt: crmLeadTasks.dueAt,
              status: crmLeadTasks.status,
            })
            .from(crmLeadTasks)
            .where(
              and(
                eq(crmLeadTasks.tenantId, user.tenantId),
                inArray(crmLeadTasks.leadId, leadIds),
                eq(crmLeadTasks.status, "open")
              )
            )
            .orderBy(crmLeadTasks.dueAt)
            .limit(50)
        ),
    none
      ? Promise.resolve([])
      : safe(() =>
          db
            .select({
              id: leadInteractions.id,
              leadId: leadInteractions.leadId,
              type: leadInteractions.type,
              direction: leadInteractions.direction,
              body: leadInteractions.body,
              occurredAt: leadInteractions.occurredAt,
              userName: users.name,
            })
            .from(leadInteractions)
            .leftJoin(users, eq(users.id, leadInteractions.userId))
            .where(and(eq(leadInteractions.tenantId, user.tenantId), inArray(leadInteractions.leadId, leadIds)))
            .orderBy(desc(leadInteractions.occurredAt))
            .limit(100)
        ),
    none
      ? Promise.resolve([])
      : safe(() =>
          db
            .select({
              id: docDocuments.id,
              leadId: docDocuments.counterpartyId,
              kind: docDocuments.kind,
              docNumber: docDocuments.docNumber,
              title: docDocuments.title,
              status: docDocuments.status,
              totalCents: docDocuments.totalCents,
              currency: docDocuments.currency,
              createdAt: docDocuments.createdAt,
            })
            .from(docDocuments)
            .where(
              and(
                eq(docDocuments.tenantId, user.tenantId),
                eq(docDocuments.counterpartyKind, "crm_lead"),
                inArray(docDocuments.counterpartyId, leadIds)
              )
            )
            .orderBy(desc(docDocuments.createdAt))
            .limit(50)
        ),
    safe(() => {
      const ids = [...new Set(leadRows.map((l) => l.assignedTo).filter((v): v is string => Boolean(v)))];
      if (ids.length === 0) return Promise.resolve([] as { id: string; name: string }[]);
      return db
        .select({ id: users.id, name: users.name })
        .from(users)
        .where(and(eq(users.tenantId, user.tenantId), inArray(users.id, ids)));
    }),
  ]);

  // Cheia etapei e unică în pâlnie, nu în workspace: „new" din două pâlnii sunt etape diferite.
  const stageOf = (pipelineId: string | null, key: string) =>
    stages.find((s) => s.key === key && s.pipelineId === pipelineId) ?? stages.find((s) => s.key === key);
  const ownerName = new Map(owners.map((o) => [o.id, o.name]));
  const pipelineName = new Map(pipelines.map((p) => [p.id, p.name]));

  const dealList = leadRows.map((l) => {
    const st = stageOf(l.pipelineId, l.stage);
    return {
      ...l,
      stageLabel: st?.label ?? l.stage,
      outcome: st?.isWon ? ("won" as const) : st?.isLost ? ("lost" as const) : ("open" as const),
      pipelineName: l.pipelineId ? (pipelineName.get(l.pipelineId) ?? null) : null,
      ownerName: l.assignedTo ? (ownerName.get(l.assignedTo) ?? null) : null,
    };
  });
  const leadName = new Map(leadRows.map((l) => [l.id, l.dealName || l.fullName]));
  const sum = (outcome: "won" | "open" | "lost") =>
    dealList.filter((d) => d.outcome === outcome).reduce((a, d) => a + (d.valueCents ?? 0), 0);

  // Persoanele de pe lead-uri sunt și ele contacte ale firmei; se unifică după telefon/email.
  const people = [
    ...contacts.map((p) => ({ ...p, isPrimary: p.isPrimary === 1, leadName: leadName.get(p.leadId) ?? null })),
    ...leadRows.map((l) => ({
      id: `lead-${l.id}`,
      leadId: l.id,
      fullName: l.fullName,
      role: null as string | null,
      phone: l.phone,
      email: l.email,
      isPrimary: false,
      leadName: l.dealName || null,
    })),
  ];
  const seenPeople = new Set<string>();
  const contactList = people.filter((p) => {
    const key = normalizePhone(p.phone) || normalizeEmail(p.email) || normalizeCompanyName(p.fullName) || p.id;
    if (seenPeople.has(key)) return false;
    seenPeople.add(key);
    return true;
  });

  return c.json({
    company,
    stats: {
      deals: dealList.length,
      openDeals: dealList.filter((d) => d.outcome === "open").length,
      openValueCents: sum("open"),
      wonValueCents: sum("won"),
      lastActivityAt: activity[0]?.occurredAt ?? null,
    },
    deals: dealList,
    contacts: contactList,
    tasks: tasks.map((t) => ({ ...t, leadName: leadName.get(t.leadId) ?? null })),
    documents: documents.map((d) => ({ ...d, leadName: d.leadId ? (leadName.get(d.leadId) ?? null) : null })),
    activity: activity.map((a) => ({ ...a, leadName: leadName.get(a.leadId) ?? null })),
  });
});

// ─── Import de firme ─────────────────────────────────────────────────────────

/** Ca la importul de lead-uri: Vercel refuză corpuri peste ~4.5 MB; un mesaj clar bate un 413 mut. */
const IMPORT_MAX_BYTES = 2_000_000;
const IMPORT_PREVIEW_ROWS = 200;

const companyImportInput = z.object({
  /** CSV/text lipit, sau registrul `.xlsx` în base64 când `format` e „xlsx". */
  text: z.string().min(1, "Nu am primit niciun conținut de importat."),
  format: z.enum(["text", "xlsx"]).default("text"),
  delimiter: z.enum([",", ";", "\t"]).nullish(),
  /** Foaia din registru (0 = prima). */
  sheet: z.number().int().min(0).max(200).default(0),
  /** Rândul cu antetele, numărat de la 1. */
  headerRow: z.number().int().min(1).max(50).default(1),
  mapping: z
    .record(z.string(), z.string().refine(isCompanyImportTarget, "Țintă de mapare necunoscută."))
    .nullish(),
  existingMode: z.enum(["skip", "fill", "overwrite"]).default("fill"),
  fileName: z.string().max(300).nullish(),
});
type CompanyImportInput = z.infer<typeof companyImportInput>;

async function buildCompanyImport(tenantId: string, body: CompanyImportInput) {
  const raw =
    body.format === "xlsx"
      ? await parseWorkbookTable(Buffer.from(body.text, "base64"), { sheet: body.sheet })
      : parseDelimited(body.text, body.delimiter ?? undefined);
  const delimiter = body.format === "xlsx" ? null : (body.delimiter ?? detectDelimiter(body.text));
  // Primele rânduri, brute: omul vede unde începe tabelul și alege rândul antetului.
  const topRows = [raw.headers, ...raw.rows].slice(0, 8);
  const table = rebaseHeader(raw, body.headerRow);

  const mapping: CompanyFieldMapping =
    body.mapping && Object.keys(body.mapping).length > 0
      ? (body.mapping as CompanyFieldMapping)
      : suggestCompanyMapping(table.headers, table.rows.slice(0, 20));
  const drafts = applyCompanyMapping(table, mapping, body.headerRow);

  const existing = await loadExistingCompanyKeys(tenantId, drafts);
  const rows = planCompanyImport(drafts, existing);
  return {
    headers: table.headers,
    delimiter,
    sheetNames: raw.sheetNames ?? [],
    topRows,
    sampleRows: table.rows.slice(0, 3),
    mapping,
    rows,
    counts: countCompanyPlan(rows),
  };
}

/** Cheie de dedup → id fișă, doar pentru cheile care apar în fișier. */
async function loadExistingCompanyKeys(tenantId: string, drafts: CompanyDraft[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const idnos = [...new Set(drafts.map((d) => normalizeIdno(d.idno)).filter((v): v is string => Boolean(v)))];
  const names = [...new Set(drafts.map((d) => normalizeCompanyName(d.name)).filter((v): v is string => Boolean(v)))];
  const normalizedIdno = sql<string>`regexp_replace(upper(regexp_replace(${crmCompanies.idno}, '[^A-Za-z0-9]', '', 'g')), '^MD([0-9]{13})$', '\\1')`;
  for (let i = 0; i < idnos.length; i += 500) {
    const rows = await db
      .select({ id: crmCompanies.id, idno: normalizedIdno })
      .from(crmCompanies)
      .where(and(eq(crmCompanies.tenantId, tenantId), inArray(normalizedIdno, idnos.slice(i, i + 500))));
    for (const r of rows) if (r.idno && !out.has(`idno:${r.idno}`)) out.set(`idno:${r.idno}`, r.id);
  }
  for (let i = 0; i < names.length; i += 500) {
    const rows = await db
      .select({ id: crmCompanies.id, name: crmCompanies.nameNormalized })
      .from(crmCompanies)
      .where(and(eq(crmCompanies.tenantId, tenantId), inArray(crmCompanies.nameNormalized, names.slice(i, i + 500))));
    for (const r of rows) if (r.name && !out.has(`name:${r.name}`)) out.set(`name:${r.name}`, r.id);
  }
  return out;
}

function importError(err: unknown) {
  const msg = err instanceof Error ? err.message : "";
  // Mesajele parserului (limită de rânduri, registru stricat) sunt scrise pentru om.
  if (/rânduri|limita|zip|central directory|end of data/i.test(msg)) {
    return msg.includes("rânduri") ? msg : "Fișierul Excel nu s-a putut citi. Salvează-l din nou ca .xlsx sau ca CSV.";
  }
  return null;
}

crmCompaniesRoutes.post(
  "/import/preview",
  requireCrmPermission("leads.edit"),
  zValidator("json", companyImportInput),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    if (Buffer.byteLength(body.text, "utf8") > IMPORT_MAX_BYTES) {
      return c.json({ error: "Fișierul e prea mare pentru un singur import. Împarte-l în bucăți mai mici." }, 413);
    }
    try {
      const plan = await buildCompanyImport(user.tenantId, body);
      return c.json({
        ...plan,
        rows: plan.rows.slice(0, IMPORT_PREVIEW_ROWS),
        truncated: plan.rows.length > IMPORT_PREVIEW_ROWS,
      });
    } catch (err) {
      const message = importError(err);
      if (message) return c.json({ error: message }, 400);
      throw err;
    }
  }
);

crmCompaniesRoutes.post(
  "/import/run",
  requireCrmPermission("leads.edit"),
  zValidator("json", companyImportInput),
  async (c) => {
    const user = c.get("user");
    const body = c.req.valid("json");
    if (Buffer.byteLength(body.text, "utf8") > IMPORT_MAX_BYTES) {
      return c.json({ error: "Fișierul e prea mare pentru un singur import. Împarte-l în bucăți mai mici." }, 413);
    }
    let plan: Awaited<ReturnType<typeof buildCompanyImport>>;
    try {
      plan = await buildCompanyImport(user.tenantId, body);
    } catch (err) {
      const message = importError(err);
      if (message) return c.json({ error: message }, 400);
      throw err;
    }

    // Aceeași funcție ca la previzualizare → se scrie exact ce a văzut omul.
    const toCreate = plan.rows.filter((r) => r.status === "new");
    let created = 0;
    for (let i = 0; i < toCreate.length; i += 500) {
      const chunk = toCreate.slice(i, i + 500);
      const inserted = await db
        .insert(crmCompanies)
        .values(chunk.map((r) => ({ tenantId: user.tenantId, ...companyColumns(r.draft) })))
        .returning({ id: crmCompanies.id });
      created += inserted.length;
    }

    let updated = 0;
    const toUpdate = body.existingMode === "skip" ? [] : plan.rows.filter((r) => r.status === "exists" && r.existingId);
    if (toUpdate.length > 0) {
      const ids = [...new Set(toUpdate.map((r) => r.existingId as string))];
      const current = new Map<string, typeof crmCompanies.$inferSelect>();
      for (let i = 0; i < ids.length; i += 500) {
        const rows = await db
          .select()
          .from(crmCompanies)
          .where(and(eq(crmCompanies.tenantId, user.tenantId), inArray(crmCompanies.id, ids.slice(i, i + 500))));
        for (const r of rows) current.set(r.id, r);
      }
      for (const r of toUpdate) {
        const row = current.get(r.existingId as string);
        if (!row) continue;
        const patch = companyPatch(row, companyColumns(r.draft), body.existingMode);
        if (Object.keys(patch).length === 0) continue;
        await db
          .update(crmCompanies)
          .set({ ...patch, updatedAt: new Date() })
          .where(and(eq(crmCompanies.id, row.id), eq(crmCompanies.tenantId, user.tenantId)));
        // Două rânduri pot ținti aceeași fișă (IDNO într-unul, nume în altul): al doilea vede ce a scris primul.
        current.set(row.id, { ...row, ...patch } as typeof row);
        updated += 1;
      }
    }

    const counts = plan.counts;
    await logCrmAudit({
      tenantId: user.tenantId,
      actorId: user.id,
      action: "company.imported",
      target: "crm_company",
      after: { fileName: body.fileName ?? null, created, updated, mode: body.existingMode, counts },
    });

    return c.json({
      created,
      updated,
      unchanged: counts.exists - updated,
      skipped: counts.duplicatesInFile + counts.errors,
      counts,
      details: plan.rows
        .filter((r) => r.status === "error")
        .slice(0, 200)
        .map((r) => ({ rowNumber: r.draft.rowNumber, reason: r.errors.join(" ") })),
    });
  }
);

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
