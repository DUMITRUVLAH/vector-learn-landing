/**
 * API-ul public, documentat și DOAR DE CITIRE (cerințele 64 și 71 din caietul de sarcini).
 *
 * Montat la /api/public/v1. Autentificare cu cheie de workspace (`X-API-Key` sau
 * `Authorization: Bearer fk_…`), administrată din ecranul „API" al CRM-ului.
 *
 * Ce răspunde la cerințele din caiet:
 *  - **64 „API documentat (REST)"** — specificația OpenAPI 3.1 se servește chiar de aici
 *    (`GET /api/public/v1/openapi.json`), generată din aceleași definiții pe care le folosesc
 *    rutele. O documentație scrisă separat de cod se desincronizează în două luni.
 *  - **71 „BI/raportare externă"** — Power BI, Excel și orice altceva care citește JSON se
 *    conectează direct; `updatedSince` face reîmprospătarea incrementală, ca să nu tragă toată
 *    baza la fiecare refresh.
 *
 * ─── Deciziile de securitate, scrise lângă cod ───────────────────────────────────────────────
 *
 * **1. Doar citire, fără excepții.** Nu există nicio rută POST/PATCH/DELETE aici și nici nu se
 * adaugă: o cheie ajunge într-un fișier de configurare Power BI, pe laptopul unui analist, în
 * capturi de ecran de la training. O cheie furată care poate doar CITI e un incident; una care
 * poate scrie e un dezastru.
 *
 * **2. Cheia NU devine utilizator.** Middleware-ul mai vechi `requireApiKey` (INT-901, nefolosit
 * de nicio rută) rezolva cheia încărcând „primul administrator al tenantului" și îl punea în
 * context — adică orice cheie căpăta drepturi de administrator pe toată aplicația, inclusiv pe
 * rutele care scriu. Aici cheia rezolvă DOAR un `tenantId`; nu există `user` în context, deci
 * nicio rută de aplicație nu poate fi apelată din greșeală cu o cheie.
 *
 * **3. Tenantul vine din cheie, niciodată din cerere.** Nu există parametru `tenantId` în niciun
 * endpoint. Singura sursă e cheia, deci nu se poate cere „dă-mi leadurile workspace-ului X".
 *
 * **4. Se întorc doar câmpurile utile în afară.** Coloanele interne (normalizări pentru dedup,
 * urme de consimțământ, id-uri de sesiune) nu ies. Telefonul și e-mailul ies — sunt datele de
 * contact ale leadului, adică exact ce caută un CRM extern — dar leadul cu consimțământul retras
 * iese marcat (`consentRevoked: true`), ca sistemul din aval să nu-l bage într-o campanie.
 */
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import bcrypt from "bcryptjs";
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { db } from "../db/client";
import { apiKeys } from "../db/schema/apiKeys";
import { leads } from "../db/schema/leads";
import { crmCompanies } from "../db/schema/crmCompanies";
import { crmProducts } from "../db/schema/crmProducts";
import { crmPipelines } from "../db/schema/crmPipelines";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { crmLeadTasks } from "../db/schema/crmTasks";
import { docDocuments } from "../db/schema/docs";
import { users } from "../db/schema/users";
import { OPENAPI_DOCUMENT } from "../lib/api/openapi";

type PublicApiVariables = {
  /** Workspace-ul cheii. Singurul lucru pe care îl stabilește autentificarea — vezi decizia 2. */
  apiTenantId: string;
  apiKeyId: string;
};

export const publicApiRoutes = new Hono<{ Variables: PublicApiVariables }>();

// ─── Specificația: publică, fără cheie (nu conține date, doar forma lor) ──────

publicApiRoutes.get("/openapi.json", (c) => c.json(OPENAPI_DOCUMENT));

// ─── Autentificarea cu cheie ──────────────────────────────────────────────────

function extractKey(c: Context): string | null {
  const header = c.req.header("X-API-Key");
  if (header) return header.trim();
  const auth = c.req.header("Authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return null;
}

const requireReadKey: MiddlewareHandler<{ Variables: PublicApiVariables }> = async (c, next) => {
  const key = extractKey(c);
  if (!key || key.length < 12) {
    return c.json({ error: "unauthenticated", hint: "Trimite cheia în antetul X-API-Key." }, 401);
  }

  // Căutarea se face pe prefix (indexat), nu pe hash: bcrypt nu e căutabil. Prefixul poate fi
  // comun mai multor chei, deci verificăm hash-ul pe fiecare candidată.
  const candidates = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.prefix, key.slice(0, 8)), isNull(apiKeys.revokedAt)));

  for (const row of candidates) {
    if (await bcrypt.compare(key, row.keyHash)) {
      c.set("apiTenantId", row.tenantId);
      c.set("apiKeyId", row.id);
      // Când a fost folosită ultima dată — răspunsul nu așteaptă scrierea.
      void db
        .update(apiKeys)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiKeys.id, row.id))
        .catch(() => {});
      await next();
      return;
    }
  }

  // Cheie greșită și cheie revocată dau același răspuns: un mesaj diferit ar spune atacatorului
  // că a nimerit o cheie care a existat cândva.
  return c.json({ error: "invalid_api_key" }, 401);
};

/**
 * 120 de cereri pe minut per cheie. Un refresh de Power BI face câteva zeci; un script care
 * paginează toată baza intră lejer. Limita apără conexiunea la bază (pe serverless e una
 * singură per instanță), nu secretul — cheia e oricum verificată la fiecare cerere.
 */
const apiKeyRateLimit = rateLimiter({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-6",
  keyGenerator: (c: Context) => `apikey:${(extractKey(c) ?? "anon").slice(0, 8)}`,
  message: { error: "rate_limit_exceeded", hint: "120 de cereri pe minut per cheie." },
});

publicApiRoutes.use("/*", apiKeyRateLimit);
publicApiRoutes.use("/*", requireReadKey);

// ─── Ajutoare comune ──────────────────────────────────────────────────────────

/** Paginare cu plafon: fără el, `pageSize=100000` ar trage toată baza într-o cerere. */
function paging(c: Context): { page: number; pageSize: number; offset: number } {
  const page = Math.max(parseInt(c.req.query("page") ?? "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(c.req.query("pageSize") ?? "50", 10) || 50, 1), 200);
  return { page, pageSize, offset: (page - 1) * pageSize };
}

/** `updatedSince=2026-09-01T00:00:00Z` — reîmprospătare incrementală pentru BI. */
function updatedSince(c: Context): Date | null {
  const raw = c.req.query("updatedSince");
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function envelope<T>(items: T[], total: number, page: number, pageSize: number) {
  return { items, page, pageSize, total, totalPages: Math.max(Math.ceil(total / pageSize), 1) };
}

// ─── /leads ───────────────────────────────────────────────────────────────────

publicApiRoutes.get("/leads", async (c) => {
  const tenantId = c.get("apiTenantId");
  const { page, pageSize, offset } = paging(c);

  const conditions = [eq(leads.tenantId, tenantId)];
  const stage = c.req.query("stage");
  const source = c.req.query("source");
  const pipelineId = c.req.query("pipelineId");
  const since = updatedSince(c);
  if (stage) conditions.push(eq(leads.stage, stage));
  if (source) conditions.push(sql`${leads.source}::text = ${source}`);
  if (pipelineId) conditions.push(eq(leads.pipelineId, pipelineId));
  if (since) conditions.push(gte(leads.updatedAt, since));

  const where = and(...conditions);
  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: leads.id,
        fullName: leads.fullName,
        dealName: leads.dealName,
        company: leads.company,
        companyId: leads.companyId,
        phone: leads.phone,
        email: leads.email,
        stage: leads.stage,
        pipelineId: leads.pipelineId,
        source: leads.source,
        productId: leads.productId,
        valueCents: leads.valueCents,
        probabilityPct: leads.probabilityPct,
        assignedTo: leads.assignedTo,
        lostReason: leads.lostReason,
        consentRevokedAt: leads.consentRevokedAt,
        createdAt: leads.createdAt,
        updatedAt: leads.updatedAt,
      })
      .from(leads)
      .where(where)
      .orderBy(desc(leads.updatedAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(leads).where(where),
  ]);

  return c.json(
    envelope(
      rows.map((r) => ({
        ...r,
        consentRevokedAt: undefined,
        // Semnalul care contează în afară: pe omul ăsta nu mai ai voie să-l suni comercial.
        consentRevoked: r.consentRevokedAt !== null,
      })),
      countRows[0]?.n ?? 0,
      page,
      pageSize
    )
  );
});

publicApiRoutes.get("/leads/:id", async (c) => {
  const tenantId = c.get("apiTenantId");
  const [row] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, c.req.param("id")), eq(leads.tenantId, tenantId)));
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({
    id: row.id,
    fullName: row.fullName,
    dealName: row.dealName,
    company: row.company,
    companyId: row.companyId,
    phone: row.phone,
    email: row.email,
    stage: row.stage,
    pipelineId: row.pipelineId,
    source: row.source,
    productId: row.productId,
    valueCents: row.valueCents,
    probabilityPct: row.probabilityPct,
    assignedTo: row.assignedTo,
    lostReason: row.lostReason,
    notes: row.notes,
    consentRevoked: row.consentRevokedAt !== null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
});

// ─── /companies ───────────────────────────────────────────────────────────────

publicApiRoutes.get("/companies", async (c) => {
  const tenantId = c.get("apiTenantId");
  const { page, pageSize, offset } = paging(c);
  const since = updatedSince(c);
  const conditions = [eq(crmCompanies.tenantId, tenantId)];
  if (since) conditions.push(gte(crmCompanies.updatedAt, since));
  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: crmCompanies.id,
        name: crmCompanies.name,
        idno: crmCompanies.idno,
        industry: crmCompanies.industry,
        region: crmCompanies.region,
        companySize: crmCompanies.companySize,
        annualConsumptionKwh: crmCompanies.annualConsumptionKwh,
        website: crmCompanies.website,
        phone: crmCompanies.phone,
        email: crmCompanies.email,
        address: crmCompanies.address,
        createdAt: crmCompanies.createdAt,
        updatedAt: crmCompanies.updatedAt,
      })
      .from(crmCompanies)
      .where(where)
      .orderBy(asc(crmCompanies.name))
      .limit(pageSize)
      .offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(crmCompanies).where(where),
  ]);
  return c.json(envelope(rows, countRows[0]?.n ?? 0, page, pageSize));
});

// ─── /products ────────────────────────────────────────────────────────────────

publicApiRoutes.get("/products", async (c) => {
  const tenantId = c.get("apiTenantId");
  const rows = await db
    .select({
      id: crmProducts.id,
      sku: crmProducts.sku,
      name: crmProducts.name,
      category: crmProducts.category,
      unit: crmProducts.unit,
      listPriceCents: crmProducts.listPriceCents,
      currency: crmProducts.currency,
      vatPercent: crmProducts.vatPercent,
      isActive: crmProducts.isActive,
    })
    .from(crmProducts)
    .where(eq(crmProducts.tenantId, tenantId))
    .orderBy(asc(crmProducts.orderIndex), asc(crmProducts.name));
  return c.json(envelope(rows, rows.length, 1, rows.length || 1));
});

// ─── /pipelines (cu etapele lor) ──────────────────────────────────────────────

publicApiRoutes.get("/pipelines", async (c) => {
  const tenantId = c.get("apiTenantId");
  const [pipelines, stages] = await Promise.all([
    db
      .select({ id: crmPipelines.id, name: crmPipelines.name, isDefault: crmPipelines.isDefault, orderIndex: crmPipelines.orderIndex })
      .from(crmPipelines)
      .where(eq(crmPipelines.tenantId, tenantId))
      .orderBy(asc(crmPipelines.orderIndex)),
    db
      .select({
        pipelineId: crmPipelineStages.pipelineId,
        key: crmPipelineStages.key,
        label: crmPipelineStages.label,
        orderIndex: crmPipelineStages.orderIndex,
        isWon: crmPipelineStages.isWon,
        isLost: crmPipelineStages.isLost,
        probabilityPct: crmPipelineStages.probabilityPct,
      })
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.tenantId, tenantId))
      .orderBy(asc(crmPipelineStages.orderIndex)),
  ]);

  const items = pipelines.map((p) => ({
    ...p,
    stages: stages.filter((s) => s.pipelineId === p.id).map(({ pipelineId: _drop, ...rest }) => rest),
  }));
  return c.json(envelope(items, items.length, 1, items.length || 1));
});

// ─── /tasks ───────────────────────────────────────────────────────────────────

publicApiRoutes.get("/tasks", async (c) => {
  const tenantId = c.get("apiTenantId");
  const { page, pageSize, offset } = paging(c);
  const status = c.req.query("status");
  const conditions = [eq(crmLeadTasks.tenantId, tenantId)];
  if (status) conditions.push(eq(crmLeadTasks.status, status));
  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: crmLeadTasks.id,
        leadId: crmLeadTasks.leadId,
        title: crmLeadTasks.title,
        dueAt: crmLeadTasks.dueAt,
        status: crmLeadTasks.status,
        assignedTo: crmLeadTasks.assignedTo,
        completedAt: crmLeadTasks.completedAt,
        createdAt: crmLeadTasks.createdAt,
      })
      .from(crmLeadTasks)
      .where(where)
      .orderBy(asc(crmLeadTasks.dueAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(crmLeadTasks).where(where),
  ]);
  return c.json(envelope(rows, countRows[0]?.n ?? 0, page, pageSize));
});

// ─── /documents ───────────────────────────────────────────────────────────────

publicApiRoutes.get("/documents", async (c) => {
  const tenantId = c.get("apiTenantId");
  const { page, pageSize, offset } = paging(c);
  const kind = c.req.query("kind");
  const conditions = [eq(docDocuments.tenantId, tenantId)];
  if (kind) conditions.push(eq(docDocuments.kind, kind));
  const where = and(...conditions);

  const [rows, countRows] = await Promise.all([
    db
      .select({
        id: docDocuments.id,
        kind: docDocuments.kind,
        docNumber: docDocuments.docNumber,
        docDate: docDocuments.docDate,
        title: docDocuments.title,
        status: docDocuments.status,
        counterpartyName: docDocuments.counterpartyName,
        totalCents: docDocuments.totalCents,
        currency: docDocuments.currency,
        sentAt: docDocuments.sentAt,
        outcomeAt: docDocuments.outcomeAt,
        createdAt: docDocuments.createdAt,
      })
      .from(docDocuments)
      .where(where)
      .orderBy(desc(docDocuments.docDate))
      .limit(pageSize)
      .offset(offset),
    db.select({ n: sql<number>`count(*)::int` }).from(docDocuments).where(where),
  ]);
  return c.json(envelope(rows, countRows[0]?.n ?? 0, page, pageSize));
});

// ─── /users — cine sunt agenții (pentru rapoarte pe om, în BI) ────────────────

publicApiRoutes.get("/users", async (c) => {
  const tenantId = c.get("apiTenantId");
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .orderBy(asc(users.name));
  return c.json(envelope(rows, rows.length, 1, rows.length || 1));
});

// ─── /reports/summary — blocul de KPI, gata agregat ──────────────────────────

/**
 * De ce există, când BI-ul ar putea agrega singur: un tablou de bord care trage 3.000 de leaduri
 * ca să numere șase cifre face șase cereri mari la fiecare deschidere. Aici numărătoarea se face
 * în bază, într-o interogare, și iese un obiect mic.
 */
publicApiRoutes.get("/reports/summary", async (c) => {
  const tenantId = c.get("apiTenantId");
  /**
   * `pipelineId` restrânge rezumatul la o singură pâlnie. Contează mai mult decât pare: un
   * workspace poate ține într-o pâlnie separată leaduri care NU sunt oportunități (o arhivă de
   * import, o listă de nou-veniți). Fără filtru, valoarea lor intră în „forecast" și tabloul de
   * bord raportează bani care nu există.
   */
  const pipelineId = c.req.query("pipelineId");
  const scope = pipelineId
    ? and(eq(leads.tenantId, tenantId), eq(leads.pipelineId, pipelineId))
    : eq(leads.tenantId, tenantId);

  const [byStage, stages, bySource, docTotals] = await Promise.all([
    db
      .select({
        stage: leads.stage,
        pipelineId: leads.pipelineId,
        count: sql<number>`count(*)::int`,
        valueCents: sql<string>`coalesce(sum(${leads.valueCents}), 0)::bigint`,
      })
      .from(leads)
      .where(scope)
      .groupBy(leads.stage, leads.pipelineId),
    db
      .select({ key: crmPipelineStages.key, isWon: crmPipelineStages.isWon, isLost: crmPipelineStages.isLost, probabilityPct: crmPipelineStages.probabilityPct })
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.tenantId, tenantId)),
    db
      .select({ source: sql<string>`${leads.source}::text`, count: sql<number>`count(*)::int` })
      .from(leads)
      .where(scope)
      .groupBy(leads.source),
    db
      .select({ status: docDocuments.status, count: sql<number>`count(*)::int`, totalCents: sql<string>`coalesce(sum(${docDocuments.totalCents}), 0)::bigint` })
      .from(docDocuments)
      .where(eq(docDocuments.tenantId, tenantId))
      .groupBy(docDocuments.status),
  ]);

  const stageMeta = new Map(stages.map((s) => [s.key, s]));
  let won = 0;
  let lost = 0;
  let open = 0;
  let openValue = 0;
  let weightedForecast = 0;

  for (const row of byStage) {
    const meta = stageMeta.get(row.stage);
    const value = Number(row.valueCents ?? 0);
    if (meta?.isWon) {
      won += row.count;
      weightedForecast += value;
    } else if (meta?.isLost) {
      lost += row.count;
    } else {
      open += row.count;
      openValue += value;
      weightedForecast += (value * (meta?.probabilityPct ?? 0)) / 100;
    }
  }

  const total = won + lost + open;
  return c.json({
    generatedAt: new Date().toISOString(),
    currency: "MDL",
    pipelineId: pipelineId ?? null,
    leads: {
      total,
      open,
      won,
      lost,
      // Rata de conversie se calculează pe afacerile ÎNCHISE: leadurile încă deschise n-au pierdut
      // nimic, iar împărțirea la tot ce există doar diluează cifra pe măsură ce intră leaduri noi.
      conversionPctOnClosed: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0,
      openValueCents: openValue,
      weightedForecastCents: Math.round(weightedForecast),
    },
    bySource: bySource.map((r) => ({ source: r.source, count: r.count })),
    byStage: byStage.map((r) => ({
      stage: r.stage,
      pipelineId: r.pipelineId,
      count: r.count,
      valueCents: Number(r.valueCents ?? 0),
    })),
    documents: docTotals.map((r) => ({ status: r.status, count: r.count, totalCents: Number(r.totalCents ?? 0) })),
  });
});
