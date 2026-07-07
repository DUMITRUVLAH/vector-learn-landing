/**
 * TB-001: TaskBoard — Liste (coloanele Kanban) CRUD + reorder
 * GET/POST/PATCH/DELETE /api/board/lists · POST /api/board/lists/reorder
 *
 * TODO(TB): tighten writes to manager+ (permissive at this stage — owner decision 2026-07-07).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { boardLists, boards } from "../db/schema/taskboard";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { parUuidGuard } from "../middleware/parUuidGuard";

export const boardListsRoutes = new Hono<{ Variables: AuthVariables }>();
boardListsRoutes.use("*", requireAuth);
// NU `.use("/:id", parUuidGuard)` aici: pattern-ul ar prinde și literalul `/reorder`
// (un singur segment, nu e UUID) și l-ar 404-ui. Guard-ul se aplică per rută mai jos.

const listSchema = z.object({
  boardId: z.string().uuid(),
  name: z.string().min(1).max(120),
  position: z.number().optional(),
  wipLimit: z.number().int().positive().nullable().optional(),
  isDoneList: z.boolean().optional(),
  colorToken: z.string().max(32).nullable().optional(),
});

boardListsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const boardId = c.req.query("boardId");
  if (!boardId) return c.json({ error: "boardId_required" }, 400);
  const rows = await db
    .select()
    .from(boardLists)
    .where(and(eq(boardLists.tenantId, tenantId), eq(boardLists.boardId, boardId)))
    .orderBy(asc(boardLists.position));
  return c.json({ lists: rows });
});

boardListsRoutes.post("/", zValidator("json", listSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  // Boardul trebuie să aparțină tenantului (altfel un uuid străin ar crea liste orfane).
  const [board] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, body.boardId), eq(boards.tenantId, tenantId)));
  if (!board) return c.json({ error: "board_not_found" }, 404);

  let position = body.position;
  if (position === undefined) {
    const existing = await db
      .select({ position: boardLists.position })
      .from(boardLists)
      .where(and(eq(boardLists.boardId, body.boardId), eq(boardLists.tenantId, tenantId)));
    const max = existing.reduce((m, r) => Math.max(m, r.position), 0);
    position = max + 1024;
  }
  const [row] = await db
    .insert(boardLists)
    .values({
      tenantId,
      boardId: body.boardId,
      name: body.name,
      position,
      wipLimit: body.wipLimit ?? null,
      isDoneList: body.isDoneList ?? false,
      colorToken: body.colorToken ?? null,
    })
    .returning();
  return c.json(row, 201);
});

boardListsRoutes.patch(
  "/:id",
  parUuidGuard("id"),
  zValidator("json", listSchema.omit({ boardId: true }).partial()),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const [row] = await db
      .update(boardLists)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(boardLists.id, id), eq(boardLists.tenantId, tenantId)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

boardListsRoutes.delete("/:id", parUuidGuard("id"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  // Hard delete: tasks.listId are ON DELETE set null → cardurile devin "Neîncadrate",
  // nu se pierd (plan §1.2 — listId null e o stare validă de planificare).
  const [row] = await db
    .delete(boardLists)
    .where(and(eq(boardLists.id, id), eq(boardLists.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

const reorderSchema = z.object({ order: z.array(z.string().uuid()).min(1).max(100) });

/** POST /reorder — rescrie pozițiile listelor în ordinea dată (1024, 2048, …). */
boardListsRoutes.post("/reorder", zValidator("json", reorderSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { order } = c.req.valid("json");
  const rows = await db
    .select()
    .from(boardLists)
    .where(and(eq(boardLists.tenantId, tenantId), inArray(boardLists.id, order)));
  if (rows.length !== order.length) return c.json({ error: "unknown_list_ids" }, 400);
  const boardId = rows[0].boardId;
  if (!rows.every((r) => r.boardId === boardId)) {
    return c.json({ error: "lists_from_multiple_boards" }, 400);
  }
  for (let i = 0; i < order.length; i++) {
    await db
      .update(boardLists)
      .set({ position: (i + 1) * 1024, updatedAt: new Date() })
      .where(and(eq(boardLists.id, order[i]), eq(boardLists.tenantId, tenantId)));
  }
  const lists = await db
    .select()
    .from(boardLists)
    .where(and(eq(boardLists.tenantId, tenantId), eq(boardLists.boardId, boardId)))
    .orderBy(asc(boardLists.position));
  return c.json({ lists });
});
