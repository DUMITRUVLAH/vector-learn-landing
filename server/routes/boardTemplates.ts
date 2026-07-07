/**
 * TB-004: TaskBoard — Șabloane de taskuri per tip de produs + generare.
 *   GET    /api/board/templates              — listă (fără arhivate)
 *   GET    /api/board/templates/:id          — șablon + iteme
 *   POST   /api/board/templates              — creare (opțional cu iteme)
 *   PATCH  /api/board/templates/:id          — redenumire/descriere/kind
 *   DELETE /api/board/templates/:id          — arhivare soft
 *   POST   /api/board/templates/:id/items    — adaugă rând
 *   PATCH  /api/board/templates/:id/items/:itemId
 *   DELETE /api/board/templates/:id/items/:itemId
 *   POST   /api/board/templates/:id/generate — { boardId } → taskuri cu dueDate
 *          = ancora produsului + offsetDays. Idempotent implicit (skipExisting=true):
 *          rândurile deja generate pe acel board sunt sărite; ?skipExisting=false forțează.
 *
 * TODO(TB): tighten writes to manager+ (permissive at this stage — owner decision 2026-07-07).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, isNull, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  boardTaskTemplates,
  boardTaskTemplateItems,
  boardProducts,
  boards,
  boardLists,
  tasks,
  TASK_PRIORITIES,
  TEMPLATE_OFFSET_ANCHORS,
} from "../db/schema/taskboard";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { planGeneratedTasks } from "../lib/board/templateGenerate";

export const boardTemplatesRoutes = new Hono<{ Variables: AuthVariables }>();
boardTemplatesRoutes.use("*", requireAuth);
boardTemplatesRoutes.use("/:id/*", parUuidGuard("id"));
boardTemplatesRoutes.use("/:id", parUuidGuard("id"));

const itemSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().nullable().optional(),
  assigneeRole: z.string().max(48).nullable().optional(),
  defaultPriority: z.enum(TASK_PRIORITIES).optional(),
  offsetAnchor: z.enum(TEMPLATE_OFFSET_ANCHORS).optional(),
  offsetDays: z.number().int().min(-3650).max(3650).optional(),
  defaultListName: z.string().max(120).nullable().optional(),
  position: z.number().optional(),
});

const templateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  productKind: z.string().max(32).nullable().optional(),
  items: z.array(itemSchema).max(100).optional(),
});

function itemValues(tenantId: string, templateId: string, body: z.infer<typeof itemSchema>, position: number) {
  return {
    tenantId,
    templateId,
    title: body.title,
    description: body.description ?? null,
    assigneeRole: body.assigneeRole ?? null,
    defaultPriority: body.defaultPriority ?? "normal",
    offsetAnchor: body.offsetAnchor ?? "start",
    offsetDays: body.offsetDays ?? 0,
    defaultListName: body.defaultListName ?? null,
    position,
  };
}

boardTemplatesRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db
    .select()
    .from(boardTaskTemplates)
    .where(and(eq(boardTaskTemplates.tenantId, tenantId), isNull(boardTaskTemplates.archivedAt)))
    .orderBy(asc(boardTaskTemplates.name));
  // Contorul de iteme per șablon (o singură interogare, agregare în aplicație).
  const ids = rows.map((r) => r.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const items = await db
      .select({ templateId: boardTaskTemplateItems.templateId })
      .from(boardTaskTemplateItems)
      .where(
        and(eq(boardTaskTemplateItems.tenantId, tenantId), inArray(boardTaskTemplateItems.templateId, ids))
      );
    for (const it of items) counts.set(it.templateId, (counts.get(it.templateId) ?? 0) + 1);
  }
  return c.json({ templates: rows.map((r) => ({ ...r, itemCount: counts.get(r.id) ?? 0 })) });
});

boardTemplatesRoutes.get("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [tpl] = await db
    .select()
    .from(boardTaskTemplates)
    .where(and(eq(boardTaskTemplates.id, id), eq(boardTaskTemplates.tenantId, tenantId)));
  if (!tpl) return c.json({ error: "not_found" }, 404);
  const items = await db
    .select()
    .from(boardTaskTemplateItems)
    .where(and(eq(boardTaskTemplateItems.templateId, id), eq(boardTaskTemplateItems.tenantId, tenantId)))
    .orderBy(asc(boardTaskTemplateItems.position));
  return c.json({ template: tpl, items });
});

boardTemplatesRoutes.post("/", zValidator("json", templateSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  const [tpl] = await db
    .insert(boardTaskTemplates)
    .values({
      tenantId,
      name: body.name,
      description: body.description ?? null,
      productKind: body.productKind ?? null,
    })
    .returning();
  let items: (typeof boardTaskTemplateItems.$inferSelect)[] = [];
  if (body.items && body.items.length > 0) {
    items = await db
      .insert(boardTaskTemplateItems)
      .values(body.items.map((it, i) => itemValues(tenantId, tpl.id, it, it.position ?? (i + 1) * 1024)))
      .returning();
  }
  return c.json({ template: tpl, items }, 201);
});

boardTemplatesRoutes.patch(
  "/:id",
  zValidator("json", templateSchema.omit({ items: true }).partial()),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const [row] = await db
      .update(boardTaskTemplates)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(boardTaskTemplates.id, id), eq(boardTaskTemplates.tenantId, tenantId)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

boardTemplatesRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [row] = await db
    .update(boardTaskTemplates)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(boardTaskTemplates.id, id), eq(boardTaskTemplates.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

// ── Iteme ────────────────────────────────────────────────────────────────────

async function tplInTenant(tenantId: string, id: string) {
  const [tpl] = await db
    .select({ id: boardTaskTemplates.id })
    .from(boardTaskTemplates)
    .where(and(eq(boardTaskTemplates.id, id), eq(boardTaskTemplates.tenantId, tenantId)));
  return tpl ?? null;
}

boardTemplatesRoutes.post("/:id/items", zValidator("json", itemSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  if (!(await tplInTenant(tenantId, id))) return c.json({ error: "not_found" }, 404);
  const body = c.req.valid("json");
  let position = body.position;
  if (position === undefined) {
    const existing = await db
      .select({ position: boardTaskTemplateItems.position })
      .from(boardTaskTemplateItems)
      .where(eq(boardTaskTemplateItems.templateId, id));
    position = existing.reduce((m, r) => Math.max(m, r.position), 0) + 1024;
  }
  const [row] = await db.insert(boardTaskTemplateItems).values(itemValues(tenantId, id, body, position)).returning();
  return c.json(row, 201);
});

boardTemplatesRoutes.patch(
  "/:id/items/:itemId",
  parUuidGuard("itemId"),
  zValidator("json", itemSchema.partial()),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const { id, itemId } = c.req.param();
    const body = c.req.valid("json");
    const [row] = await db
      .update(boardTaskTemplateItems)
      .set({ ...body, updatedAt: new Date() })
      .where(
        and(
          eq(boardTaskTemplateItems.id, itemId),
          eq(boardTaskTemplateItems.templateId, id),
          eq(boardTaskTemplateItems.tenantId, tenantId)
        )
      )
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

boardTemplatesRoutes.delete("/:id/items/:itemId", parUuidGuard("itemId"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { id, itemId } = c.req.param();
  const [row] = await db
    .delete(boardTaskTemplateItems)
    .where(
      and(
        eq(boardTaskTemplateItems.id, itemId),
        eq(boardTaskTemplateItems.templateId, id),
        eq(boardTaskTemplateItems.tenantId, tenantId)
      )
    )
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

// ── Generare ─────────────────────────────────────────────────────────────────

const generateSchema = z.object({ boardId: z.string().uuid() });

boardTemplatesRoutes.post("/:id/generate", zValidator("json", generateSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const { boardId } = c.req.valid("json");
  const skipExisting = c.req.query("skipExisting") !== "false"; // idempotent implicit

  const [tpl] = await db
    .select()
    .from(boardTaskTemplates)
    .where(and(eq(boardTaskTemplates.id, id), eq(boardTaskTemplates.tenantId, tenantId)));
  if (!tpl) return c.json({ error: "not_found" }, 404);

  const [board] = await db
    .select()
    .from(boards)
    .where(and(eq(boards.id, boardId), eq(boards.tenantId, tenantId)));
  if (!board) return c.json({ error: "board_not_found" }, 404);

  const product = board.productId
    ? (
        await db
          .select()
          .from(boardProducts)
          .where(and(eq(boardProducts.id, board.productId), eq(boardProducts.tenantId, tenantId)))
      )[0] ?? null
    : null;

  const items = await db
    .select()
    .from(boardTaskTemplateItems)
    .where(and(eq(boardTaskTemplateItems.templateId, id), eq(boardTaskTemplateItems.tenantId, tenantId)))
    .orderBy(asc(boardTaskTemplateItems.position));
  if (items.length === 0) return c.json({ createdCount: 0, skippedCount: 0, unscheduledCount: 0, tasks: [] });

  // Idempotență: rândurile de șablon deja generate pe ACEST board se sar.
  let pending = items;
  let skippedCount = 0;
  if (skipExisting) {
    const existing = await db
      .select({ templateItemId: tasks.templateItemId })
      .from(tasks)
      .where(
        and(eq(tasks.tenantId, tenantId), eq(tasks.boardId, boardId), eq(tasks.sourceTemplateId, id))
      );
    const done = new Set(existing.map((e) => e.templateItemId).filter(Boolean));
    pending = items.filter((it) => !done.has(it.id));
    skippedCount = items.length - pending.length;
  }
  if (pending.length === 0) {
    return c.json({ createdCount: 0, skippedCount, unscheduledCount: 0, tasks: [] });
  }

  const lists = await db
    .select({ id: boardLists.id, name: boardLists.name, position: boardLists.position })
    .from(boardLists)
    .where(and(eq(boardLists.boardId, boardId), eq(boardLists.tenantId, tenantId)));

  const boardTasks = await db
    .select({ position: tasks.position })
    .from(tasks)
    .where(and(eq(tasks.tenantId, tenantId), eq(tasks.boardId, boardId)));
  const basePosition = boardTasks.reduce((m, r) => Math.max(m, r.position), 0);

  const plan = planGeneratedTasks(
    pending,
    product ? { startDate: product.startDate, endDate: product.endDate } : null,
    lists,
    basePosition
  );

  const created = await db
    .insert(tasks)
    .values(
      plan.tasks.map((t) => ({
        tenantId,
        boardId,
        listId: t.listId,
        productId: board.productId,
        title: t.title,
        description: t.description,
        priority: t.priority,
        assigneeRole: t.assigneeRole,
        dueDate: t.dueDate,
        position: t.position,
        templateItemId: t.templateItemId,
        sourceTemplateId: id,
      }))
    )
    .returning();

  return c.json({
    createdCount: created.length,
    skippedCount,
    unscheduledCount: plan.unscheduledCount,
    tasks: created,
  });
});
