/**
 * CRM Faza 1+2 — Leads / Pipeline API
 *
 * Mounted at /api/crm/leads (app.ts: app.route("/api/crm/leads", crmLeadsRoutes))
 *
 * GET    /api/crm/leads/pipeline          — lead-uri grupate pe etapă (kanban), plafonate la
 *                                            50/coloană, dar cu numărători/sume pe SETUL COMPLET.
 *                                            Coloanele vin din `crm_pipeline_stages`, per tenant
 *                                            (nu mai sunt hardcodate) — vezi server/lib/crm/stages.ts.
 * GET    /api/crm/leads                   — listă paginată, cu căutare + filtre + sortare
 * GET    /api/crm/leads/:id               — un lead (404 dacă nu e în tenant)
 * GET    /api/crm/leads/:id/detail        — lead + istoric + etapa curentă, într-o singură cerere
 * POST   /api/crm/leads                   — creare
 * PATCH  /api/crm/leads/:id               — actualizare parțială
 * PATCH  /api/crm/leads/:id/stage         — schimbare etapă (cu regulile de business de mai jos)
 * GET    /api/crm/leads/:id/interactions  — istoricul lead-ului (note/apeluri/schimbări de etapă)
 * POST   /api/crm/leads/:id/interactions  — adaugă o interacțiune
 *
 * Reguli de business pe /:id/stage:
 *  - cheia țintă trebuie să existe în `crm_pipeline_stages` a tenantului → altfel
 *    400 { error: "unknown_stage" }
 *  - mutarea într-o etapă cu flagul `is_lost` fără `lostReason` nenul →
 *    400 { error: "lost_reason_required" } — regula urmărește FLAGUL, nu literalul "lost": un
 *    workspace poate redenumi sau adăuga alte etape de tip „pierdut"
 *  - orice schimbare de etapă scrie un rând în lead_interactions (type: "stage_change")
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadInteractions, type NewLead, type NewLeadInteraction } from "../db/schema/leads";
import { crmPipelineStages, type CrmPipelineStage } from "../db/schema/crmPipelineStages";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { normalizePhone, normalizeEmail } from "../lib/crm/normalize";
import { ensureTenantStages, DEFAULT_STAGES } from "../lib/crm/stages";

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

// NU mai există un `LEAD_STAGES` static: etapele sunt per-tenant, în `crm_pipeline_stages`
// (migrarea 0162). Orice validare de etapă interoghează acum baza — vezi /pipeline și
// PATCH /:id/stage mai jos.

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
  // Liber, nu mai e un enum static — cheia trebuie să existe în `crm_pipeline_stages` a
  // tenantului, dar POST/PATCH generice pe lead nu forțează validarea asta (doar PATCH
  // /:id/stage, ruta dedicată schimbării de etapă, o face — vezi mai jos).
  stage: z.string().min(1).max(64).optional(),
  valueCents: z.number().int().min(0).optional(),
  assignedTo: z.string().uuid().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

const createLeadSchema = leadFieldsSchema;
const updateLeadSchema = leadFieldsSchema.partial();

const stageChangeSchema = z.object({
  stage: z.string().min(1, "Etapa este obligatorie").max(64),
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
  // Vizibil și în catch: dacă etapele s-au citit cu succes înainte ca o interogare ULTERIOARĂ să
  // pice (schemă în urma codului), degradăm cu etapele REALE ale tenantului — nu cu cele 5
  // implicite hardcodate — ca o pâlnie redenumită/particularizată să nu-și piardă coloanele.
  let stageRows: CrmPipelineStage[] = [];
  try {
    // Workspace nou / migrarea 0162 nu l-a atins încă → primește cele 5 etape implicite acum, nu
    // rămâne cu o pâlnie goală.
    await ensureTenantStages(tenantId);

    stageRows = await db
      .select()
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.tenantId, tenantId))
      .orderBy(asc(crmPipelineStages.orderIndex));
    const stageKeys = stageRows.map((s) => s.key);

    // O SINGURĂ interogare pentru carduri, nu una pe etapă.
    // De ce contează: pe Vercel pool-ul e `max: 3` cu `connect_timeout: 10`
    // (server/db/client.ts). O variantă cu o interogare per etapă ar cere N conexiuni
    // simultan dintr-un pool de 3 — și N nu mai e o constantă de cod, e câte etape
    // și-a configurat tenantul. Aducem lead-urile o dată, grupate în JS; plafonul de
    // 50/coloană e o preocupare de afișare, nu un motiv să lovim baza de N ori.
    const recent = await db
      .select(LEAD_COLS)
      .from(leads)
      .where(eq(leads.tenantId, tenantId))
      .orderBy(desc(leads.createdAt))
      .limit(500);

    const grouped: Record<string, typeof recent> = {};
    const counts: Record<string, number> = {};
    const valueSums: Record<string, number> = {};
    for (const key of stageKeys) {
      grouped[key] = [];
      counts[key] = 0;
      valueSums[key] = 0;
    }
    for (const lead of recent) {
      const column = grouped[lead.stage];
      if (column && column.length < 50) column.push(lead);
    }

    // IMPORTANT: numărătorile/sumele NU se calculează din `grouped` (plafonat la 50) — trebuie să
    // reflecte TOATE lead-urile tenantului, altfel o coloană cu >50 lead-uri ar minți pe dashboard.
    const aggRows = await db
      .select({
        stage: leads.stage,
        cnt: sql<number>`count(*)::int`,
        // `sum()` peste `integer` întoarce BIGINT. Turnat în `::int`, orice pâlnie
        // care trece de ~21 mil. în valoare totală arunca „integer out of range"
        // și dobora toată pagina — exact bug-ul de pe producție. Păstrăm bigint
        // (postgres-js îl dă ca string) și convertim în JS, unde întregii sunt
        // exacți până la 2^53, cu mult peste orice sumă în bani.
        sumValue: sql<string>`coalesce(sum(${leads.valueCents}), 0)::bigint`,
      })
      .from(leads)
      .where(eq(leads.tenantId, tenantId))
      .groupBy(leads.stage);

    let totalValueCents = 0;
    for (const row of aggRows) {
      const sum = Number(row.sumValue ?? 0);
      totalValueCents += sum;
      // Un lead poate purta o cheie de etapă care nu (mai) e o coloană cunoscută — ex. import
      // direct în bază cu o cheie greșită. Intră oricum în total (nimic nu dispare din valoarea
      // pâlniei), dar nu are coloană proprie în `grouped`/`counts`/`valueSums`.
      if (row.stage in counts) {
        counts[row.stage] = Number(row.cnt ?? 0);
        valueSums[row.stage] = sum;
      }
    }

    return c.json({ stages: stageRows, grouped, counts, valueSums, totalValueCents });
  } catch (e) {
    if (isMissingSchemaError(e)) {
      // Schema din bază e în urma codului: răspundem cu o tablă goală, ca
      // utilizatorul să vadă „niciun lead" în loc de o eroare roșie. Logăm tare,
      // fiindcă asta înseamnă că `sync-schema` n-a apucat să vindece încă.
      console.error("[crm/pipeline] schemă incompletă în bază:", e instanceof Error ? e.message : e);
      // Dacă am apucat să citim etapele reale ale tenantului înainte de eroare, le folosim.
      // Altfel (chiar tabela de etape lipsește) cădem pe cele 5 implicite, doar ca UI-ul să aibă
      // ce arăta — nu e un răspuns despre baza REALĂ, e strict fallback de afișare.
      const fallbackStages: readonly { key: string }[] = stageRows.length > 0 ? stageRows : DEFAULT_STAGES;
      const empty = Object.fromEntries(fallbackStages.map((st) => [st.key, [] as unknown[]]));
      const zeros = Object.fromEntries(fallbackStages.map((st) => [st.key, 0]));
      return c.json({
        stages: fallbackStages,
        grouped: empty,
        counts: zeros,
        valueSums: zeros,
        totalValueCents: 0,
        schemaLag: true,
      });
    }
    // TEMPORAR (bug „internal_error" pe prod): întoarcem și motivul, altfel
    // clientul vede doar codul generic din `app.onError`, iar mesajul real
    // rămâne în Consola Platformă. De scos după ce cauza e închisă.
    console.error("[crm/pipeline] eșec:", e instanceof Error ? e.stack ?? e.message : e);
    return c.json(
      { error: "crm_pipeline_failed", reason: (e instanceof Error ? e.message : String(e)).slice(0, 300) },
      500
    );
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

  // Etapele sunt per-tenant și dinamice — nu mai există un set static contra căruia să validăm
  // aici. Un filtru pe o cheie inexistentă e inofensiv: `eq` pe un varchar nu poate face SQL
  // injection, doar întoarce o listă goală.
  if (stage) conditions.push(eq(leads.stage, stage));
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

// ─── GET /:id/detail — lead + istoric + etapă, o singură cerere ──────────────

/**
 * UI-ul deschide un sertar (drawer) de detaliu pe click — trei cereri separate (lead,
 * interacțiuni, etapă) pentru un singur click sunt risipă pe un pool serverless de 3 conexiuni.
 * Lead-ul și interacțiunile sunt independente (rulează în paralel); eticheta/culoarea etapei
 * depinde de `lead.stage`, deci se citește DUPĂ ce știm lead-ul.
 */
crmLeadsRoutes.get("/:id/detail", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [leadRows, interactions] = await Promise.all([
    db
      .select(LEAD_COLS)
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId))),
    db
      .select()
      .from(leadInteractions)
      .where(and(eq(leadInteractions.tenantId, user.tenantId), eq(leadInteractions.leadId, id)))
      .orderBy(desc(leadInteractions.occurredAt))
      .limit(100),
  ]);

  const lead = leadRows[0];
  if (!lead) return c.json({ error: "not_found" }, 404);

  const [stage] = await db
    .select()
    .from(crmPipelineStages)
    .where(and(eq(crmPipelineStages.tenantId, user.tenantId), eq(crmPipelineStages.key, lead.stage)));

  return c.json({ lead, interactions, stage: stage ?? null });
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

  // Cheia țintă trebuie să existe printre etapele TENANTULUI curent — o cheie necunoscută (ștearsă,
  // typo din UI, dintr-un alt workspace) nu are voie să scrie un `leads.stage` „orfan", fără nicio
  // coloană din pâlnie care să-l mai arate.
  const [targetStage] = await db
    .select({ key: crmPipelineStages.key, isLost: crmPipelineStages.isLost })
    .from(crmPipelineStages)
    .where(and(eq(crmPipelineStages.tenantId, user.tenantId), eq(crmPipelineStages.key, stage)));
  if (!targetStage) return c.json({ error: "unknown_stage" }, 400);

  // Regulă de business: nu se poate marca un lead „pierdut" fără un motiv — altfel raportul de
  // lead-uri pierdute rămâne mut despre DE CE s-a pierdut vânzarea. Cheia deciziei e flagul
  // `is_lost`, NU literalul "lost": un workspace poate redenumi etapa implicită sau adăuga alte
  // etape de tip „pierdut" (ex. „Anulat de client"), și regula trebuie să le urmărească pe toate.
  if (targetStage.isLost && (!lostReason || lostReason.trim().length === 0)) {
    return c.json({ error: "lost_reason_required" }, 400);
  }

  const [existing] = await db
    .select({ id: leads.id, stage: leads.stage })
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const fromStage = existing.stage;

  const updates: Partial<NewLead> = { stage, updatedAt: new Date() };
  if (targetStage.isLost) updates.lostReason = lostReason ?? null;

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
