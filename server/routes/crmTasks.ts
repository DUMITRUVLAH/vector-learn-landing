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
 * POST   /api/crm/tasks/:id/snooze         — { days } → împinge scadența înainte cu N zile
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
import { and, asc, eq, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "../db/client";
import { crmLeadTasks, type NewCrmLeadTask } from "../db/schema/crmTasks";
import { leads } from "../db/schema/leads";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { getTodayForTenant } from "../lib/crm/today";

export const crmTasksRoutes = new Hono<{ Variables: AuthVariables }>();
crmTasksRoutes.use("/*", requireAuth);

// ─── Validation schemas ───────────────────────────────────────────────────────

const createTaskSchema = z.object({
  leadId: z.string().uuid("Lead invalid"),
  title: z.string().min(1, "Titlul este obligatoriu").max(300),
  dueAt: z.string().datetime().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
});

const updateTaskSchema = z.object({
  title: z.string().min(1, "Titlul este obligatoriu").max(300).optional(),
  dueAt: z.string().datetime().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
});

const snoozeTaskSchema = z.object({
  days: z.number().int().min(1).max(365),
});

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
          eq(crmLeadTasks.status, "open"),
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

  const values: NewCrmLeadTask = {
    tenantId,
    leadId: body.leadId,
    title: body.title.trim(),
    status: "open",
    createdBy: user.id,
  };
  if (body.dueAt !== undefined) values.dueAt = body.dueAt ? new Date(body.dueAt) : null;
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
    .select({ id: crmLeadTasks.id })
    .from(crmLeadTasks)
    .where(and(eq(crmLeadTasks.id, id), eq(crmLeadTasks.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const updates: Partial<NewCrmLeadTask> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title.trim();
  if (body.dueAt !== undefined) updates.dueAt = body.dueAt ? new Date(body.dueAt) : null;
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
    .select({ id: crmLeadTasks.id })
    .from(crmLeadTasks)
    .where(and(eq(crmLeadTasks.id, id), eq(crmLeadTasks.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  const now = new Date();
  // Un task încheiat iese din restanțe: „azi" citește doar taskuri status="open" (vezi
  // server/lib/crm/today.ts) — „done" cu completedAt setat dispare automat de acolo.
  const [row] = await db
    .update(crmLeadTasks)
    .set({ status: "done", completedAt: now, updatedAt: now })
    .where(and(eq(crmLeadTasks.id, id), eq(crmLeadTasks.tenantId, user.tenantId)))
    .returning();

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
    .select({ id: crmLeadTasks.id, dueAt: crmLeadTasks.dueAt })
    .from(crmLeadTasks)
    .where(and(eq(crmLeadTasks.id, id), eq(crmLeadTasks.tenantId, user.tenantId)));
  if (!existing) return c.json({ error: "not_found" }, 404);

  // Amânarea ÎMPINGE scadența cu `days` zile înainte — nu o șterge niciodată. Bază: scadența
  // curentă dacă există, altfel „acum" (un task fără scadență, amânat, primește una nouă).
  const base = existing.dueAt ?? new Date();
  const newDueAt = new Date(base.getTime() + days * 86_400_000);

  const [row] = await db
    .update(crmLeadTasks)
    .set({ dueAt: newDueAt, status: "snoozed", updatedAt: new Date() })
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
