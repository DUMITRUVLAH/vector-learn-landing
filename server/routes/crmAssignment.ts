/**
 * CRM — distribuirea automată a lead-urilor (stratul de date + rutele).
 *
 * Decizia e pură, în `server/lib/crm/assignment.ts`. Aici se încarcă starea,
 * se cheamă motorul și se scrie rezultatul. FIECARE query e filtrat pe
 * `tenantId`: nu există RLS în FinFlow, iar un lead trimis unui om din alt
 * workspace ar însemna datele unui client pe ecranul altuia.
 *
 * Rosterul NU e o tabelă separată. Sunt `users` ai workspace-ului, cu
 * `crm_sales_settings` alăturat printr-un LEFT JOIN: lipsa rândului de setări
 * înseamnă setările implicite (activ, 20 pe zi, greutate 1, fără teritoriu), nu
 * „omul nu participă". Consecința e că un workspace poate porni distribuirea
 * fără să configureze nimic despre oameni.
 *
 * Conturile de elev și de părinte sunt excluse din tragere: sunt utilizatori ai
 * workspace-ului, dar nu oameni de vânzări. Restul rolurilor sunt personal și
 * pot fi scoase individual cu `isActive = false` (pleacă în concediu, revine —
 * fără să i se ia contul).
 *
 * CE SE ÎNTÂMPLĂ LA CAPACITATE ATINSĂ. Întâi lead-ul cade pe un coleg care mai
 * are loc — asta face `pickByCapacity`. Dacă TOȚI sunt plini, lead-ul rămâne
 * neatribuit, dar NU dispare în tăcere: se scrie un rând în
 * `crm_assignment_log` cu motivul explicit („toți agenții și-au atins norma"),
 * iar lead-ul apare în lista celor fără responsabil. Varianta cealaltă — să-l
 * dăm oricum cuiva peste normă — ar transforma capacitatea într-o setare
 * decorativă și ar ascunde exact problema pe care ar trebui s-o semnaleze.
 *
 * Montat la /api/crm/assignment.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import { leads, leadInteractions } from "../db/schema/leads";
import { users } from "../db/schema/users";
import { crmCompanies } from "../db/schema/crmCompanies";
import { crmAssignmentRules, crmSalesSettings, crmAssignmentLog } from "../db/schema/crmAutomations";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requireCrmPermission } from "../middleware/requireCrmPermission";
import {
  ASSIGNMENT_STRATEGIES,
  isAssignmentStrategy,
  selectAssignee,
  memberDisplayName,
  type AssignmentDecision,
  type AssignmentLead,
  type AssignmentMember,
  type AssignmentRuleView,
} from "../lib/crm/assignment";

export const crmAssignmentRoutes = new Hono<{ Variables: AuthVariables }>();
crmAssignmentRoutes.use("/*", requireAuth);
// Distribuirea hotărăște cui îi pică leadurile — și, implicit, cine ia comisionul.
crmAssignmentRoutes.post("/rules", requireCrmPermission("assignment.manage"));
crmAssignmentRoutes.post("/rules/*", requireCrmPermission("assignment.manage"));
crmAssignmentRoutes.patch("/*", requireCrmPermission("assignment.manage"));
crmAssignmentRoutes.delete("/*", requireCrmPermission("assignment.manage"));

/** Setările implicite ale unui om fără rând în `crm_sales_settings`. */
const DEFAULT_DAILY_CAPACITY = 20;
const DEFAULT_WEIGHT = 1;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Încărcarea stării ───────────────────────────────────────────────────────

/** Miezul nopții de azi, ora serverului — hotarul pe care se numără norma zilnică. */
function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Câte lead-uri a dat motorul azi fiecărui om.
 *
 * Se numără din jurnal, nu din `leads`: tabela de lead-uri n-are o coloană
 * „atribuit la", deci o atribuire manuală de ieri ar fi imposibil de deosebit de
 * una de azi. Contorul măsoară ce a împărțit distribuirea automată — o preluare
 * manuală nu consumă norma.
 */
async function loadTodayCounts(tenantId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: crmAssignmentLog.userId, n: sql<number>`count(*)::int` })
    .from(crmAssignmentLog)
    .where(
      and(
        eq(crmAssignmentLog.tenantId, tenantId),
        isNotNull(crmAssignmentLog.userId),
        gte(crmAssignmentLog.createdAt, startOfToday())
      )
    )
    .groupBy(crmAssignmentLog.userId);

  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.userId) out.set(r.userId, Number(r.n ?? 0));
  }
  return out;
}

/**
 * Rosterul workspace-ului: userii activi, nemarcați ca șterși, cu setările lor
 * de vânzări dacă există. Filtrul pe `users.tenantId` e singurul lucru care
 * garantează că un om din alt workspace nu poate ajunge candidat.
 *
 * O singură funcție pentru motor și pentru interfață, intenționat: dacă ecranul
 * de setări ar arăta altă listă decât cea pe care se face tragerea, omul ar
 * configura pe cineva care nu participă și n-ar înțelege niciodată de ce.
 */
async function loadRoster(tenantId: string) {
  const counts = await loadTodayCounts(tenantId);

  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      settingsId: crmSalesSettings.id,
      isActive: crmSalesSettings.isActive,
      dailyCapacity: crmSalesSettings.dailyCapacity,
      weight: crmSalesSettings.weight,
      regions: crmSalesSettings.regions,
      industries: crmSalesSettings.industries,
      orderIndex: crmSalesSettings.orderIndex,
    })
    .from(users)
    .leftJoin(
      crmSalesSettings,
      and(eq(crmSalesSettings.userId, users.id), eq(crmSalesSettings.tenantId, tenantId))
    )
    .where(
      and(
        eq(users.tenantId, tenantId),
        eq(users.isActive, true),
        isNull(users.deletedAt),
        // Elevii și părinții au cont, dar n-au ce căuta într-o tragere de vânzări.
        notInArray(users.role, ["student", "parent"])
      )
    )
    .orderBy(asc(users.name));

  return rows.map((r) => ({
    userId: r.userId,
    name: r.name,
    email: r.email,
    role: r.role,
    // Fals = omul n-a fost configurat niciodată; interfața poate arăta
    // „setări implicite" în loc să pretindă că cineva a ales valorile astea.
    hasSettings: r.settingsId !== null,
    isActive: r.isActive ?? true,
    dailyCapacity: r.dailyCapacity ?? DEFAULT_DAILY_CAPACITY,
    weight: r.weight ?? DEFAULT_WEIGHT,
    regions: r.regions ?? [],
    industries: r.industries ?? [],
    orderIndex: r.orderIndex ?? 0,
    assignedToday: counts.get(r.userId) ?? 0,
  }));
}

/** Rosterul redus la ce are nevoie motorul de decizie. */
async function loadMembers(tenantId: string): Promise<AssignmentMember[]> {
  const roster = await loadRoster(tenantId);
  return roster.map(({ userId, name, isActive, dailyCapacity, weight, regions, industries, orderIndex, assignedToday }) => ({
    userId,
    name,
    isActive,
    dailyCapacity,
    weight,
    regions,
    industries,
    orderIndex,
    assignedToday,
  }));
}

/** Regulile workspace-ului, în forma cerută de motor. */
async function loadRules(tenantId: string): Promise<AssignmentRuleView[]> {
  const rows = await db
    .select()
    .from(crmAssignmentRules)
    .where(eq(crmAssignmentRules.tenantId, tenantId))
    .orderBy(asc(crmAssignmentRules.orderIndex));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    // Coloana e varchar, nu enum: o strategie necunoscută (scrisă de o versiune
    // mai nouă, sau de mână în SQL) nu are voie să oprească distribuirea.
    strategy: isAssignmentStrategy(r.strategy) ? r.strategy : "round_robin",
    conditions: r.conditions ?? [],
    userIds: r.userIds ?? [],
    orderIndex: r.orderIndex,
  }));
}

/** Cine a primit ultimul lead — cursorul de round-robin. */
async function loadLastAssignedUserId(tenantId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: crmAssignmentLog.userId })
    .from(crmAssignmentLog)
    .where(and(eq(crmAssignmentLog.tenantId, tenantId), isNotNull(crmAssignmentLog.userId)))
    .orderBy(desc(crmAssignmentLog.createdAt))
    .limit(1);
  return row?.userId ?? null;
}

/**
 * Lead-ul + teritoriul lui. Regiunea și industria stau pe fișa firmei, nu pe
 * lead — dacă nu le-am aduce aici, strategia „teritoriu" ar rula pe câmpuri
 * inexistente și ar părea că funcționează, dând mereu aceeași decizie.
 */
async function withTerritory(tenantId: string, row: typeof leads.$inferSelect): Promise<AssignmentLead> {
  let region: string | null = null;
  let industry: string | null = null;

  if (row.companyId) {
    const [company] = await db
      .select({ region: crmCompanies.region, industry: crmCompanies.industry })
      .from(crmCompanies)
      .where(and(eq(crmCompanies.id, row.companyId), eq(crmCompanies.tenantId, tenantId)));
    if (company) {
      region = company.region;
      industry = company.industry;
    }
  }

  return { ...row, region, industry };
}

async function loadLead(tenantId: string, leadId: string): Promise<AssignmentLead | null> {
  const [row] = await db
    .select()
    .from(leads)
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));
  if (!row) return null;
  return withTerritory(tenantId, row);
}

// ─── Scrierea rezultatului ───────────────────────────────────────────────────

/**
 * Scrie decizia: întâi jurnalul (inclusiv pentru neatribuit — asta e tot rostul
 * lui), apoi, dacă există un om, `leads.assigned_to` și o intrare `system` în
 * istoricul lead-ului. Ordinea contează: jurnalul primul, ca o cădere la
 * jumătate să lase urma explicației, nu o atribuire fără explicație.
 */
async function persistDecision(
  tenantId: string,
  leadId: string,
  decision: AssignmentDecision,
  members: AssignmentMember[]
): Promise<void> {
  await db.insert(crmAssignmentLog).values({
    tenantId,
    leadId,
    userId: decision.userId,
    ruleId: decision.ruleId,
    strategy: decision.strategy,
    reason: decision.reason,
  });

  if (!decision.userId) return;

  await db
    .update(leads)
    .set({ assignedTo: decision.userId, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));

  await db.insert(leadInteractions).values({
    tenantId,
    leadId,
    type: "system",
    direction: "internal",
    body: `Atribuit automat lui ${memberDisplayName(members, decision.userId)} — ${decision.reason}`.slice(0, 2000),
    metadata: {
      assignedTo: decision.userId,
      ruleId: decision.ruleId,
      strategy: decision.strategy,
      outcome: decision.outcome,
      auto: true,
    },
  });
}

/**
 * Atribuirea automată la crearea unui lead. Chemată din afara rutelor, deci:
 *
 * 1. NU aruncă niciodată. Dacă migrarea 0165 n-a ajuns încă pe baza rulată,
 *    tabelele lipsesc — iar un lead trebuie să se poată crea și fără
 *    distribuire. Întoarce `null`.
 * 2. NU fură un lead care are deja responsabil. Dacă cineva l-a atribuit
 *    explicit la creare, decizia omului bate regula.
 * 3. Când nu există nicio regulă activă potrivită, nu scrie nimic în jurnal:
 *    un workspace care n-a pornit distribuirea ar primi altfel un rând inutil
 *    pentru fiecare lead creat, iar jurnalul ar deveni nefolosibil exact pentru
 *    cazurile în care contează.
 */
export async function assignLeadAutomatically(
  tenantId: string,
  lead: { id: string } & Record<string, unknown>
): Promise<AssignmentDecision | null> {
  try {
    const already = lead.assignedTo;
    if (typeof already === "string" && already !== "") return null;

    const [rules, members, lastAssignedUserId] = await Promise.all([
      loadRules(tenantId),
      loadMembers(tenantId),
      loadLastAssignedUserId(tenantId),
    ]);
    if (rules.every((r) => !r.enabled)) return null;

    // Lead-ul vine de la apelant, dar teritoriul trebuie citit din bază.
    const companyId = typeof lead.companyId === "string" ? lead.companyId : null;
    let full: AssignmentLead = { ...lead };
    if (companyId) {
      const [company] = await db
        .select({ region: crmCompanies.region, industry: crmCompanies.industry })
        .from(crmCompanies)
        .where(and(eq(crmCompanies.id, companyId), eq(crmCompanies.tenantId, tenantId)));
      full = { ...lead, region: company?.region ?? null, industry: company?.industry ?? null };
    }

    const decision = selectAssignee({ rules, members, lead: full, lastAssignedUserId });
    if (decision.outcome === "no_rule") return null;

    await persistDecision(tenantId, lead.id, decision, members);
    return decision;
  } catch (err) {
    // Tăcerea completă ar ascunde o migrare neaplicată luni de zile.
    console.warn("[crm] distribuirea automată a lead-ului a eșuat:", err);
    return null;
  }
}

// ─── Reguli ──────────────────────────────────────────────────────────────────

const conditionSchema = z.object({
  field: z.string().min(1).max(100),
  // Aceiași operatori ca la automatizări: evaluatorul e unul singur (`lib/crm/automations.ts`).
  op: z.enum(["eq", "neq", "contains", "not_contains", "in", "gte", "lte", "exists", "not_exists"]),
  value: z.union([z.string(), z.number()]).optional(),
});

const ruleInput = z.object({
  name: z.string().min(2, "Numele regulii e prea scurt").max(200),
  enabled: z.boolean().optional(),
  strategy: z.enum(ASSIGNMENT_STRATEGIES).optional(),
  conditions: z.array(conditionSchema).max(20).optional(),
  userIds: z.array(z.string().uuid()).max(200).optional(),
  orderIndex: z.number().int().min(0).optional(),
  templateKey: z.string().max(60).nullish(),
});

crmAssignmentRoutes.get("/rules", async (c) => {
  const user = c.get("user");
  const items = await db
    .select()
    .from(crmAssignmentRules)
    .where(eq(crmAssignmentRules.tenantId, user.tenantId))
    .orderBy(asc(crmAssignmentRules.orderIndex));
  return c.json({ items });
});

crmAssignmentRoutes.post("/rules", zValidator("json", ruleInput), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Regula nouă intră la finalul ordinii curente, nu peste prioritatea existentă.
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${crmAssignmentRules.orderIndex}), -1)::int` })
    .from(crmAssignmentRules)
    .where(eq(crmAssignmentRules.tenantId, user.tenantId));

  const [row] = await db
    .insert(crmAssignmentRules)
    .values({
      tenantId: user.tenantId,
      name: body.name,
      enabled: body.enabled ?? true,
      strategy: body.strategy ?? "round_robin",
      conditions: body.conditions ?? [],
      // Id-urile primite se păstrează ca atare; cele care nu sunt oameni ai
      // workspace-ului nu vor avea niciodată cu ce să se potrivească la tragere.
      userIds: body.userIds ?? [],
      orderIndex: body.orderIndex ?? (maxOrder ?? -1) + 1,
      templateKey: body.templateKey ?? null,
    })
    .returning();

  return c.json(row, 201);
});

crmAssignmentRoutes.patch("/rules/:id", zValidator("json", ruleInput.partial()), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");
  if (!UUID_RE.test(id)) return c.json({ error: "not_found" }, 404);

  const [existing] = await db
    .select({ id: crmAssignmentRules.id })
    .from(crmAssignmentRules)
    .where(and(eq(crmAssignmentRules.id, id), eq(crmAssignmentRules.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const [row] = await db
    .update(crmAssignmentRules)
    .set({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      ...(body.strategy !== undefined ? { strategy: body.strategy } : {}),
      ...(body.conditions !== undefined ? { conditions: body.conditions } : {}),
      ...(body.userIds !== undefined ? { userIds: body.userIds } : {}),
      ...(body.orderIndex !== undefined ? { orderIndex: body.orderIndex } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(crmAssignmentRules.id, id), eq(crmAssignmentRules.tenantId, user.tenantId)))
    .returning();

  return c.json(row);
});

crmAssignmentRoutes.delete("/rules/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  if (!UUID_RE.test(id)) return c.json({ error: "not_found" }, 404);

  const [row] = await db
    .delete(crmAssignmentRules)
    .where(and(eq(crmAssignmentRules.id, id), eq(crmAssignmentRules.tenantId, user.tenantId)))
    .returning({ id: crmAssignmentRules.id });
  if (!row) return c.json({ error: "not_found" }, 404);

  // Jurnalul rămâne: `rule_id` devine NULL (ON DELETE SET NULL), dar motivul
  // scris atunci rămâne citibil. Ștergerea unei reguli nu are voie să șteargă
  // explicația atribuirilor deja făcute.
  return c.json({ ok: true });
});

crmAssignmentRoutes.post(
  "/rules/reorder",
  zValidator("json", z.object({ ids: z.array(z.string().uuid()).min(1) })),
  async (c) => {
    const user = c.get("user");
    const { ids } = c.req.valid("json");

    // Id-urile care nu aparțin workspace-ului sunt ignorate — un payload
    // fabricat nu poate rescrie prioritățile altei firme.
    const owned = await db
      .select({ id: crmAssignmentRules.id })
      .from(crmAssignmentRules)
      .where(and(eq(crmAssignmentRules.tenantId, user.tenantId), inArray(crmAssignmentRules.id, ids)));
    const ownedIds = new Set(owned.map((r) => r.id));
    const ordered = ids.filter((id) => ownedIds.has(id));

    await db.transaction(async (tx) => {
      for (let i = 0; i < ordered.length; i++) {
        await tx
          .update(crmAssignmentRules)
          .set({ orderIndex: i, updatedAt: new Date() })
          .where(and(eq(crmAssignmentRules.id, ordered[i]), eq(crmAssignmentRules.tenantId, user.tenantId)));
      }
    });

    const items = await db
      .select()
      .from(crmAssignmentRules)
      .where(eq(crmAssignmentRules.tenantId, user.tenantId))
      .orderBy(asc(crmAssignmentRules.orderIndex));
    return c.json({ items });
  }
);

// ─── Oameni (users + setări) ─────────────────────────────────────────────────

crmAssignmentRoutes.get("/members", async (c) => {
  const user = c.get("user");
  const items = await loadRoster(user.tenantId);
  return c.json({ items });
});

const memberSettingsInput = z.object({
  isActive: z.boolean().optional(),
  dailyCapacity: z.number().int().min(0).max(1000).optional(),
  weight: z.number().int().min(0).max(100).optional(),
  regions: z.array(z.string().max(120)).max(100).optional(),
  industries: z.array(z.string().max(120)).max(100).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

crmAssignmentRoutes.patch("/members/:userId", zValidator("json", memberSettingsInput), async (c) => {
  const user = c.get("user");
  const targetId = c.req.param("userId");
  const body = c.req.valid("json");
  if (!UUID_RE.test(targetId)) return c.json({ error: "not_found" }, 404);

  // Verificarea asta e tot ce împiedică setarea capacității unui om din altă
  // firmă — și, odată cu ea, intrarea lui în tragere.
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, targetId), eq(users.tenantId, user.tenantId)));
  if (!target) return c.json({ error: "not_found" }, 404);

  const set: Partial<typeof crmSalesSettings.$inferInsert> = { updatedAt: new Date() };
  if (body.isActive !== undefined) set.isActive = body.isActive;
  if (body.dailyCapacity !== undefined) set.dailyCapacity = body.dailyCapacity;
  if (body.weight !== undefined) set.weight = body.weight;
  if (body.regions !== undefined) set.regions = body.regions;
  if (body.industries !== undefined) set.industries = body.industries;
  if (body.orderIndex !== undefined) set.orderIndex = body.orderIndex;

  // Upsert: primul PATCH pe un om fără setări creează rândul, pornind de la
  // valorile implicite pentru câmpurile netrimise.
  await db
    .insert(crmSalesSettings)
    .values({
      tenantId: user.tenantId,
      userId: targetId,
      isActive: body.isActive ?? true,
      dailyCapacity: body.dailyCapacity ?? DEFAULT_DAILY_CAPACITY,
      weight: body.weight ?? DEFAULT_WEIGHT,
      regions: body.regions ?? [],
      industries: body.industries ?? [],
      orderIndex: body.orderIndex ?? 0,
    })
    .onConflictDoUpdate({ target: [crmSalesSettings.tenantId, crmSalesSettings.userId], set });

  // Întoarcem omul din roster, nu rândul brut de setări: interfața lucrează cu
  // oameni (nume, câte a primit azi), iar un răspuns de altă formă decât cel de
  // la GET /members ar obliga-o să reîncarce lista după fiecare modificare.
  const roster = await loadRoster(user.tenantId);
  const updated = roster.find((m) => m.userId === targetId);
  if (!updated) return c.json({ error: "not_found" }, 404);
  return c.json(updated);
});

// ─── Previzualizare / aplicare ───────────────────────────────────────────────

const leadRefInput = z.object({ leadId: z.string().uuid() });

/** Cui i-ar reveni lead-ul și de ce — fără să scrie nimic. */
crmAssignmentRoutes.post("/preview", zValidator("json", leadRefInput), async (c) => {
  const user = c.get("user");
  const { leadId } = c.req.valid("json");

  const lead = await loadLead(user.tenantId, leadId);
  if (!lead) return c.json({ error: "not_found" }, 404);

  const [rules, members, lastAssignedUserId] = await Promise.all([
    loadRules(user.tenantId),
    loadMembers(user.tenantId),
    loadLastAssignedUserId(user.tenantId),
  ]);
  const decision = selectAssignee({ rules, members, lead, lastAssignedUserId });

  return c.json({
    decision,
    userName: decision.userId ? memberDisplayName(members, decision.userId) : null,
    // Cine a fost în tragere: fără lista asta, un „nimeni nu e eligibil" nu se
    // poate depana din interfață.
    candidates: members.map((m) => ({
      userId: m.userId,
      name: m.name,
      isActive: m.isActive,
      assignedToday: m.assignedToday,
      dailyCapacity: m.dailyCapacity,
    })),
  });
});

/** Atribuie efectiv și scrie în jurnal. */
crmAssignmentRoutes.post("/apply", zValidator("json", leadRefInput), async (c) => {
  const user = c.get("user");
  const { leadId } = c.req.valid("json");

  const lead = await loadLead(user.tenantId, leadId);
  if (!lead) return c.json({ error: "not_found" }, 404);

  const [rules, members, lastAssignedUserId] = await Promise.all([
    loadRules(user.tenantId),
    loadMembers(user.tenantId),
    loadLastAssignedUserId(user.tenantId),
  ]);
  const decision = selectAssignee({ rules, members, lead, lastAssignedUserId });

  // Spre deosebire de cârligul automat, aici scriem în jurnal ȘI când nu s-a
  // atribuit nimănui, inclusiv pentru „nicio regulă": omul a cerut explicit o
  // distribuire și are dreptul la un răspuns scris, nu la tăcere.
  await persistDecision(user.tenantId, leadId, decision, members);

  return c.json({
    decision,
    userName: decision.userId ? memberDisplayName(members, decision.userId) : null,
  });
});

// ─── Jurnal ──────────────────────────────────────────────────────────────────

crmAssignmentRoutes.get("/log", async (c) => {
  const user = c.get("user");
  const leadId = c.req.query("leadId");
  if (leadId && !UUID_RE.test(leadId)) return c.json({ error: "invalid_lead_id" }, 400);

  const conditions = [eq(crmAssignmentLog.tenantId, user.tenantId)];
  if (leadId) conditions.push(eq(crmAssignmentLog.leadId, leadId));

  const items = await db
    .select({
      id: crmAssignmentLog.id,
      leadId: crmAssignmentLog.leadId,
      userId: crmAssignmentLog.userId,
      userName: users.name,
      ruleId: crmAssignmentLog.ruleId,
      ruleName: crmAssignmentRules.name,
      strategy: crmAssignmentLog.strategy,
      reason: crmAssignmentLog.reason,
      createdAt: crmAssignmentLog.createdAt,
    })
    .from(crmAssignmentLog)
    .leftJoin(users, eq(users.id, crmAssignmentLog.userId))
    .leftJoin(crmAssignmentRules, eq(crmAssignmentRules.id, crmAssignmentLog.ruleId))
    .where(and(...conditions))
    .orderBy(desc(crmAssignmentLog.createdAt))
    .limit(200);

  return c.json({ items });
});
