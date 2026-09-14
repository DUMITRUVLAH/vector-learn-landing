/**
 * CRM Faza 1+2 — Leads / Pipeline API
 *
 * Mounted at /api/crm/leads (app.ts: app.route("/api/crm/leads", crmLeadsRoutes))
 *
 * GET    /api/crm/leads/pipeline?pipelineId= — lead-uri grupate pe etapă (kanban), plafonate la
 *                                            50/coloană, dar cu numărători/sume pe SETUL COMPLET.
 *                                            Coloanele vin din `crm_pipeline_stages`, per tenant
 *                                            (nu mai sunt hardcodate) — vezi server/lib/crm/stages.ts.
 * GET    /api/crm/leads                   — listă paginată, cu căutare + filtre + sortare
 * GET    /api/crm/leads/:id               — un lead (404 dacă nu e în tenant)
 * GET    /api/crm/leads/:id/detail        — lead + istoric + etapa curentă, într-o singură cerere
 * POST   /api/crm/leads                   — creare
 * PATCH  /api/crm/leads/:id               — actualizare parțială
 * PATCH  /api/crm/leads/:id/stage         — schimbare etapă (cu regulile de business de mai jos)
 * PATCH  /api/crm/leads/:id/pipeline      — mutare în altă pâlnie (etapa se reașază pe prima
 *                                            etapă a pâlniei țintă — cheile nu sunt comune)
 * GET    /api/crm/leads/:id/interactions  — istoricul lead-ului (note/apeluri/schimbări de etapă)
 * GET    /api/crm/leads/:id/person-history — alte leaduri ale ACELEIAȘI persoane (telefon/email
 *                                            normalizat) + comentariile lor
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
import { and, asc, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadInteractions, type NewLead, type NewLeadInteraction } from "../db/schema/leads";
import { crmPipelineStages, type CrmPipelineStage } from "../db/schema/crmPipelineStages";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { runAutomations } from "./crmAutomations";
import { assignLeadAutomatically } from "./crmAssignment";
import { normalizePhone, normalizeEmail } from "../lib/crm/normalize";
import { ensureTenantStages, DEFAULT_STAGES } from "../lib/crm/stages";
import { crmPipelines, type CrmPipeline } from "../db/schema/crmPipelines";
import { ensureTenantPipeline, leadsInPipeline } from "../lib/crm/pipelines";
import { enrollByStage, stopCadencesOnReply } from "../lib/crm/cadences";
import { logCrmAudit } from "../lib/crm/audit";

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
  productId: leads.productId,
  probabilityPct: leads.probabilityPct,
  source: leads.source,
  stage: leads.stage,
  pipelineId: leads.pipelineId,
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
  /** Produsul din catalog (`crm_products`). `null` = fără produs ales. */
  productId: z.string().uuid().optional().nullable(),
  /** Probabilitatea acestei oportunități; `null` = se moștenește de la etapă. */
  probabilityPct: z.number().int().min(0).max(100).optional().nullable(),
  source: z.enum(LEAD_SOURCES).optional(),
  // Liber, nu mai e un enum static — cheia trebuie să existe în `crm_pipeline_stages` a
  // tenantului, dar POST/PATCH generice pe lead nu forțează validarea asta (doar PATCH
  // /:id/stage, ruta dedicată schimbării de etapă, o face — vezi mai jos).
  stage: z.string().min(1).max(64).optional(),
  /** Pâlnia leadului; absentă = implicita workspace-ului. */
  pipelineId: z.string().uuid().optional().nullable(),
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


// ─── Pâlnia unei cereri ───────────────────────────────────────────────────────

/**
 * Pâlnia pe care operează cererea: cea cerută explicit (dacă e a tenantului) sau implicita.
 * `null` doar în cazul degradat în care tabela de pâlnii nu poate fi citită — apelanții scriu
 * atunci `pipeline_id = NULL`, care înseamnă tot „implicita".
 */
async function resolveRequestPipeline(
  tenantId: string,
  requestedId: string | null
): Promise<{ id: string; isDefault: boolean } | null> {
  if (requestedId) {
    const [row] = await db
      .select({ id: crmPipelines.id, isDefault: crmPipelines.isDefault })
      .from(crmPipelines)
      .where(and(eq(crmPipelines.id, requestedId), eq(crmPipelines.tenantId, tenantId)));
    return row ?? null;
  }
  const def = await ensureTenantPipeline(tenantId);
  return def ? { id: def.id, isDefault: def.isDefault } : null;
}

/** Etapele unei pâlnii, în ordine. Pentru `null` (degradat) — etapele fără pâlnie ale tenantului. */
async function stagesOfPipeline(tenantId: string, pipelineId: string | null) {
  return db
    .select({
      id: crmPipelineStages.id,
      key: crmPipelineStages.key,
      label: crmPipelineStages.label,
      isLost: crmPipelineStages.isLost,
      orderIndex: crmPipelineStages.orderIndex,
    })
    .from(crmPipelineStages)
    .where(
      pipelineId
        ? and(eq(crmPipelineStages.tenantId, tenantId), eq(crmPipelineStages.pipelineId, pipelineId))
        : and(eq(crmPipelineStages.tenantId, tenantId), isNull(crmPipelineStages.pipelineId))
    )
    .orderBy(asc(crmPipelineStages.orderIndex));
}

// ─── GET /pipeline (ÎNAINTE de /:id — altfel "pipeline" ar fi citit ca un id) ─

crmLeadsRoutes.get("/pipeline", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  // Vizibil și în catch: dacă etapele s-au citit cu succes înainte ca o interogare ULTERIOARĂ să
  // pice (schemă în urma codului), degradăm cu etapele REALE ale tenantului — nu cu cele 5
  // implicite hardcodate — ca o pâlnie redenumită/particularizată să nu-și piardă coloanele.
  let stageRows: CrmPipelineStage[] = [];
  let pipelineRows: CrmPipeline[] = [];
  try {
    // Pâlnia cerută (sau implicita). Toate coloanele, numărătorile și cardurile de mai jos sunt
    // ale UNEI pâlnii — de la migrarea 0166 un workspace poate avea mai multe, iar amestecarea
    // lor ar pune leadurile B2B peste cele de retail, pe coloane care nu le aparțin.
    const defaultPipeline = await ensureTenantPipeline(tenantId);
    pipelineRows = await db
      .select()
      .from(crmPipelines)
      .where(eq(crmPipelines.tenantId, tenantId))
      .orderBy(asc(crmPipelines.orderIndex), asc(crmPipelines.createdAt));

    const requestedId = c.req.query("pipelineId");
    const active =
      (requestedId ? pipelineRows.find((p) => p.id === requestedId) : null) ??
      pipelineRows.find((p) => p.isDefault) ??
      pipelineRows[0] ??
      defaultPipeline;
    // Un `pipelineId` dintr-un alt workspace nu cade în tăcere pe implicită — ar arăta alte date
    // decât cele cerute, fără niciun semn.
    if (requestedId && (!active || active.id !== requestedId)) return c.json({ error: "not_found" }, 404);

    // Pâlnie nouă / migrarea 0162 nu a atins încă workspace-ul → primește cele 5 etape implicite
    // acum, nu rămâne cu un Kanban gol.
    await ensureTenantStages(tenantId, active?.id ?? null);

    stageRows = await db
      .select()
      .from(crmPipelineStages)
      .where(
        active
          ? and(eq(crmPipelineStages.tenantId, tenantId), eq(crmPipelineStages.pipelineId, active.id))
          : and(eq(crmPipelineStages.tenantId, tenantId), isNull(crmPipelineStages.pipelineId))
      )
      .orderBy(asc(crmPipelineStages.orderIndex));
    const stageKeys = stageRows.map((s) => s.key);

    const leadScope = active
      ? and(eq(leads.tenantId, tenantId), leadsInPipeline(active.id, active.isDefault))
      : eq(leads.tenantId, tenantId);

    // O SINGURĂ interogare pentru carduri, nu una pe etapă.
    // De ce contează: pe Vercel pool-ul e `max: 3` cu `connect_timeout: 10`
    // (server/db/client.ts). O variantă cu o interogare per etapă ar cere N conexiuni
    // simultan dintr-un pool de 3 — și N nu mai e o constantă de cod, e câte etape
    // și-a configurat tenantul. Aducem lead-urile o dată, grupate în JS; plafonul de
    // 50/coloană e o preocupare de afișare, nu un motiv să lovim baza de N ori.
    const recent = await db
      .select(LEAD_COLS)
      .from(leads)
      .where(leadScope)
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
      .where(leadScope)
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

    return c.json({
      stages: stageRows,
      grouped,
      counts,
      valueSums,
      totalValueCents,
      pipelines: pipelineRows,
      pipelineId: active?.id ?? null,
    });
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
        pipelines: pipelineRows,
        pipelineId: pipelineRows.find((p) => p.isDefault)?.id ?? pipelineRows[0]?.id ?? null,
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
    pipelineId,
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

  // Filtrul pe pâlnie e citit prin aceeași regulă ca pe kanban: pentru implicită intră și
  // leadurile fără `pipeline_id` (cele dinainte de migrarea 0166).
  if (pipelineId) {
    const [p] = await db
      .select({ id: crmPipelines.id, isDefault: crmPipelines.isDefault })
      .from(crmPipelines)
      .where(and(eq(crmPipelines.id, pipelineId), eq(crmPipelines.tenantId, tenantId)));
    if (!p) return c.json({ error: "not_found" }, 404);
    const cond = leadsInPipeline(p.id, p.isDefault);
    if (cond) conditions.push(cond);
  }

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

  // Leadul se naște într-o pâlnie. Fără asta ar cădea pe „implicita" doar prin convenția NULL,
  // iar mutarea lui ulterioară n-ar avea de unde să știe ce etape îi sunt permise.
  const targetPipeline = await resolveRequestPipeline(user.tenantId, body.pipelineId ?? null);

  const values: NewLead = {
    tenantId: user.tenantId,
    fullName: body.fullName,
    pipelineId: targetPipeline?.id ?? null,
    phoneNormalized: normalizePhone(body.phone),
    emailNormalized: normalizeEmail(body.email),
  };
  if (body.phone !== undefined) values.phone = body.phone;
  if (body.email !== undefined) values.email = body.email;
  if (body.company !== undefined) values.company = body.company;
  if (body.dealName !== undefined) values.dealName = body.dealName;
  if (body.interestCourse !== undefined) values.interestCourse = body.interestCourse;
  if (body.productId !== undefined) values.productId = body.productId;
  if (body.probabilityPct !== undefined) values.probabilityPct = body.probabilityPct;
  if (body.source !== undefined) values.source = body.source;
  if (body.stage !== undefined) {
    values.stage = body.stage;
  } else if (targetPipeline) {
    // Fără etapă explicită, leadul intră pe PRIMA etapă a pâlniei lui — nu pe literalul „new",
    // care într-o pâlnie personalizată poate să nici nu existe.
    const [first] = await stagesOfPipeline(user.tenantId, targetPipeline.id);
    if (first) values.stage = first.key;
  }
  if (body.valueCents !== undefined) values.valueCents = body.valueCents;
  if (body.assignedTo !== undefined) values.assignedTo = body.assignedTo;
  if (body.notes !== undefined) values.notes = body.notes;

  const [row] = await db.insert(leads).values(values).returning();

  // Întâi distribuirea, apoi automatizările: o regulă de automatizare poate
  // depinde de cine e responsabilul (de pildă „creează un task pentru el"), deci
  // lead-ul trebuie să aibă deja un stăpân când ajunge la ele.
  //
  // Ambele rulează DUPĂ ce lead-ul e salvat și niciuna nu poate strica salvarea:
  // nici `assignLeadAutomatically`, nici `runAutomations` nu aruncă. Dacă o
  // regulă e greșită, omul are lead-ul în bază și problema în jurnal — nu un
  // formular pierdut și o eroare fără legătură cu ce tocmai a făcut.
  await assignLeadAutomatically(user.tenantId, row);

  const [afterAssign] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, row.id), eq(leads.tenantId, user.tenantId)));

  await runAutomations({
    tenantId: user.tenantId,
    userId: user.id,
    lead: afterAssign ?? row,
    kind: "lead.created",
    assignFn: async (lead) => {
      const decision = await assignLeadAutomatically(user.tenantId, lead);
      return decision?.userId ?? null;
    },
  });

  // Recitim: o regulă poate să-l fi mutat de etapă sau să-l fi atribuit, iar
  // interfața trebuie să primească starea de după, nu cea de dinainte.
  const [fresh] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, row.id), eq(leads.tenantId, user.tenantId)));

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "lead.created",
    target: "crm_lead",
    targetId: row.id,
    after: { fullName: row.fullName, stage: (fresh ?? row).stage, source: row.source },
  });

  return c.json(fresh ?? row, 201);
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
  if (body.productId !== undefined) updates.productId = body.productId;
  if (body.probabilityPct !== undefined) updates.probabilityPct = body.probabilityPct;
  if (body.source !== undefined) updates.source = body.source;
  if (body.stage !== undefined) updates.stage = body.stage;
  // `pipelineId` NU se schimbă din PATCH-ul generic: mutarea între pâlnii reașază și etapa și
  // lasă urmă în istoric — are rută proprie (`PATCH /:id/pipeline`).
  if (body.valueCents !== undefined) updates.valueCents = body.valueCents;
  if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;
  if (body.notes !== undefined) updates.notes = body.notes;

  const [row] = await db
    .update(leads)
    .set(updates)
    .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId)))
    .returning();

  // Jurnalul păstrează DOAR câmpurile atinse: o copie a leadului întreg la fiecare salvare ar
  // umple `audit_log` cu date care nu s-au schimbat.
  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "lead.updated",
    target: "crm_lead",
    targetId: id,
    after: body,
  });

  return c.json(row);
});

// ─── PATCH /:id/stage ─────────────────────────────────────────────────────────

crmLeadsRoutes.patch("/:id/stage", zValidator("json", stageChangeSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { stage, lostReason } = c.req.valid("json");

  // Leadul întâi, ca să știm în ce pâlnie e: de la migrarea 0166 cheia „new" poate exista în mai
  // multe pâlnii, iar o validare pe tot workspace-ul ar accepta o etapă din pâlnia greșită și ar
  // muta leadul pe o coloană care nu se vede în tabla lui.
  const [existing] = await db
    .select({ id: leads.id, stage: leads.stage, pipelineId: leads.pipelineId })
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const leadPipeline = await resolveRequestPipeline(user.tenantId, existing.pipelineId);
  const pipelineStages = await stagesOfPipeline(user.tenantId, leadPipeline?.id ?? null);

  // Cheia țintă trebuie să existe printre etapele PÂLNIEI leadului — o cheie necunoscută (ștearsă,
  // typo din UI, dintr-un alt workspace sau din altă pâlnie) nu are voie să scrie un `leads.stage`
  // „orfan", fără nicio coloană care să-l mai arate.
  const targetStage = pipelineStages.find((st) => st.key === stage);
  if (!targetStage) return c.json({ error: "unknown_stage" }, 400);

  // Regulă de business: nu se poate marca un lead „pierdut" fără un motiv — altfel raportul de
  // lead-uri pierdute rămâne mut despre DE CE s-a pierdut vânzarea. Cheia deciziei e flagul
  // `is_lost`, NU literalul "lost": un workspace poate redenumi etapa implicită sau adăuga alte
  // etape de tip „pierdut" (ex. „Anulat de client"), și regula trebuie să le urmărească pe toate.
  if (targetStage.isLost && (!lostReason || lostReason.trim().length === 0)) {
    return c.json({ error: "lost_reason_required" }, 400);
  }

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

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "lead.stage_changed",
    target: "crm_lead",
    targetId: id,
    before: { stage: fromStage },
    after: { stage, lostReason: lostReason ?? null },
  });

  await runAutomations({
    tenantId: user.tenantId,
    userId: user.id,
    lead: row,
    kind: "lead.stage_changed",
    toStage: stage,
  });

  // Cadențele cu etapă declanșatoare: intrarea în etapă înscrie leadul în secvența de urmărire.
  // Idempotent pe (lead, cadență) activă — o mutare înainte-înapoi nu-l înscrie de două ori.
  await enrollByStage(user.tenantId, id, stage);

  const [fresh] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId)));
  return c.json(fresh ?? row);
});


// ─── PATCH /:id/pipeline — mutarea leadului în altă pâlnie ───────────────────

/**
 * De ce nu e un simplu `PATCH /:id { pipelineId }`: cheile de etapă nu sunt comune între pâlnii.
 * Un lead mutat din „Vânzări" (etapa `trial`) în „B2B", care n-are `trial`, ar rămâne cu un stage
 * fără coloană — invizibil pe tablă, exact bug-ul pe care regula „unknown_stage" îl previne la
 * mutarea normală. Așa că mutarea reașază etapa pe prima etapă a pâlniei țintă (sau pe cea cerută
 * explicit, dacă există acolo) și scrie o urmă în istoric.
 */
const pipelineChangeSchema = z.object({
  pipelineId: z.string().uuid(),
  /** Etapa dorită în pâlnia țintă; absentă sau inexistentă acolo → prima etapă a pâlniei. */
  stage: z.string().min(1).max(64).optional(),
});

crmLeadsRoutes.patch("/:id/pipeline", zValidator("json", pipelineChangeSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select({ id: leads.id, stage: leads.stage, pipelineId: leads.pipelineId })
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const target = await resolveRequestPipeline(user.tenantId, body.pipelineId);
  // Pâlnie din alt workspace → 404, nu 403: nu confirmăm că există.
  if (!target) return c.json({ error: "not_found" }, 404);

  const targetStages = await stagesOfPipeline(user.tenantId, target.id);
  if (targetStages.length === 0) return c.json({ error: "pipeline_has_no_stages" }, 409);

  const wanted = body.stage ? targetStages.find((st) => st.key === body.stage) : undefined;
  const nextStage = wanted ?? targetStages[0];

  // O etapă de tip „pierdut" cere motivul (regula de pe /:id/stage). Mutarea între pâlnii nu are
  // de unde să-l ceară, deci nu aterizează niciodată direct într-o astfel de etapă: alegem prima
  // etapă care nu e „pierdut", ca leadul să rămână în lucru.
  const landing = nextStage.isLost ? targetStages.find((st) => !st.isLost) ?? nextStage : nextStage;

  const [row] = await db
    .update(leads)
    .set({ pipelineId: target.id, stage: landing.key, updatedAt: new Date() })
    .where(and(eq(leads.id, id), eq(leads.tenantId, user.tenantId)))
    .returning();

  const [fromPipelineRow] = existing.pipelineId
    ? await db
        .select({ name: crmPipelines.name })
        .from(crmPipelines)
        .where(and(eq(crmPipelines.id, existing.pipelineId), eq(crmPipelines.tenantId, user.tenantId)))
    : [];
  const [toPipelineRow] = await db
    .select({ name: crmPipelines.name })
    .from(crmPipelines)
    .where(and(eq(crmPipelines.id, target.id), eq(crmPipelines.tenantId, user.tenantId)));

  const interaction: NewLeadInteraction = {
    tenantId: user.tenantId,
    leadId: id,
    type: "system",
    direction: "internal",
    body: `Mutat în pâlnia „${toPipelineRow?.name ?? "—"}” (etapa ${landing.label})`,
    metadata: {
      fromPipelineId: existing.pipelineId,
      fromPipelineName: fromPipelineRow?.name ?? null,
      toPipelineId: target.id,
      toPipelineName: toPipelineRow?.name ?? null,
      fromStage: existing.stage,
      toStage: landing.key,
    },
    userId: user.id,
  };
  await db.insert(leadInteractions).values(interaction);

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "lead.pipeline_changed",
    target: "crm_lead",
    targetId: id,
    before: { pipelineId: existing.pipelineId, stage: existing.stage },
    after: { pipelineId: target.id, stage: landing.key },
  });

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


// ─── GET /:id/person-history — aceeași persoană, alte leaduri ────────────────

/**
 * Portare din crm-vector (`src/lib/crm/history.ts`).
 *
 * Aceeași persoană revine: a cerut o ofertă acum un an, a refuzat, acum sună din nou. Fără
 * ecranul ăsta, omul de vânzări pornește de la zero și repetă oferta refuzată. Legătura se face
 * pe telefonul/emailul NORMALIZATE — scrierea diferă („+373 69…" vs „069…"), persoana nu.
 *
 * Întoarce leadurile înrudite (fără cel curent) și comentariile lor, grupate pe lead. Nu e
 * „deduplicare": leadurile rămân separate, doar că se văd unul din altul.
 */
crmLeadsRoutes.get("/:id/person-history", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const id = c.req.param("id");

  const [lead] = await db
    .select({
      id: leads.id,
      phoneNormalized: leads.phoneNormalized,
      emailNormalized: leads.emailNormalized,
    })
    .from(leads)
    .where(and(eq(leads.id, id), eq(leads.tenantId, tenantId)));
  if (!lead) return c.json({ error: "not_found" }, 404);

  const identifiers = [];
  if (lead.phoneNormalized) identifiers.push(eq(leads.phoneNormalized, lead.phoneNormalized));
  if (lead.emailNormalized) identifiers.push(eq(leads.emailNormalized, lead.emailNormalized));
  // Fără telefon și fără email nu există „aceeași persoană" — două leaduri cu același nume pot fi
  // doi oameni diferiți, iar o potrivire pe nume ar amesteca dosarele lor.
  if (identifiers.length === 0) return c.json({ leads: [], notesByLead: {} });

  const match = identifiers.length === 1 ? identifiers[0] : or(...identifiers);
  const related = await db
    .select(LEAD_COLS)
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), ne(leads.id, id), match))
    .orderBy(desc(leads.createdAt))
    .limit(50);

  if (related.length === 0) return c.json({ leads: [], notesByLead: {} });

  const notes = await db
    .select()
    .from(leadInteractions)
    .where(
      and(
        eq(leadInteractions.tenantId, tenantId),
        inArray(
          leadInteractions.leadId,
          related.map((l) => l.id)
        ),
        // Doar ce are valoare de comentariu: schimbările de etapă și zgomotul de sistem n-au ce
        // spune cuiva care vrea să știe ce s-a discutat data trecută.
        inArray(leadInteractions.type, ["note", "call", "email", "whatsapp", "sms", "meeting"]),
        isNotNull(leadInteractions.body)
      )
    )
    .orderBy(desc(leadInteractions.occurredAt))
    .limit(100);

  const notesByLead: Record<string, typeof notes> = {};
  for (const n of notes) (notesByLead[n.leadId] ??= []).push(n);

  return c.json({ leads: related, notesByLead });
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

    // Clientul a răspuns → urmărirea automată se oprește. Altfel, peste două zile, agentul
    // primește „sună clientul, nu răspunde" despre un om care a sunat deja.
    if (row.direction === "inbound") await stopCadencesOnReply(user.tenantId, id, user.id);

    return c.json(row, 201);
  }
);
