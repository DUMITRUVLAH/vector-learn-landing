/**
 * VM1-04: PAR Events — sub-entities of projects (Proiect → Eveniment → Cerere).
 *
 * GET    /api/par/events                — list events (tenant-scoped, optional ?project_id=)
 * GET    /api/par/events/:id/budget     — VM5-20: liniile planificate + realizatul lor
 * PUT    /api/par/events/:id/budget     — VM5-20: înlocuiește liniile (salvare sau încărcare în bloc)
 * POST   /api/par/events                — create event (PAR role + project access)
 * PUT    /api/par/events/:id            — update event (par_admin only)
 * DELETE /api/par/events/:id            — deactivate event (par_admin only, soft-delete via active=false)
 *
 * CORE: backlog/par/PAR-CORE.md
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, inArray, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  parEvents,
  parProjects,
  parEventBudgetLines,
  parBudgetCodes,
  parRequests,
  parPayments,
} from "../db/schema/par";
import { toMdlCents } from "../lib/fx";
import { buildEventBudgetReport, type EventBudgetLineInput, type EventSpendInput } from "../lib/par/eventBudget";
import { users } from "../db/schema/users";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePARRole } from "../middleware/requirePARRole";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { accessibleProjectIds, mayAccessProject } from "../lib/par/projectScope";
import { enabledPayerIds } from "../middleware/requireModuleEntitlement";

export const parEventsRoutes = new Hono<{ Variables: AuthVariables }>();

parEventsRoutes.use("*", requireAuth);
parEventsRoutes.use("/:id", parUuidGuard("id"));

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name: z.string().min(1).max(200),
  project_id: z.string().uuid().optional().nullable(),
  starts_at: z.string().datetime({ offset: true }).optional().nullable(),
  ends_at: z.string().datetime({ offset: true }).optional().nullable(),
});

const updateSchema = createSchema.partial().extend({
  active: z.boolean().optional(),
});

// ─── GET /api/par/events ─────────────────────────────────────────────────────

/** List events for tenant. Optional ?project_id= filter. All roles can read.
 * Feature 2: joins users (creator name) + projects (project name) for display. */
parEventsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const projectId = c.req.query("project_id");
  // ?include_inactive=1 allows admin views to see soft-deleted events
  const includeInactive = c.req.query("include_inactive") === "1";

  const conditions = [eq(parEvents.tenantId, tenantId)];
  if (!includeInactive) conditions.push(eq(parEvents.active, true));
  if (projectId) conditions.push(eq(parEvents.projectId, projectId));
  const user = c.get("user");
  const entitledPayers = await enabledPayerIds(tenantId, "par");
  if (!entitledPayers.length) return c.json({ events: [] });
  conditions.push(inArray(parProjects.payerId, entitledPayers));
  const scope = await accessibleProjectIds(user.id, tenantId, user.role);
  if (scope !== null) {
    if (!scope.length) return c.json({ events: [] });
    conditions.push(inArray(parEvents.projectId, scope));
  }

  const rows = await db
    .select({
      id: parEvents.id,
      tenantId: parEvents.tenantId,
      projectId: parEvents.projectId,
      projectName: parProjects.name,
      name: parEvents.name,
      startsAt: parEvents.startsAt,
      endsAt: parEvents.endsAt,
      active: parEvents.active,
      createdByUserId: parEvents.createdByUserId,
      createdByName: users.name,
      createdAt: parEvents.createdAt,
      updatedAt: parEvents.updatedAt,
    })
    .from(parEvents)
    .leftJoin(parProjects, eq(parProjects.id, parEvents.projectId))
    .leftJoin(users, eq(users.id, parEvents.createdByUserId))
    .where(and(...conditions))
    .orderBy(asc(parEvents.name));

  const data = Array.isArray(rows) ? rows : (rows as { rows?: typeof rows }).rows ?? [];
  return c.json({ events: data });
});

// ─── POST /api/par/events ─────────────────────────────────────────────────────

parEventsRoutes.post("/", requirePARRole("requestor", "approver", "finance", "par_admin"), zValidator("json", createSchema), async (c) => {
  const currentUser = c.get("user");
  const tenantId = currentUser.tenantId;
  const body = c.req.valid("json");
  if (!(await mayAccessProject(currentUser.id, tenantId, body.project_id, currentUser.role))) {
    return c.json({ error: "forbidden_project" }, 403);
  }
  if (body.project_id) {
    const [project] = await db.select({ id: parProjects.id }).from(parProjects).where(and(
      eq(parProjects.id, body.project_id), eq(parProjects.tenantId, tenantId), eq(parProjects.active, true),
    ));
    if (!project) return c.json({ error: "project_not_found" }, 404);
  }

  const [created] = await db
    .insert(parEvents)
    .values({
      tenantId,
      name: body.name,
      projectId: body.project_id ?? null,
      startsAt: body.starts_at ? new Date(body.starts_at) : null,
      endsAt: body.ends_at ? new Date(body.ends_at) : null,
      // Feature 2: track who created the event
      createdByUserId: currentUser.id,
    })
    .returning();

  return c.json(created, 201);
});

// ─── PUT /api/par/events/:id ──────────────────────────────────────────────────

parEventsRoutes.put("/:id", requirePARRole("par_admin"), zValidator("json", updateSchema), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const id = c.req.param("id");
  const body = c.req.valid("json");

  // Scope (PARQA): a payer-scoped par_admin may only touch events in their project scope, and a
  // reassigned project must exist in the tenant AND be in scope — POST enforces this, PUT must too.
  const [existing] = await db.select({ projectId: parEvents.projectId }).from(parEvents)
    .where(and(eq(parEvents.id, id), eq(parEvents.tenantId, tenantId)));
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (!(await mayAccessProject(user.id, tenantId, existing.projectId, user.role))) {
    return c.json({ error: "Not found" }, 404);
  }
  if (body.project_id !== undefined && body.project_id !== null) {
    const [project] = await db.select({ id: parProjects.id }).from(parProjects).where(and(
      eq(parProjects.id, body.project_id), eq(parProjects.tenantId, tenantId), eq(parProjects.active, true),
    ));
    if (!project) return c.json({ error: "project_not_found" }, 404);
    if (!(await mayAccessProject(user.id, tenantId, body.project_id, user.role))) {
      return c.json({ error: "forbidden_project" }, 403);
    }
  }

  const updateData: Partial<typeof parEvents.$inferInsert> = { updatedAt: new Date() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.project_id !== undefined) updateData.projectId = body.project_id;
  if (body.starts_at !== undefined) updateData.startsAt = body.starts_at ? new Date(body.starts_at) : null;
  if (body.ends_at !== undefined) updateData.endsAt = body.ends_at ? new Date(body.ends_at) : null;
  if (body.active !== undefined) updateData.active = body.active;

  const [updated] = await db
    .update(parEvents)
    .set(updateData)
    .where(and(eq(parEvents.id, id), eq(parEvents.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json(updated);
});

// ─── DELETE /api/par/events/:id — soft-delete via active=false ───────────────

parEventsRoutes.delete("/:id", requirePARRole("par_admin"), async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const id = c.req.param("id");

  // Scope (PARQA): a payer-scoped par_admin may only deactivate events in their project scope.
  const [existing] = await db.select({ projectId: parEvents.projectId }).from(parEvents)
    .where(and(eq(parEvents.id, id), eq(parEvents.tenantId, tenantId)));
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (!(await mayAccessProject(user.id, tenantId, existing.projectId, user.role))) {
    return c.json({ error: "Not found" }, 404);
  }

  const [updated] = await db
    .update(parEvents)
    .set({ active: false, updatedAt: new Date() })
    .where(and(eq(parEvents.id, id), eq(parEvents.tenantId, tenantId)))
    .returning();

  if (!updated) return c.json({ error: "Not found" }, 404);
  return c.json({ ok: true });
});


// ─── VM5-20: bugetul evenimentului, pe linii ─────────────────────────────────
//
// „Evenimentul să fie unit cu conturi bugetare — să vadă linia: cât era planificat și cât s-a
// cheltuit, la event nu s-a depășit totalul." Owner-ul a ales bugetul PE LINII, nu o sumă globală,
// iar liniile trebuie să poată fi ÎNCĂRCATE, nu doar tastate: de aceea salvarea e un PUT care
// înlocuiește tot setul — interfața trimite la fel de bine două rânduri scrise de mână sau
// douăzeci lipite dintr-un Excel.

/** Convertește o sumă în lei; dacă BNM tace, păstrează cifra brută (raport aproximativ > niciun raport). */
async function toMdlSafe(cents: number, currency: string): Promise<number> {
  if (!cents || (currency || "MDL").toUpperCase() === "MDL") return cents;
  try {
    return (await toMdlCents(cents, currency)).mdlCents;
  } catch {
    return cents;
  }
}

/** Evenimentul, dacă există și dacă omul are voie să-l vadă. */
async function eventInScope(userId: string, tenantId: string, tenantRole: string, eventId: string) {
  const [evt] = await db
    .select({ id: parEvents.id, name: parEvents.name, projectId: parEvents.projectId })
    .from(parEvents)
    .where(and(eq(parEvents.id, eventId), eq(parEvents.tenantId, tenantId)));
  if (!evt) return null;
  if (!(await mayAccessProject(userId, tenantId, evt.projectId, tenantRole))) return null;
  return evt;
}

parEventsRoutes.get("/:id/budget", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;
  const eventId = c.req.param("id");

  const evt = await eventInScope(user.id, tenantId, user.role, eventId);
  if (!evt) return c.json({ error: "not_found" }, 404);

  const lineRows = await db
    .select({
      id: parEventBudgetLines.id,
      budgetCodeId: parEventBudgetLines.budgetCodeId,
      label: parEventBudgetLines.label,
      allocatedCents: parEventBudgetLines.allocatedCents,
      currency: parEventBudgetLines.currency,
      codeLabel: parBudgetCodes.code,
      codeName: parBudgetCodes.name,
    })
    .from(parEventBudgetLines)
    .leftJoin(parBudgetCodes, eq(parBudgetCodes.id, parEventBudgetLines.budgetCodeId))
    .where(and(eq(parEventBudgetLines.tenantId, tenantId), eq(parEventBudgetLines.eventId, eventId)))
    .orderBy(asc(parEventBudgetLines.createdAt));

  const planned: EventBudgetLineInput[] = [];
  for (const row of lineRows) {
    planned.push({
      id: row.id,
      budgetCodeId: row.budgetCodeId,
      label: row.label || [row.codeLabel, row.codeName].filter(Boolean).join(" — ") || "Linie",
      allocatedCents: row.allocatedCents,
      currency: row.currency,
      allocatedMdlCents: await toMdlSafe(row.allocatedCents, row.currency),
    });
  }

  // Cheltuielile evenimentului, grupate pe cod bugetar. `total_mdl_cents` e echivalentul înghețat la
  // depunere — aceeași monedă de comparație ca planul.
  const spendRows = await db
    .select({
      budgetCodeId: parRequests.budgetCodeId,
      codeLabel: parBudgetCodes.code,
      codeName: parBudgetCodes.name,
      committed: sql<number>`cast(coalesce(sum(case when ${parRequests.status}::text in ('pending_approval','changes_requested','approved','in_finance','reapproval_required') then coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) else 0 end), 0) as bigint)`,
      paid: sql<number>`cast(coalesce(sum(case when ${parRequests.status}::text = 'paid' then case when ${parRequests.currency} = 'MDL' then coalesce(${parPayments.actualAmountCents}, ${parRequests.totalEstimatedCents}) else coalesce(${parRequests.totalMdlCents}, ${parRequests.totalEstimatedCents}) end else 0 end), 0) as bigint)`,
    })
    .from(parRequests)
    .leftJoin(parBudgetCodes, and(eq(parBudgetCodes.id, parRequests.budgetCodeId), eq(parBudgetCodes.tenantId, tenantId)))
    .leftJoin(parPayments, and(eq(parPayments.parId, parRequests.id), eq(parPayments.tenantId, tenantId)))
    .where(and(eq(parRequests.tenantId, tenantId), eq(parRequests.eventId, eventId)))
    .groupBy(parRequests.budgetCodeId, parBudgetCodes.code, parBudgetCodes.name);

  const spend: EventSpendInput[] = spendRows.map((r) => ({
    budgetCodeId: r.budgetCodeId,
    label: [r.codeLabel, r.codeName].filter(Boolean).join(" — ") || "Fără cod bugetar",
    committedMdlCents: Number(r.committed ?? 0),
    paidMdlCents: Number(r.paid ?? 0),
  }));

  return c.json({ event: { id: evt.id, name: evt.name }, ...buildEventBudgetReport(planned, spend) });
});

const budgetLineSchema = z.object({
  budget_code_id: z.string().uuid().optional().nullable(),
  label: z.string().max(300).optional().nullable(),
  allocated_cents: z.number().int().min(0).max(1_000_000_000_000),
  currency: z.string().length(3).optional(),
});

parEventsRoutes.put(
  "/:id/budget",
  requirePARRole("finance", "par_admin"),
  zValidator("json", z.object({ lines: z.array(budgetLineSchema).max(500) })),
  async (c) => {
    const user = c.get("user");
    const tenantId = user.tenantId;
    const eventId = c.req.param("id");
    const { lines } = c.req.valid("json");

    const evt = await eventInScope(user.id, tenantId, user.role, eventId);
    if (!evt) return c.json({ error: "not_found" }, 404);

    // Codurile bugetare trimise trebuie să existe în organizație — altfel un id greșit ar crea o
    // linie care nu se confruntă niciodată cu nicio cheltuială și ar arăta etern „0 cheltuit".
    const codeIds = [...new Set(lines.map((l) => l.budget_code_id).filter((v): v is string => !!v))];
    if (codeIds.length) {
      const found = await db
        .select({ id: parBudgetCodes.id })
        .from(parBudgetCodes)
        .where(and(eq(parBudgetCodes.tenantId, tenantId), inArray(parBudgetCodes.id, codeIds)));
      if (found.length !== codeIds.length) return c.json({ error: "budget_code_not_found" }, 400);
    }

    // Înlocuire completă, într-o singură tranzacție: bugetul unui eveniment se rescrie ca un tot,
    // nu prin diferențe — altfel o încărcare parțial eșuată ar lăsa planul pe jumătate vechi.
    await db.transaction(async (tx) => {
      await tx
        .delete(parEventBudgetLines)
        .where(and(eq(parEventBudgetLines.tenantId, tenantId), eq(parEventBudgetLines.eventId, eventId)));
      if (lines.length) {
        await tx.insert(parEventBudgetLines).values(
          lines.map((l) => ({
            tenantId,
            eventId,
            budgetCodeId: l.budget_code_id ?? null,
            label: l.label ?? null,
            allocatedCents: l.allocated_cents,
            currency: (l.currency ?? "MDL").toUpperCase(),
          }))
        );
      }
    });

    return c.json({ ok: true, lines: lines.length });
  }
);
