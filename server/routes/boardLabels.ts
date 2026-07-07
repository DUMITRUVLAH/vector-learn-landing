/**
 * TB-005: TaskBoard — Etichete per board + atașare la taskuri.
 *   GET    /api/board/labels?boardId
 *   POST   /api/board/labels               { boardId, name, colorToken? }
 *   PATCH  /api/board/labels/:id
 *   DELETE /api/board/labels/:id           (hard — task_labels cad prin cascade)
 *   POST   /api/board/labels/toggle        { taskId, labelId } → atașează/detașează
 *
 * TODO(TB): tighten writes to manager+ (permissive at this stage — owner decision 2026-07-07).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc } from "drizzle-orm";
import { db } from "../db/client";
import { boardLabels, taskLabels, tasks, boards } from "../db/schema/taskboard";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { parUuidGuard } from "../middleware/parUuidGuard";

export const boardLabelsRoutes = new Hono<{ Variables: AuthVariables }>();
boardLabelsRoutes.use("*", requireAuth);
// Guard per rută (nu .use("/:id")) — literalul /toggle e un singur segment.

const labelSchema = z.object({
  boardId: z.string().uuid(),
  name: z.string().min(1).max(80),
  colorToken: z.string().max(32).optional(),
});

boardLabelsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const boardId = c.req.query("boardId");
  if (!boardId) return c.json({ error: "boardId_required" }, 400);
  const rows = await db
    .select()
    .from(boardLabels)
    .where(and(eq(boardLabels.tenantId, tenantId), eq(boardLabels.boardId, boardId)))
    .orderBy(asc(boardLabels.name));
  return c.json({ labels: rows });
});

boardLabelsRoutes.post("/", zValidator("json", labelSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  const [board] = await db
    .select({ id: boards.id })
    .from(boards)
    .where(and(eq(boards.id, body.boardId), eq(boards.tenantId, tenantId)));
  if (!board) return c.json({ error: "board_not_found" }, 404);
  const [row] = await db
    .insert(boardLabels)
    .values({
      tenantId,
      boardId: body.boardId,
      name: body.name,
      colorToken: body.colorToken ?? "muted",
    })
    .returning();
  return c.json(row, 201);
});

boardLabelsRoutes.patch(
  "/:id",
  parUuidGuard("id"),
  zValidator("json", labelSchema.omit({ boardId: true }).partial()),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const [row] = await db
      .update(boardLabels)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(boardLabels.id, id), eq(boardLabels.tenantId, tenantId)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

boardLabelsRoutes.delete("/:id", parUuidGuard("id"), async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [row] = await db
    .delete(boardLabels)
    .where(and(eq(boardLabels.id, id), eq(boardLabels.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});

const toggleSchema = z.object({ taskId: z.string().uuid(), labelId: z.string().uuid() });

/** POST /toggle — atașează dacă lipsește, detașează dacă există. Idempotent per stare. */
boardLabelsRoutes.post("/toggle", zValidator("json", toggleSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const { taskId, labelId } = c.req.valid("json");
  // Ambele capete trebuie să fie ale tenantului (și ale aceluiași board).
  const [task] = await db
    .select({ id: tasks.id, boardId: tasks.boardId })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.tenantId, tenantId)));
  if (!task) return c.json({ error: "task_not_found" }, 404);
  const [label] = await db
    .select({ id: boardLabels.id, boardId: boardLabels.boardId })
    .from(boardLabels)
    .where(and(eq(boardLabels.id, labelId), eq(boardLabels.tenantId, tenantId)));
  if (!label || label.boardId !== task.boardId) return c.json({ error: "label_not_found" }, 404);

  const [existing] = await db
    .select({ id: taskLabels.id })
    .from(taskLabels)
    .where(and(eq(taskLabels.taskId, taskId), eq(taskLabels.labelId, labelId)));
  if (existing) {
    await db.delete(taskLabels).where(eq(taskLabels.id, existing.id));
    return c.json({ attached: false });
  }
  await db.insert(taskLabels).values({ tenantId, taskId, labelId });
  return c.json({ attached: true });
});
