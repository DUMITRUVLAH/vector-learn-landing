/**
 * CRM — Taskuri pe lead + lista „de azi"
 *
 * Mounted at /api/crm/tasks (rămâne de conectat: app.ts: app.route("/api/crm/tasks", crmTasksRoutes))
 *
 * GET    /api/crm/tasks?leadId=            — taskurile unui lead (necesită `leadId` DIN tenant)
 * GET    /api/crm/tasks?scope=upcoming     — taskuri deschise, cu scadență (clopoțel remindere).
 *                                            Cu `&owner=<userId>`: doar ale acelui om plus cele
 *                                            nealocate. Fără: ale întregii echipe.
 * POST   /api/crm/tasks                    — creare, pe un lead existent al tenantului
 * PATCH  /api/crm/tasks/:id                — editare titlu/scadență/responsabil
 * POST   /api/crm/tasks/:id/complete       — marchează încheiat (status "done" + completedAt)
 * POST   /api/crm/tasks/:id/reopen         — redeschide (status "open", completedAt golit)
 * POST   /api/crm/tasks/:id/snooze         — { days } → împinge scadența înainte cu N zile (rămâne „open”)
 * DELETE /api/crm/tasks/:id                — șterge taskul
 * GET    /api/crm/tasks/today              — cele 4 gălețile „de azi" (opțional ?owner=<userId>)
 *
 * Portate din crm-vector (`src/lib/crm/tasks.ts` + `today.ts`). Diferența față de sursă: acolo
 * baza e single-tenant (Supabase, RLS inexistent dar și inutil — un singur owner); aici FIECARE
 * interogare e filtrată `eq(*.tenantId, user.tenantId)` — o scăpare ar arăta taskurile unui
 * workspace pe ecranul altuia.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "../db/client";
import { crmLeadTasks, type NewCrmLeadTask } from "../db/schema/crmTasks";
import { leads, leadInteractions } from "../db/schema/leads";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getTodayForTenant, PENDING_TASK_STATUSES } from "../lib/crm/today";

export const crmTasksRoutes = new Hono<{ Variables: AuthVariables }>();
crmTasksRoutes.use("/*", requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

// `.trim()` înainte de `.min(1)`: un titlu doar din spații trecea de validare pe textul brut și se
// salva gol după curățarea din handler — un rând fără text în listă și în clopoțel.
const taskTitle = z.string().trim().min(1, "Titlul este obligatoriu").max(300);

const createTaskSchema = z.object({
  leadId: z.string().uuid("Lead invalid"),
  title: taskTitle,
  dueAt: z.string().datetime().optional().nullable(),
  dueHasTime: z.boolean().optional(),
  assignedTo: z.string().uuid().optional().nullable(),
});

const updateTaskSchema = z.object({
  title: taskTitle.optional(),
  dueAt: z.string().datetime().optional().nullable(),
  dueHasTime: z.boolean().optional(),
  assignedTo: z.string().uuid().optional().nullable(),
});

const snoozeTaskSchema = z.object({
  days: z.number().int().min(1).max(365),
});

/**
 * Responsabilul unui task trebuie să fie un om ACTIV din workspace-ul curent. Fără verificarea
 * asta, un id inexistent pica abia la cheia străină (500), iar id-ul unui om din alt workspace
 * trecea: taskul ar fi ajuns în clopoțelul unui străin (`?owner=`), iar nimeni de aici nu l-ar
 * mai fi văzut ca al lui.
 */
async function isAssignableMember(tenantId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId), eq(users.isActive, true), isNull(users.deletedAt)));
  return !!row;
}

// ─── GET / — taskurile unui lead SAU cele „upcoming" pe tot tenantul ─────────

crmTasksRoutes.get("/", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const { leadId, scope, owner } = c.req.query();

  if (leadId) {
    // Lead-ul trebuie să existe ÎN tenantul curent — altfel un `leadId` ghicit din alt workspace
    // ar putea citi taskurile lui prin ruta asta.
    const [lead] = await db
      .select({ id: leads.id })
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.tenantId, tenantId)));
    if (!lead) return c.json({ error: "not_found" }, 404);

    const items = await db
      .select()
      .from(crmLeadTasks)
      .where(and(eq(crmLeadTasks.tenantId, tenantId), eq(crmLeadTasks.leadId, leadId)))
      // ASC pune NULL-urile ultimele în Postgres — exact „nullsFirst: false" din sursă.
      .orderBy(asc(crmLeadTasks.dueAt));
    return c.json({ items });
  }

  if (scope === "upcoming") {
    // Pentru clopoțelul de remindere: taskuri deschise, cu scadență, din tot tenantul — cu numele
    // lead-ului alăturat, ca UI-ul să nu mai facă o cerere separată per rând.
    const items = await db
      .select({
        id: crmLeadTasks.id,
        tenantId: crmLeadTasks.tenantId,
        leadId: crmLeadTasks.leadId,
        title: crmLeadTasks.title,
        dueAt: crmLeadTasks.dueAt,
        dueHasTime: crmLeadTasks.dueHasTime,
        status: crmLeadTasks.status,
        assignedTo: crmLeadTasks.assignedTo,
        createdBy: crmLeadTasks.createdBy,
        completedAt: crmLeadTasks.completedAt,
        createdAt: crmLeadTasks.createdAt,
        updatedAt: crmLeadTasks.updatedAt,
        leadFullName: leads.fullName,
        leadDealName: leads.dealName,
      })
      .from(crmLeadTasks)
      .innerJoin(leads, and(eq(leads.id, crmLeadTasks.leadId), eq(leads.tenantId, tenantId)))
      .where(
        and(
          eq(crmLeadTasks.tenantId, tenantId),
          // „snoozed” doar pentru rândurile vechi — amânarea scrie acum „open” (vezi /snooze).
          inArray(crmLeadTasks.status, [...PENDING_TASK_STATUSES]),
          isNotNull(crmLeadTasks.dueAt),
          // Clopoțelul unui agent arată munca LUI. Taskurile nealocate intră și ele: nimeni nu le
          // are, deci trebuie să le vadă cineva — altfel rămân restante fără să știe nimeni.
          owner ? or(eq(crmLeadTasks.assignedTo, owner), isNull(crmLeadTasks.assignedTo)) : undefined
        )
      )
      .orderBy(asc(crmLeadTasks.dueAt))
      .limit(200);
    return c.json({ items });
  }

  return c.json({ error: "leadId_or_scope_required" }, 400);
});

// ─── GET /today — cele 4 gălețile „de azi" ────────────────────────────────────

/**
 * `?owner=<userId>` restrânge lista la un singur agent (fiecare vede DOAR lead-urile lui).
 * Absent = toată echipa — dar acesta era exact bug-ul din sursă (crm-vector): fiecare agent
 * vedea munca întregii firme. Aici filtrarea per agent e disponibilă din prima zi; ecranul
 * decide implicit „doar eu" (vezi src/pages/business/crm/CrmTodayPage.tsx).
 */
crmTasksRoutes.get("/today", async (c) => {
  const user = c.get("user");
  const owner = c.req.query("owner");
  const buckets = await getTodayForTenant(user.tenantId, { ownerId: owner || undefined });
  return c.json(buckets);
});

// ─── POST / ───────────────────────────────────────────────────────────────────

crmTasksRoutes.post("/", zValidator("json", createTaskSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const body = c.req.valid("json");

  // Lead-ul țintă trebuie să aparțină tenantului curent — altfel un payload manipulat ar putea
  // agăța un task de un lead din alt workspace.
  const [lead] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, body.leadId), eq(leads.tenantId, tenantId)));
  if (!lead) return c.json({ error: "not_found" }, 404);

  if (body.assignedTo && !(await isAssignableMember(tenantId, body.assignedTo))) {
    return c.json({ error: "invalid_assignee" }, 400);
  }

  const values: NewCrmLeadTask = {
    tenantId,
    leadId: body.leadId,
    title: body.title.trim(),
    status: "open",
    createdBy: user.id,
  };
  if (body.dueAt !== undefined) values.dueAt = body.dueAt ? new Date(body.dueAt) : null;
  // CRM-U04: ora contează doar când există scadență.
  values.dueHasTime = !!body.dueAt && body.dueHasTime === true;
  if (body.assignedTo !== undefined) values.assignedTo = body.assignedTo;

  const [row] = await db.insert(crmLeadTasks).values(values).returning();
  return c.json(row, 201);
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────

crmTasksRoutes.patch("/:id", zValidator("json", updateTaskSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const body = c.req.valid("json");

  const [existing] = await db
    .select({ id: crmLeadTasks.id, dueAt: crmLeadTasks.dueAt, assignedTo: crmLeadTasks.assignedTo })
    .from(crmLeadTasks)
    .where(and(eq(crmLeadTasks.id, id), eq(crmLeadTasks.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  // Verificăm doar un responsabil NOU: un formular care retrimite responsabilul actual (între
  // timp dezactivat) nu trebuie să blocheze editarea titlului sau a scadenței.
  if (
    body.assignedTo &&
    body.assignedTo !== existing.assignedTo &&
    !(await isAssignableMember(user.tenantId, body.assignedTo))
  ) {
    return c.json({ error: "invalid_assignee" }, 400);
  }

  const updates: Partial<NewCrmLeadTask> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.dueAt !== undefined) updates.dueAt = body.dueAt ? new Date(body.dueAt) : null;
  // Ora are sens doar pe o zi: se judecă după scadența care RĂMÂNE după editare — cea trimisă
  // acum, altfel cea deja salvată. Înainte, `{ dueHasTime: true }` singur (adaugi ora pe un task
  // „toată ziua”) se salva fals, fiindcă se uita doar la `body.dueAt`, absent din cerere.
  const effectiveDueAt = body.dueAt !== undefined ? body.dueAt : existing.dueAt;
  if (body.dueHasTime !== undefined) updates.dueHasTime = !!effectiveDueAt && body.dueHasTime;
  else if (body.dueAt === null) updates.dueHasTime = false;
  if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;

  const [row] = await db
    .update(crmLeadTasks)
    .set(updates)
    .where(and(eq(crmLeadTasks.id, id), eq(crmLeadTasks.tenantId, user.tenantId)))
    .returning();

  return c.json(row);
});

// ─── POST /:id/complete ───────────────────────────────────────────────────────

crmTasksRoutes.post("/:id/complete", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: crmLeadTasks.id, status: crmLeadTasks.status, leadId: crmLeadTasks.leadId, title: crmLeadTasks.title })
    .from(crmLeadTasks)
    .where(and(eq(crmLeadTasks.id, id), eq(crmLeadTasks.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  // Al doilea „încheie” pe un task deja încheiat e un no-op: nu mută completedAt și nu dublează
  // urma din istoric.
  if (existing.status === "done") {
    const [row] = await db
      .select()
      .from(crmLeadTasks)
      .where(and(eq(crmLeadTasks.id, id), eq(crmLeadTasks.tenantId, user.tenantId)));
    return c.json(row);
  }

  const now = new Date();
  // Un task încheiat iese din restanțe: „azi" citește doar taskurile încă de făcut (vezi
  // server/lib/crm/today.ts) — „done" cu completedAt setat dispare automat de acolo.
  const [row] = await db
    .update(crmLeadTasks)
    .set({ status: "done", completedAt: now, updatedAt: now })
    .where(and(eq(crmLeadTasks.id, id), eq(crmLeadTasks.tenantId, user.tenantId)))
    .returning();

  // T-CRM-107-3: încheierea lasă o urmă „system” în istoricul leadului — cine se uită pe fișă vede
  // ce s-a făcut și când, nu doar un rând bifat în tabul de taskuri. Best-effort: dacă scrierea
  // urmei eșuează, taskul rămâne încheiat (urma e o consecință, nu o condiție).
  try {
    await db.insert(leadInteractions).values({
      tenantId: user.tenantId,
      leadId: existing.leadId,
      type: "system",
      direction: "internal",
      body: `Task încheiat: „${existing.title}”`,
      metadata: { kind: "task_completed", taskId: existing.id },
      userId: user.id,
      occurredAt: now,
    });
  } catch (e) {
    console.error("[crm/tasks] urma de încheiere n-a putut fi scrisă:", e instanceof Error ? e.message : e);
  }

  return c.json(row);
});

// ─── POST /:id/reopen ─────────────────────────────────────────────────────────

crmTasksRoutes.post("/:id/reopen", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: crmLeadTasks.id })
    .from(crmLeadTasks)
    .where(and(eq(crmLeadTasks.id, id), eq(crmLeadTasks.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const [row] = await db
    .update(crmLeadTasks)
    .set({ status: "open", completedAt: null, updatedAt: new Date() })
    .where(and(eq(crmLeadTasks.id, id), eq(crmLeadTasks.tenantId, user.tenantId)))
    .returning();

  return c.json(row);
});

// ─── POST /:id/snooze ─────────────────────────────────────────────────────────

crmTasksRoutes.post("/:id/snooze", zValidator("json", snoozeTaskSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { days } = c.req.valid("json");

  const [existing] = await db
    .select({ id: crmLeadTasks.id, dueAt: crmLeadTasks.dueAt, status: crmLeadTasks.status })
    .from(crmLeadTasks)
    .where(and(eq(crmLeadTasks.id, id), eq(crmLeadTasks.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);
  // Un task încheiat nu are ce amâna; UI-ul ascunde oricum butonul pe rândurile bifate.
  if (existing.status === "done") return c.json({ error: "task_done" }, 409);

  // Amânarea ÎMPINGE scadența cu `days` zile înainte — nu o șterge niciodată. Bază: scadența
  // curentă dacă există, altfel „acum" (un task fără scadență, amânat, primește una nouă).
  const base = existing.dueAt ?? new Date();
  const newDueAt = new Date(base.getTime() + days * 86_400_000);

  const [row] = await db
    .update(crmLeadTasks)
    // Status „open”, nu „snoozed”: clopoțelul, „azi”, cartonașul din pâlnie și „fără pas următor”
    // citesc taskurile deschise — un status aparte le scotea pe toate definitiv din vedere, deși
    // amânarea înseamnă doar „mai târziu”. Scadența nouă e tot ce trebuie ca taskul să revină.
    .set({ dueAt: newDueAt, status: "open", updatedAt: new Date() })
    .where(and(eq(crmLeadTasks.id, id), eq(crmLeadTasks.tenantId, user.tenantId)))
    .returning();

  return c.json(row);
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────

crmTasksRoutes.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const [existing] = await db
    .select({ id: crmLeadTasks.id })
    .from(crmLeadTasks)
    .where(and(eq(crmLeadTasks.id, id), eq(crmLeadTasks.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  await db.delete(crmLeadTasks).where(and(eq(crmLeadTasks.id, id), eq(crmLeadTasks.tenantId, user.tenantId)));

  return c.json({ ok: true });
});
