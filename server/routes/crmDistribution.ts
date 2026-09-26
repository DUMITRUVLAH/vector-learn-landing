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
import { and, asc, eq, gte, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadInteractions } from "../db/schema/leads";
import { users } from "../db/schema/users";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";
import { ensureTenantPipeline, leadsInPipeline } from "../lib/crm/pipelines";
import { ensureTenantStages } from "../lib/crm/stages";
import { parseSegmentFilters, segmentConditions } from "../lib/crm/segments";
import { AUTO_STRATEGIES, splitCounts, type AutoMember, type AutoStrategy } from "../lib/crm/distribution";
import { crmSalesSettings, crmAssignmentRules } from "../db/schema/crmAutomations";
import { crmCompanies } from "../db/schema/crmCompanies";
import { isAssignmentStrategy, selectAssignee, type AssignmentRuleView } from "../lib/crm/assignment";
import { logCrmAudit } from "../lib/crm/audit";
import { getRecallSettings, runRecall } from "../lib/crm/recall";
import { crmRecallSettings } from "../db/schema/crmRecall";

export const crmDistributionRoutes = new Hono<{ Variables: AuthVariables }>();
crmDistributionRoutes.use("/*", requireAuth);
// Repartizarea hotărăște cine ia contactele — și, implicit, cine ia comisionul.
crmDistributionRoutes.post("/*", requireCrmPermission("assignment.manage"));
// Și PUT: setarea de întoarcere în rezervă ia contactele de la agenți. Un agent care o poate
// opri își păstrează lotul neatins la nesfârșit — deci o schimbă doar cine repartizează.
crmDistributionRoutes.put("/*", requireCrmPermission("assignment.manage"));

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
  /**
   * Cine hotărăște câte primește fiecare:
   *  - `manual` — omul scrie numărul pentru fiecare agent (`allocations`);
   *  - `auto`   — sistemul împarte între agenții bifați (`userIds`), după `strategy`.
   *
   * Implicit rămâne `manual`, ca o cerere veche să însemne exact ce însemna înainte.
   */
  mode: z.enum(["manual", "auto"]).default("manual"),
  allocations: z
    .array(
      z.object({
        userId: z.string().uuid(),
        count: z.number().int().min(1).max(MAX_TOTAL),
      })
    )
    .max(50)
    .optional(),
  /** `auto`: agenții care participă la împărțire. */
  userIds: z.array(z.string().uuid()).max(50).optional(),
  /** `auto`: câte contacte se împart în total. Lipsă = tot segmentul. */
  count: z.number().int().min(1).max(MAX_TOTAL).optional(),
  strategy: z.enum(AUTO_STRATEGIES).default("round_robin"),
})
  .refine((v) => v.mode !== "manual" || (v.allocations?.length ?? 0) > 0, {
    message: "Scrie câte contacte primește fiecare agent.",
    path: ["allocations"],
  })
  .refine((v) => v.mode !== "auto" || (v.userIds?.length ?? 0) > 0, {
    message: "Bifează cel puțin un agent.",
    path: ["userIds"],
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
 * „Etapă deschisă”: nici câștigată, nici pierdută. O singură definiție pentru repartizare ȘI
 * pentru rezervă — altfel rezerva numără clienții pierduți pe care repartizarea nu-i dă, iar
 * managerul vede 11 în stoc, cere 11 și primește 10.
 */
async function openStageCondition(tenantId: string) {
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
  return closedKeys.length > 0 ? notInArray(leads.stage, closedKeys) : undefined;
}

/**
 * Ce se va întâmpla (sau ce s-a întâmplat): aceeași funcție pentru previzualizare și execuție.
 * Nu scrie nimic — doar alege.
 */
async function buildPlan(tenantId: string, input: DistributionInput): Promise<DistributionPlan> {
  const participants = input.mode === "auto" ? (input.userIds ?? []) : (input.allocations ?? []).map((a) => a.userId);

  await ensureTenantStages(tenantId);
  const pipeline = await ensureTenantPipeline(tenantId);

  // Oamenii: doar din ACEST workspace. Fără verificarea asta, un id de utilizator trimis din
  // afară ar putea da clienții firmei unui om din altă firmă.
  const memberRows = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), inArray(users.id, participants)));
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
    const open = await openStageCondition(tenantId);
    if (open) conditions.push(open);
  }

  conditions.push(...segmentConditions(tenantId, parseSegmentFilters(input.filters)));

  // Câte SUNT, în total — numărul pe care îl vede omul înainte să apese, independent de cât cere.
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(...conditions));
  const available = Number(cnt ?? 0);

  // CÂTE contacte se iau din bază. La `manual` e suma cerută de om; la `auto`, cât a cerut sau
  // tot segmentul. Citirea e aceeași în ambele cazuri — ordinea și limita nu depind de mod.
  const requested =
    input.mode === "auto"
      ? Math.min(input.count ?? available, available, MAX_TOTAL)
      : (input.allocations ?? []).reduce((sum, a) => sum + a.count, 0);
  const total = Math.min(requested, MAX_TOTAL);

  // Ordinea: cele mai vechi întâi, cu `id` ca departajare — două rulări identice trebuie să dea
  // exact aceeași listă, altfel o repartizare greșită nu mai poate fi refăcută.
  const candidateRows =
    total > 0
      ? await db
          .select({ id: leads.id, companyId: leads.companyId })
          .from(leads)
          .where(and(...conditions))
          .orderBy(asc(leads.createdAt), asc(leads.id))
          .limit(total)
      : [];

  // La `auto`, numerele pe agent le calculează SISTEMUL; de aici încolo drumul e identic cu cel
  // manual, deci previzualizarea și execuția rămân aceeași funcție.
  const effectiveAllocations: { userId: string; count: number }[] =
    input.mode === "auto" && input.strategy !== "rules"
      ? await autoAllocations(tenantId, input.userIds ?? [], total, input.strategy)
      : (input.allocations ?? []);

  const picks = new Map<string, string[]>();
  const allocations: AllocationResult[] = [];

  if (input.mode === "auto" && input.strategy === "rules") {
    // Singura strategie care se uită la CE e leadul (teritoriu, condiții), nu doar la cine e
    // liber: motorul existent, lead cu lead. Cine n-a fost prins de nicio regulă rămâne în
    // rezervă și se vede ca lipsă, nu dispare.
    const byRules = await allocateByRules(tenantId, candidateRows, input.userIds ?? []);
    for (const [userId, ids] of byRules) {
      picks.set(userId, ids);
      allocations.push({
        userId,
        name: nameById.get(userId) ?? "(utilizator necunoscut)",
        requested: ids.length,
        given: ids.length,
      });
    }
    // Agenții bifați care n-au primit nimic rămân în listă, cu 0: altfel omul n-ar înțelege dacă
    // i-a sărit regula sau i-a uitat el.
    for (const userId of input.userIds ?? []) {
      if (picks.has(userId)) continue;
      picks.set(userId, []);
      allocations.push({ userId, name: nameById.get(userId) ?? "(utilizator necunoscut)", requested: 0, given: 0 });
    }
  } else {
    let cursor = 0;
    for (const alloc of effectiveAllocations) {
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

/**
 * Câte contacte primește fiecare agent bifat, când împarte sistemul.
 *
 * Setările de vânzări (`crm_sales_settings`) dau greutatea și norma zilnică; lipsa rândului
 * înseamnă setări implicite (activ, 20/zi, greutate 1) — exact ca la distribuirea automată de la
 * crearea leadului. Un agent care ȘI-A ATINS norma azi nu mai primește la strategia „după
 * capacitate", iar contactele lui rămân în rezervă, nu peste norma altcuiva.
 */
async function autoAllocations(
  tenantId: string,
  userIds: string[],
  total: number,
  strategy: Exclude<AutoStrategy, "rules">
): Promise<{ userId: string; count: number }[]> {
  if (userIds.length === 0 || total <= 0) return [];

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      weight: crmSalesSettings.weight,
      dailyCapacity: crmSalesSettings.dailyCapacity,
      orderIndex: crmSalesSettings.orderIndex,
      isActive: crmSalesSettings.isActive,
    })
    .from(users)
    .leftJoin(crmSalesSettings, and(eq(crmSalesSettings.userId, users.id), eq(crmSalesSettings.tenantId, tenantId)))
    .where(and(eq(users.tenantId, tenantId), inArray(users.id, userIds)));

  // Câte a primit fiecare AZI — norma zilnică se măsoară pe ziua în curs, nu pe lot.
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const todayRows = await db
    .select({ userId: leads.assignedTo, cnt: sql<number>`count(*)::int` })
    .from(leads)
    .where(and(eq(leads.tenantId, tenantId), isNotNull(leads.assignedTo), gte(leads.assignedAt, since)))
    .groupBy(leads.assignedTo);
  const todayByUser = new Map(todayRows.map((r) => [r.userId ?? "", Number(r.cnt ?? 0)]));

  const members: AutoMember[] = rows
    // Scos din tragere din setări = nu participă, chiar dacă a fost bifat din greșeală.
    .filter((r) => r.isActive !== false)
    .map((r) => {
      const capacity = r.dailyCapacity ?? DEFAULT_DAILY_CAPACITY;
      return {
        userId: r.userId,
        name: r.name ?? r.email,
        weight: r.weight ?? 1,
        // Norma 0 = nelimitat, la fel ca în motorul de distribuire automată.
        remainingCapacity: capacity === 0 ? null : Math.max(0, capacity - (todayByUser.get(r.userId) ?? 0)),
        orderIndex: r.orderIndex ?? 0,
      };
    });

  const counts = splitCounts(total, members, strategy);
  return [...counts.entries()].filter(([, count]) => count > 0).map(([userId, count]) => ({ userId, count }));
}

/** Norma zilnică implicită, aceeași ca în `crmAssignment.ts` — un om fără setări participă. */
const DEFAULT_DAILY_CAPACITY = 20;

/**
 * Împărțire după REGULILE workspace-ului (teritoriu, condiții pe câmpuri), lead cu lead.
 *
 * Regulile sunt cele din ecranul de automatizări; aici doar le aplicăm pe un lot. Teritoriul are
 * nevoie de regiunea și industria FIRMEI, deci se citesc în bloc pentru toate leadurile din lot —
 * o interogare, nu una pe lead.
 *
 * `userIds` restrânge rezultatul la agenții bifați: o regulă poate trimite leadul către cineva
 * care nu participă la lotul ăsta, iar atunci leadul rămâne în rezervă. Preferăm asta în locul
 * unei atribuiri „pe lângă" ce a cerut omul.
 */
async function allocateByRules(
  tenantId: string,
  candidates: { id: string; companyId: string | null }[],
  userIds: string[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (candidates.length === 0) return out;

  const ruleRows = await db
    .select()
    .from(crmAssignmentRules)
    .where(eq(crmAssignmentRules.tenantId, tenantId))
    .orderBy(asc(crmAssignmentRules.orderIndex));

  const rules: AssignmentRuleView[] = ruleRows.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    strategy: isAssignmentStrategy(r.strategy) ? r.strategy : "round_robin",
    conditions: r.conditions ?? [],
    userIds: r.userIds ?? [],
    orderIndex: r.orderIndex,
  }));
  if (rules.every((r) => !r.enabled)) return out; // nicio regulă activă → nimic nu se mută

  const memberRows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      isActive: crmSalesSettings.isActive,
      dailyCapacity: crmSalesSettings.dailyCapacity,
      weight: crmSalesSettings.weight,
      regions: crmSalesSettings.regions,
      industries: crmSalesSettings.industries,
      orderIndex: crmSalesSettings.orderIndex,
    })
    .from(users)
    .leftJoin(crmSalesSettings, and(eq(crmSalesSettings.userId, users.id), eq(crmSalesSettings.tenantId, tenantId)))
    .where(and(eq(users.tenantId, tenantId), inArray(users.id, userIds)));

  const members = memberRows.map((r) => ({
    userId: r.userId,
    name: r.name ?? r.email,
    isActive: r.isActive ?? true,
    dailyCapacity: r.dailyCapacity ?? DEFAULT_DAILY_CAPACITY,
    weight: r.weight ?? 1,
    regions: r.regions ?? [],
    industries: r.industries ?? [],
    orderIndex: r.orderIndex ?? 0,
    assignedToday: 0,
  }));

  // Firmele lotului: teritoriul se citește de pe fișa firmei, nu de pe lead.
  const companyIds = [...new Set(candidates.map((c) => c.companyId).filter((id): id is string => !!id))];
  const companyRows = companyIds.length
    ? await db
        .select({ id: crmCompanies.id, region: crmCompanies.region, industry: crmCompanies.industry })
        .from(crmCompanies)
        .where(and(eq(crmCompanies.tenantId, tenantId), inArray(crmCompanies.id, companyIds)))
    : [];
  const companyById = new Map(companyRows.map((c) => [c.id, c]));

  let lastAssignedUserId: string | null = null;
  for (const candidate of candidates) {
    const company = candidate.companyId ? companyById.get(candidate.companyId) : null;
    const decision = selectAssignee({
      rules,
      members,
      lead: { id: candidate.id, region: company?.region ?? null, industry: company?.industry ?? null },
      lastAssignedUserId,
    });
    if (decision.outcome !== "assigned" || !decision.userId) continue;

    lastAssignedUserId = decision.userId;
    // Capacitatea se consumă ÎN CADRUL lotului: fără asta, toți ar părea liberi la fiecare lead
    // și un singur om ar lua tot, exact ce strategia încearcă să evite.
    const member = members.find((m) => m.userId === decision.userId);
    if (member) member.assignedToday += 1;

    const list = out.get(decision.userId) ?? [];
    list.push(candidate.id);
    out.set(decision.userId, list);
  }

  return out;
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
  // Verificarea e aceeași în ambele moduri: la `manual` oamenii vin din alocări, la `auto` din
  // bifele ecranului.
  const requestedUserIds =
    input.mode === "auto" ? (input.userIds ?? []) : (input.allocations ?? []).map((a) => a.userId);
  const known = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.tenantId, user.tenantId), inArray(users.id, requestedUserIds)));
  const knownIds = new Set(known.map((k) => k.id));
  const strangers = requestedUserIds.filter((id) => !knownIds.has(id));
  if (strangers.length > 0) {
    return c.json({ error: "unknown_members", members: strangers }, 400);
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
    // Aceeași regulă ca repartizarea fără etapă: rezerva = ce se poate da, nu clienții închiși.
    const open = await openStageCondition(user.tenantId);
    if (open) conditions.push(open);
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
  // Câte ar pleca acum, dacă regula ar rula — se calculează ȘI cu regula oprită (`force`), altfel
  // ecranul ar arăta „0" până la aprindere, adică exact numărul care te face să nu o aprinzi.
  // `dryRun` folosește EXACT aceeași funcție ca cronul.
  let due = 0;
  try {
    due = (await runRecall(user.tenantId, { dryRun: true, force: true })).due;
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
