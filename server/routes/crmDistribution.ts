/**
 * CRM — repartizarea pe LOTURI: „din segmentul ăsta, 200 lui Ana, 200 lui Bo, restul rămân în
 * rezervă".
 *
 * De ce o rută nouă și nu încă o acțiune în `POST /api/crm/leads/bulk`: acțiunile în masă
 * lucrează pe ID-URI SELECTATE, cel mult 100 pe cerere. Ca să dea 200 de contacte unui agent,
 * cineva ar bifa 200 de cartonașe cu mâna, în două cereri — iar pentru o listă importată de
 * 3.000, ideea se destramă complet. Aici cererea spune FILTRUL și NUMĂRUL; serverul alege
 * rândurile. E singura formă în care operațiunea rămâne posibilă pe o bază reală.
 *
 * Deciziile care fac rezultatul previzibil:
 *
 * 1. **Ordinea de luare e explicită: cele mai vechi întâi.** Dacă ar fi nedefinită, două rulări
 *    identice ar da rezultate diferite, iar un manager n-ar putea reface o repartizare greșită.
 *    Cele mai vechi întâi e și corect comercial: un contact importat acum două luni și nesunat
 *    se răcește, nu se îmbunătățește.
 * 2. **Implicit se dau DOAR lead-urile nerepartizate.** „Restul rămân reci" din cerință nu e o
 *    etapă inventată, ci exact starea „fără responsabil". Un manager poate cere explicit și
 *    redistribuirea celor deja atribuiți (`onlyUnassigned: false`) — de exemplu când pleacă un om.
 * 3. **Afacerile închise nu se împart.** O etapă marcată câștigată sau pierdută n-are ce căuta
 *    într-un lot de sunat; fără regula asta, primul lot al unei baze vechi ar fi plin de clienți
 *    existenți.
 * 4. **Previzualizarea și execuția folosesc ACEEAȘI funcție.** Numărul de pe buton nu are voie să
 *    difere de ce se scrie — aceeași regulă ca la import.
 * 5. **Fiecare lead primit are o linie în cronologie.** Peste o lună, la întrebarea „de ce am eu
 *    firma asta?", răspunsul trebuie să existe în fișă, nu doar într-un jurnal de administrare.
 *
 * Ce NU face, înadins: nu rulează automatizări și nu înscrie în cadențe per lead. `POST
 * /leads/bulk` o face, fiindcă acolo omul mută 100 de leaduri conștient, unul câte unul. Aici
 * vorbim de mii de rânduri într-o cerere; pornirea a 3.000 de automatizări ar expira cererea la
 * jumătate, cu jumătate din bază repartizată și nimeni care să știe care jumătate. Repartizarea
 * schimbă responsabilul, nu etapa — deci nu ascunde niciun declanșator de etapă.
 *
 * Montat la /api/crm/distribution.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadInteractions } from "../db/schema/leads";
import { users } from "../db/schema/users";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";
import { ensureTenantPipeline, leadsInPipeline } from "../lib/crm/pipelines";
import { ensureTenantStages } from "../lib/crm/stages";
import { parseSegmentFilters, segmentConditions } from "../lib/crm/segments";
import { logCrmAudit } from "../lib/crm/audit";
import { getRecallSettings, runRecall } from "../lib/crm/recall";
import { crmRecallSettings } from "../db/schema/crmRecall";

export const crmDistributionRoutes = new Hono<{ Variables: AuthVariables }>();
crmDistributionRoutes.use("/*", requireAuth);
// Repartizarea hotărăște cine ia contactele — și, implicit, cine ia comisionul.
crmDistributionRoutes.post("/*", requireCrmPermission("assignment.manage"));

/**
 * Câte lead-uri poate muta o singură cerere. Nu e o limită de business, ci una de cerere HTTP:
 * peste asta, `UPDATE`-urile și rândurile de cronologie depășesc fereastra unui request
 * serverless. Un lot mai mare se dă în două rulări — și, spre deosebire de plafonul de 100 al
 * acțiunilor în masă, aici 5.000 acoperă orice listă reală dintr-o singură apăsare.
 */
const MAX_TOTAL = 5000;

/** Cât de mari sunt bucățile de `UPDATE`/`INSERT`. Un `IN (...)` cu mii de valori depășește
 *  limitele de parametri ale driverului. */
const CHUNK = 200;

const distributionSchema = z.object({
  /** Pâlnia din care se ia. Lipsă → pâlnia implicită a workspace-ului. */
  pipelineId: z.string().uuid().nullish(),
  /** Etapa din care se ia (cheia). Lipsă → orice etapă deschisă. */
  stage: z.string().trim().min(1).max(64).nullish(),
  /** Implicit doar cele fără responsabil — „rezerva rece". */
  onlyUnassigned: z.boolean().default(true),
  /**
   * Filtrele de segment, exact cheile din query string-ul listei de leaduri
   * (`industry`, `region`, `tag`, `cf_<cheie>` …). Le trimitem ca obiect ca ecranul de
   * repartizare să poată refolosi bara de filtre fără o a doua gramatică.
   */
  filters: z.record(z.string(), z.string()).default({}),
  allocations: z
    .array(
      z.object({
        userId: z.string().uuid(),
        count: z.number().int().min(1).max(MAX_TOTAL),
      })
    )
    .min(1, "Alege cel puțin un agent.")
    .max(50),
});

type DistributionInput = z.infer<typeof distributionSchema>;

interface AllocationResult {
  userId: string;
  name: string;
  requested: number;
  given: number;
}

interface DistributionPlan {
  /** Câte lead-uri se potrivesc filtrului și sunt disponibile de dat. */
  available: number;
  /** Câte s-au cerut, în total. */
  requested: number;
  allocations: AllocationResult[];
  /** Câte rămân în rezervă după repartizare. */
  remaining: number;
  /** Câte NU s-au putut da fiindcă baza s-a terminat (cerut − dat). */
  shortfall: number;
  /** Id-urile alese, în ordinea de repartizare — folosite doar de execuție. */
  picks: Map<string, string[]>;
}

/**
 * Ce se va întâmpla (sau ce s-a întâmplat): aceeași funcție pentru previzualizare și execuție.
 * Nu scrie nimic — doar alege.
 */
async function buildPlan(tenantId: string, input: DistributionInput): Promise<DistributionPlan> {
  const requested = input.allocations.reduce((sum, a) => sum + a.count, 0);
  const total = Math.min(requested, MAX_TOTAL);

  await ensureTenantStages(tenantId);
  const pipeline = await ensureTenantPipeline(tenantId);

  // Oamenii: doar din ACEST workspace. Fără verificarea asta, un id de utilizator trimis din
  // afară ar putea da clienții firmei unui om din altă firmă.
  const memberRows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(
      and(
        eq(users.tenantId, tenantId),
        inArray(
          users.id,
          input.allocations.map((a) => a.userId)
        )
      )
    );
  const nameById = new Map(memberRows.map((m) => [m.id, m.name ?? m.email]));

  const conditions = [eq(leads.tenantId, tenantId), isNull(leads.mergedIntoId)];

  // Pâlnia: `pipelineId` explicit, altfel cea implicită (care adoptă și leadurile fără pâlnie).
  const targetPipelineId = input.pipelineId ?? pipeline?.id ?? null;
  if (targetPipelineId) {
    const cond = leadsInPipeline(targetPipelineId, targetPipelineId === pipeline?.id && Boolean(pipeline?.isDefault));
    if (cond) conditions.push(cond);
  }

  if (input.onlyUnassigned) conditions.push(isNull(leads.assignedTo));

  if (input.stage) {
    conditions.push(eq(leads.stage, input.stage));
  } else {
    // Fără etapă cerută: orice etapă DESCHISĂ. Un lot de sunat nu conține clienți existenți.
    const closed = await db
      .select({ key: crmPipelineStages.key })
      .from(crmPipelineStages)
      .where(
        and(
          eq(crmPipelineStages.tenantId, tenantId),
          sql`(${crmPipelineStages.isWon} = true OR ${crmPipelineStages.isLost} = true)`
        )
      );
    const closedKeys = [...new Set(closed.map((s) => s.key))];
    if (closedKeys.length > 0) conditions.push(notInArray(leads.stage, closedKeys));
  }

  conditions.push(...segmentConditions(tenantId, parseSegmentFilters(input.filters)));

  // Câte SUNT, în total — numărul pe care îl vede omul înainte să apese, independent de cât cere.
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(...conditions));
  const available = Number(cnt ?? 0);

  // Ordinea: cele mai vechi întâi, cu `id` ca departajare — două rulări identice trebuie să dea
  // exact aceeași listă, altfel o repartizare greșită nu mai poate fi refăcută.
  const candidateRows =
    total > 0
      ? await db
          .select({ id: leads.id })
          .from(leads)
          .where(and(...conditions))
          .orderBy(asc(leads.createdAt), asc(leads.id))
          .limit(total)
      : [];

  const picks = new Map<string, string[]>();
  const allocations: AllocationResult[] = [];
  let cursor = 0;
  for (const alloc of input.allocations) {
    const slice = candidateRows.slice(cursor, cursor + alloc.count).map((r) => r.id);
    cursor += slice.length;
    picks.set(alloc.userId, slice);
    allocations.push({
      userId: alloc.userId,
      name: nameById.get(alloc.userId) ?? "(utilizator necunoscut)",
      requested: alloc.count,
      given: slice.length,
    });
  }

  const given = allocations.reduce((sum, a) => sum + a.given, 0);
  return {
    available,
    requested,
    allocations,
    remaining: Math.max(0, available - given),
    shortfall: requested - given,
    picks,
  };
}

/** Răspunsul către interfață — fără `picks`, care e detaliu intern. */
function publicPlan(plan: DistributionPlan, extra: Record<string, unknown> = {}) {
  return {
    available: plan.available,
    requested: plan.requested,
    allocations: plan.allocations,
    remaining: plan.remaining,
    shortfall: plan.shortfall,
    ...extra,
  };
}

// ─── POST /preview — ce s-ar întâmpla ────────────────────────────────────────

crmDistributionRoutes.post("/preview", zValidator("json", distributionSchema), async (c) => {
  const user = c.get("user");
  const plan = await buildPlan(user.tenantId, c.req.valid("json"));
  return c.json(publicPlan(plan));
});

// ─── POST /run — repartizarea propriu-zisă ───────────────────────────────────

crmDistributionRoutes.post("/run", zValidator("json", distributionSchema), async (c) => {
  const user = c.get("user");
  const input = c.req.valid("json");

  // Un id care nu e din workspace: oprim ÎNAINTE de orice scriere. Un răspuns parțial
  // („i-am dat lui Ana, pe Bo nu-l cunosc") ar lăsa o repartizare pe jumătate.
  const known = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.tenantId, user.tenantId),
        inArray(
          users.id,
          input.allocations.map((a) => a.userId)
        )
      )
    );
  const knownIds = new Set(known.map((k) => k.id));
  const strangers = input.allocations.filter((a) => !knownIds.has(a.userId));
  if (strangers.length > 0) {
    return c.json({ error: "unknown_members", members: strangers.map((s) => s.userId) }, 400);
  }

  const plan = await buildPlan(user.tenantId, input);

  const now = new Date();
  for (const alloc of plan.allocations) {
    const ids = plan.picks.get(alloc.userId) ?? [];
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      await db
        .update(leads)
        // `assignedAt` e data de la care se numără „neatins de N zile" (CC-7). Fără ea, regula
        // ar trebui dedusă din cronologie, pentru toată baza, la fiecare rulare a cronului.
        .set({ assignedTo: alloc.userId, assignedAt: now, updatedAt: now })
        .where(and(eq(leads.tenantId, user.tenantId), inArray(leads.id, slice)));

      // Cronologia: de ce am eu firma asta. Un singur INSERT pe bucată, nu unul per lead.
      try {
        await db.insert(leadInteractions).values(
          slice.map((leadId) => ({
            tenantId: user.tenantId,
            leadId,
            type: "system" as const,
            direction: "internal" as const,
            body: `Repartizat către ${alloc.name} (lot de ${ids.length}).`,
            userId: user.id,
            occurredAt: now,
          }))
        );
      } catch (err) {
        // Lead-urile sunt deja repartizate; o cronologie nescrisă nu e motiv să raportăm eșec.
        console.error("[crm/distribution] cronologia nu s-a putut scrie:", err);
      }
    }

    if (ids.length > 0) {
      await logCrmAudit({
        tenantId: user.tenantId,
        actorId: user.id,
        action: "leads.distributed",
        target: "crm_lead",
        targetId: alloc.userId,
        after: {
          to: alloc.name,
          count: ids.length,
          requested: alloc.requested,
          filters: input.filters,
          stage: input.stage ?? null,
          pipelineId: input.pipelineId ?? null,
          onlyUnassigned: input.onlyUnassigned,
        },
      });
    }
  }

  return c.json(publicPlan(plan, { ok: true }));
});

// ─── GET /pool — cât e în rezervă ────────────────────────────────────────────

/**
 * Câte contacte stau nerepartizate în pâlnia cerută. E numărul pe care managerul îl vrea la
 * vedere permanent: rezerva rece e stocul din care trăiește echipa.
 */
crmDistributionRoutes.get("/pool", async (c) => {
  const user = c.get("user");
  const query = c.req.query();
  const pipeline = await ensureTenantPipeline(user.tenantId);
  const pipelineId = query.pipelineId ?? pipeline?.id ?? null;

  const conditions = [eq(leads.tenantId, user.tenantId), isNull(leads.mergedIntoId), isNull(leads.assignedTo)];
  if (pipelineId) {
    const cond = leadsInPipeline(pipelineId, pipelineId === pipeline?.id && Boolean(pipeline?.isDefault));
    if (cond) conditions.push(cond);
  }
  conditions.push(...segmentConditions(user.tenantId, parseSegmentFilters(query)));

  try {
    const [{ cnt }] = await db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(...conditions));
    return c.json({ pool: Number(cnt ?? 0) });
  } catch (e) {
    console.error("[crm/distribution] numărarea rezervei a eșuat:", e instanceof Error ? e.message : e);
    return c.json({ pool: 0, schemaLag: true });
  }
});


// ─── Întoarcerea în rezervă a contactelor neatinse (CC-7) ───────────────────

/**
 * Setarea trăiește lângă repartizare fiindcă e reversul ei: dacă lotul dat nu e lucrat, se
 * întoarce în stocul din care a plecat. Regula rulează în cronul zilnic (07:00), iar `preview`
 * de mai jos arată câte contacte ar pleca ACUM — nimeni n-ar porni pe încredere o automatizare
 * care mută clienți de la un agent la altul.
 */
const recallSchema = z.object({
  enabled: z.boolean(),
  days: z.number().int().min(1).max(365),
});

crmDistributionRoutes.get("/recall", async (c) => {
  const user = c.get("user");
  const settings = await getRecallSettings(user.tenantId);
  // Câte ar pleca acum, dacă regula ar rula. `dryRun` folosește EXACT aceeași funcție ca cronul.
  let due = 0;
  try {
    due = (await runRecall(user.tenantId, { dryRun: true })).due;
  } catch (e) {
    console.error("[crm/distribution] previzualizarea întoarcerii a eșuat:", e instanceof Error ? e.message : e);
  }
  return c.json({ ...settings, due });
});

crmDistributionRoutes.put("/recall", zValidator("json", recallSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  const [existing] = await db
    .select()
    .from(crmRecallSettings)
    .where(eq(crmRecallSettings.tenantId, user.tenantId));

  const row = existing
    ? (
        await db
          .update(crmRecallSettings)
          .set({ enabled: body.enabled, days: body.days, updatedAt: new Date() })
          .where(eq(crmRecallSettings.id, existing.id))
          .returning()
      )[0]
    : (
        await db
          .insert(crmRecallSettings)
          .values({ tenantId: user.tenantId, enabled: body.enabled, days: body.days })
          .returning()
      )[0];

  await logCrmAudit({
    tenantId: user.tenantId,
    actorId: user.id,
    action: "recall.configured",
    target: "crm_recall_settings",
    targetId: row.id,
    before: existing ? { enabled: existing.enabled, days: existing.days } : null,
    after: { enabled: row.enabled, days: row.days },
  });

  return c.json({ enabled: row.enabled, days: row.days });
});
