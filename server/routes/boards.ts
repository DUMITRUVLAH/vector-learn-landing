/**
 * TB-001: TaskBoard — Boards CRUD
 * GET/POST/PATCH/DELETE /api/board/boards
 *
 * POST creates the board WITH the 4 default lists (Backlog / În lucru / Review / Gata,
 * Gata.isDoneList=true) so a fresh board is immediately usable in all views.
 * Pass { skipDefaultLists: true } to create an empty board.
 *
 * TODO(TB): tighten writes to manager+ (permissive at this stage — owner decision 2026-07-07).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, asc, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { boards, boardLists, boardLabels } from "../db/schema/taskboard";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { parUuidGuard } from "../middleware/parUuidGuard";

export const boardsRoutes = new Hono<{ Variables: AuthVariables }>();
boardsRoutes.use("*", requireAuth);
boardsRoutes.use("/:id", parUuidGuard("id"));

const boardSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).nullable().optional(),
  productId: z.string().uuid().nullable().optional(),
  skipDefaultLists: z.boolean().optional(),
});

const DEFAULT_LISTS = [
  { name: "Backlog", position: 1024, isDoneList: false },
  { name: "În lucru", position: 2048, isDoneList: false },
  { name: "Review", position: 3072, isDoneList: false },
  { name: "Gata", position: 4096, isDoneList: true },
] as const;

boardsRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const productId = c.req.query("productId");
  const conditions = [eq(boards.tenantId, tenantId), isNull(boards.archivedAt)];
  if (productId) conditions.push(eq(boards.productId, productId));
  const rows = await db
    .select()
    .from(boards)
    .where(and(...conditions))
    .orderBy(asc(boards.name));
  return c.json({ boards: rows });
});

boardsRoutes.get("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [board] = await db
    .select()
    .from(boards)
    .where(and(eq(boards.id, id), eq(boards.tenantId, tenantId)));
  if (!board) return c.json({ error: "not_found" }, 404);
  const lists = await db
    .select()
    .from(boardLists)
    .where(and(eq(boardLists.boardId, id), eq(boardLists.tenantId, tenantId)))
    .orderBy(asc(boardLists.position));
  const labels = await db
    .select()
    .from(boardLabels)
    .where(and(eq(boardLabels.boardId, id), eq(boardLabels.tenantId, tenantId)))
    .orderBy(asc(boardLabels.name));
  return c.json({ board, lists, labels });
});

boardsRoutes.post("/", zValidator("json", boardSchema), async (c) => {
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");
  const [board] = await db
    .insert(boards)
    .values({
      tenantId,
      name: body.name,
      description: body.description ?? null,
      productId: body.productId ?? null,
    })
    .returning();
  let lists: (typeof boardLists.$inferSelect)[] = [];
  if (!body.skipDefaultLists) {
    lists = await db
      .insert(boardLists)
      .values(DEFAULT_LISTS.map((l) => ({ tenantId, boardId: board.id, ...l })))
      .returning();
  }
  return c.json({ board, lists }, 201);
});

boardsRoutes.patch(
  "/:id",
  zValidator("json", boardSchema.omit({ skipDefaultLists: true }).partial()),
  async (c) => {
    const tenantId = c.get("user").tenantId;
    const id = c.req.param("id");
    const body = c.req.valid("json");
    const [row] = await db
      .update(boards)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(boards.id, id), eq(boards.tenantId, tenantId)))
      .returning();
    if (!row) return c.json({ error: "not_found" }, 404);
    return c.json(row);
  }
);

boardsRoutes.delete("/:id", async (c) => {
  const tenantId = c.get("user").tenantId;
  const id = c.req.param("id");
  const [row] = await db
    .update(boards)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(boards.id, id), eq(boards.tenantId, tenantId)))
    .returning();
  if (!row) return c.json({ error: "not_found" }, 404);
  return c.json({ ok: true });
});
