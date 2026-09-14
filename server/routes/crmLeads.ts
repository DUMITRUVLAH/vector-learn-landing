/**
 * CRM Faza 1 — Leads / Pipeline API
 *
 * Mounted at /api/crm/leads (app.ts: app.route("/api/crm/leads", crmLeadsRoutes))
 *
 * GET    /api/crm/leads/pipeline          — lead-uri grupate pe etapă (kanban), plafonate la
 *                                            50/coloană, dar cu numărători/sume pe SETUL COMPLET
 * GET    /api/crm/leads                   — listă paginată, cu căutare + filtre + sortare
 * GET    /api/crm/leads/:id               — un lead (404 dacă nu e în tenant)
 * POST   /api/crm/leads                   — creare
 * PATCH  /api/crm/leads/:id               — actualizare parțială
 * PATCH  /api/crm/leads/:id/stage         — schimbare etapă (cu regulile de business de mai jos)
 * GET    /api/crm/leads/:id/interactions  — istoricul lead-ului (note/apeluri/schimbări de etapă)
 * POST   /api/crm/leads/:id/interactions  — adaugă o interacțiune
 *
 * Reguli de business pe /:id/stage:
 *  - mutarea în "lost" fără `lostReason` nenul → 400 { error: "lost_reason_required" }
 *  - orice schimbare de etapă scrie un rând în lead_interactions (type: "stage_change")
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadInteractions, type NewLead, type NewLeadInteraction } from "../db/schema/leads";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { normalizePhone, normalizeEmail } from "../lib/crm/normalize";

/**
 * Coloanele pe care le întoarce API-ul — EXACT cele din `CrmLead` (src/lib/api/crm.ts).
 *
 * De ce nu `db.select()`: selectul implicit cere toate coloanele declarate în
 * schema drizzle, iar `leads` a acumulat de-a lungul timpului coloane pe care o
 * bază mai veche (producția) poate să nu le aibă încă — schema din cod merge
 * înaintea bazei, iar `sync-schema` rulează abia la deploy și e non-fatal.
 * O singură coloană lipsă transforma TOATĂ pagina într-un 500. Cerând doar ce
 * afișăm, suprafața de rupere scade de la ~30 de coloane la 15.
 */
const LEAD_COLS = {
  id: leads.id,
  fullName: leads.fullName,
  dealName: leads.dealName,
  phone: leads.phone,
  email: leads.email,
  company: leads.company,
  interestCourse: leads.interestCourse,
  source: leads.source,
  stage: leads.stage,
  valueCents: leads.valueCents,
  assignedTo: leads.assignedTo,
  lostReason: leads.lostReason,
  createdAt: leads.createdAt,
  updatedAt: leads.updatedAt,
} as const;

/**
 * Baza de producție poate rămâne în urma codului (migrările nu se aplică fiabil
 * acolo — vezi server/db/sync-schema.ts). Când lipsește o tabelă sau o coloană,
 * pagina trebuie să arate o stare goală, nu un dreptunghi roșu „internal_error".
 * Regula e scrisă explicit în CLAUDE.md: „make the query degrade gracefully
 * (catch missing-table → empty result) so a lag never crashes the page".
 */
function isMissingSchemaError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /does not exist|relation .* does not exist|column .* does not exist|undefined_table|undefined_column/i.test(msg);
}

export const crmLeadsRoutes = new Hono<{ Variables: AuthVariables }>();
crmLeadsRoutes.use("/*", requireAuth);

// ─── Enum-uri locale (oglindesc valorile din server/db/schema/leads.ts) ───────

const LEAD_STAGES = ["new", "contacted", "trial", "paid", "lost"] as const;
type LeadStage = (typeof LEAD_STAGES)[number];

const LEAD_SOURCES = [
  "webform",
  "manual",
  "facebook_ad",
  "google_ads",
  "referral",
  "phone_in",
  "instagram",
  "import",
  "other",
] as const;

const INTERACTION_TYPES = [
  "note",
  "call",
  "email",
  "whatsapp",
  "sms",
  "meeting",
  "stage_change",
  "system",
] as const;

const INTERACTION_DIRECTIONS = ["inbound", "outbound", "internal"] as const;

function isLeadStage(value: string): value is LeadStage {
  return (LEAD_STAGES as readonly string[]).includes(value);
}

function isLeadSource(value: string): value is (typeof LEAD_SOURCES)[number] {
  return (LEAD_SOURCES as readonly string[]).includes(value);
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const leadFieldsSchema = z.object({
  fullName: z.string().min(2, "Numele este obligatoriu (minim 2 caractere)"),
  phone: z.string().max(32).optional().nullable(),
  email: z.string().email("Adresa de email este invalidă").max(255).optional().nullable(),
  company: z.string().max(300).optional().nullable(),
  dealName: z.string().max(300).optional().nullable(),
  interestCourse: z.string().max(200).optional().nullable(),
  source: z.enum(LEAD_SOURCES).optional(),
  stage: z.enum(LEAD_STAGES).optional(),
  valueCents: z.number().int().min(0).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const createLeadSchema = leadFieldsSchema;
const updateLeadSchema = leadFieldsSchema.partial();

const stageChangeSchema = z.object({
  stage: z.enum(LEAD_STAGES),
  lostReason: z.string().max(500).optional(),
});

const createInteractionSchema = z.object({
  type: z.enum(INTERACTION_TYPES),
  body: z.string().max(2000).optional(),
  direction: z.enum(INTERACTION_DIRECTIONS).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ─── GET /pipeline (ÎNAINTE de /:id — altfel "pipeline" ar fi citit ca un id) ─

crmLeadsRoutes.get("/pipeline", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  try {

    // Cardurile afișate: max 50 pe etapă, cele mai recente primele.
    const cappedByStage = await Promise.all(
      LEAD_STAGES.map((stage) =>
        db
          .select(LEAD_COLS)
          .from(leads)
          .where(and(eq(leads.tenantId, tenantId), eq(leads.stage, stage)))
          .orderBy(desc(leads.createdAt))
          .limit(50)
      )
    );

    const grouped = {} as Record<LeadStage, (typeof cappedByStage)[number]>;
    LEAD_STAGES.forEach((stage, i) => {
      grouped[stage] = cappedByStage[i];
    });

    // IMPORTANT: numărătorile/sumele NU se calculează din `grouped` (plafonat la 50) — trebuie să
    // reflecte TOATE lead-urile tenantului, altfel o coloană cu >50 lead-uri ar minți pe dashboard.
    const aggRows = await db
      .select({
        stage: leads.stage,
        cnt: sql<number>`count(*)::int`,
        sumValue: sql<number>`coalesce(sum(${leads.valueCents}), 0)::int`,
      })
      .from(leads)
      .where(eq(leads.tenantId, tenantId))
      .groupBy(leads.stage);

    const counts = {} as Record<LeadStage, number>;
    const valueSums = {} as Record<LeadStage, number>;
    LEAD_STAGES.forEach((stage) => {
      counts[stage] = 0;
      valueSums[stage] = 0;
    });

    let totalValueCents = 0;
    for (const row of aggRows) {
      const stage = row.stage as LeadStage;
      counts[stage] = row.cnt;
      valueSums[stage] = row.sumValue;
      totalValueCents += row.sumValue;
    }

    return c.json({ grouped, counts, valueSums, totalValueCents });
  } catch (e) {
    if (isMissingSchemaError(e)) {
      // Schema din bază e în urma codului: răspundem cu o tablă goală, ca
      // utilizatorul să vadă „niciun lead" în loc de o eroare roșie. Logăm tare,
      // fiindcă asta înseamnă că `sync-schema` n-a apucat să vindece încă.
      console.error("[crm/pipeline] schemă incompletă în bază:", e instanceof Error ? e.message : e);
      const empty = Object.fromEntries(LEAD_STAGES.map((st) => [st, [] as unknown[]]));
      const zeros = Object.fromEntries(LEAD_STAGES.map((st) => [st, 0]));
      return c.json({ grouped: empty, counts: zeros, valueSums: zeros, totalValueCents: 0, schemaLag: true });
    }
    throw e;
  }
});

// ─── GET / — listă paginată ───────────────────────────────────────────────────

const SORTABLE_COLUMNS = {
  fullName: leads.fullName,
  company: leads.company,
  stage: leads.stage,
  source: leads.source,
  valueCents: leads.valueCents,
  createdAt: leads.createdAt,
  updatedAt: leads.updatedAt,
} as const;

function isSortKey(value: string): value is keyof typeof SORTABLE_COLUMNS {
  return value in SORTABLE_COLUMNS;
}

crmLeadsRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const {
    page: pageParam,
    pageSize: pageSizeParam,
    search,
    stage,
    source,
    assignedTo,
    sort,
    dir,
  } = c.req.query();

  const page = Math.max(parseInt(pageParam ?? "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(pageSizeParam ?? "20", 10) || 20, 1), 100);

  const conditions = [eq(leads.tenantId, tenantId)];

  if (search) {
    const like = `%${search}%`;
    const searchCondition = or(
      ilike(leads.fullName, like),
      ilike(leads.phone, like),
      ilike(leads.email, like),
      ilike(leads.company, like)
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  if (stage && isLeadStage(stage)) conditions.push(eq(leads.stage, stage));
  if (source && isLeadSource(source)) conditions.push(eq(leads.source, source));
  if (assignedTo) conditions.push(eq(leads.assignedTo, assignedTo));

  const where = and(...conditions);

  const sortKey = sort && isSortKey(sort) ? sort : "createdAt";
  const sortColumn = SORTABLE_COLUMNS[sortKey];
  const orderFn = dir === "asc" ? asc : desc;

  const [rows, countResult] = await Promise.all([
    db
      .select(LEAD_COLS)
      .from(leads)
      .where(where)
      .orderBy(orderFn(sortColumn))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ count: sql<number>`count(*)::int` }).from(leads).where(where),
  ]);

  const total = countResult[0]?.count ?? 0;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  return c.json({ items: rows, page, pageSize, total, totalPages });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

crmLeadsRoutes.get("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [row] = await db
    .select(LEAD_COLS)
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId)));

  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json(row);
});

// ─── POST / ───────────────────────────────────────────────────────────────────

crmLeadsRoutes.post("/", zValidator("json", createLeadSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const values: NewLead = {
    tenantId: user.tenantId,
    fullName: body.fullName,
    phoneNormalized: normalizePhone(body.phone),
    emailNormalized: normalizeEmail(body.email),
  };
  if (body.phone !== undefined) values.phone = body.phone;
  if (body.email !== undefined) values.email = body.email;
  if (body.company !== undefined) values.company = body.company;
  if (body.dealName !== undefined) values.dealName = body.dealName;
  if (body.interestCourse !== undefined) values.interestCourse = body.interestCourse;
  if (body.source !== undefined) values.source = body.source;
  if (body.stage !== undefined) values.stage = body.stage;
  if (body.valueCents !== undefined) values.valueCents = body.valueCents;
  if (body.assignedTo !== undefined) values.assignedTo = body.assignedTo;
  if (body.notes !== undefined) values.notes = body.notes;

  const [row] = await db.insert(leads).values(values).returning();
  return c.json(row, 201);
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────

crmLeadsRoutes.patch("/:id", zValidator("json", updateLeadSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const updates: Partial<NewLead> = { updatedAt: new Date() };
  if (body.fullName !== undefined) updates.fullName = body.fullName;
  if (body.phone !== undefined) {
    updates.phone = body.phone;
    updates.phoneNormalized = normalizePhone(body.phone);
  }
  if (body.email !== undefined) {
    updates.email = body.email;
    updates.emailNormalized = normalizeEmail(body.email);
  }
  if (body.company !== undefined) updates.company = body.company;
  if (body.dealName !== undefined) updates.dealName = body.dealName;
  if (body.interestCourse !== undefined) updates.interestCourse = body.interestCourse;
  if (body.source !== undefined) updates.source = body.source;
  if (body.stage !== undefined) updates.stage = body.stage;
  if (body.valueCents !== undefined) updates.valueCents = body.valueCents;
  if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;
  if (body.notes !== undefined) updates.notes = body.notes;

  const [row] = await db
    .update(leads)
    .set(updates)
    .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId)))
    .returning();

  return c.json(row);
});

// ─── PATCH /:id/stage ─────────────────────────────────────────────────────────

crmLeadsRoutes.patch("/:id/stage", zValidator("json", stageChangeSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { stage, lostReason } = c.req.valid("json");

  // Regulă de business: nu se poate marca un lead ca "pierdut" fără un motiv — altfel raportul
  // de lead-uri pierdute rămâne mut despre DE CE s-a pierdut vânzarea.
  if (stage === "lost" && (!lostReason || lostReason.trim().length === 0)) {
    return c.json({ error: "lost_reason_required" }, 400);
  }

  const [existing] = await db
    .select({ id: leads.id, stage: leads.stage })
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const fromStage = existing.stage;

  const updates: Partial<NewLead> = { stage, updatedAt: new Date() };
  if (stage === "lost") updates.lostReason = lostReason ?? null;

  const [row] = await db
    .update(leads)
    .set(updates)
    .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId)))
    .returning();

  // Orice schimbare de etapă lasă o urmă în istoric — fără asta, nimeni nu poate reconstitui
  // parcursul unui lead prin pipeline (cine l-a mutat, când, de ce a fost pierdut).
  const interaction: NewLeadInteraction = {
    tenantId: user.tenantId,
    leadId: id,
    type: "stage_change",
    direction: "internal",
    body: `${fromStage} → ${stage}`,
    metadata: { from: fromStage, to: stage, lostReason: lostReason ?? null },
    userId: user.id,
  };
  await db.insert(leadInteractions).values(interaction);

  return c.json(row);
});

// ─── GET /:id/interactions ────────────────────────────────────────────────────

crmLeadsRoutes.get("/:id/interactions", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId)));
  if (!lead) return c.json({ error: "not_found" }, 404);

  const items = await db
    .select()
    .from(leadInteractions)
    .where(and(eq(leadInteractions.tenantId, user.tenantId), eq(leadInteractions.leadId, id)))
    .orderBy(desc(leadInteractions.occurredAt))
    .limit(100);

  return c.json({ items });
});

// ─── POST /:id/interactions ───────────────────────────────────────────────────

crmLeadsRoutes.post(
  "/:id/interactions",
  zValidator("json", createInteractionSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const { type, body, direction, metadata } = c.req.valid("json");

    const [lead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId)));
    if (!lead) return c.json({ error: "not_found" }, 404);

    const values: NewLeadInteraction = {
      tenantId: user.tenantId,
      leadId: id,
      type,
      direction: direction ?? "internal",
      userId: user.id,
    };
    if (body !== undefined) values.body = body;
    if (metadata !== undefined) values.metadata = metadata;

    const [row] = await db.insert(leadInteractions).values(values).returning();
    return c.json(row, 201);
  }
);
