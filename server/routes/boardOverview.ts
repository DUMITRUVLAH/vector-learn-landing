/**
 * TB-001: TaskBoard — Prezentare manager: progres per produs.
 * GET /api/board/overview?productId= → contoare pe status + overdue + unassigned, per produs.
 */
import { Hono } from "hono";
import { and, eq, asc, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { tasks, boardProducts } from "../db/schema/taskboard";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const boardOverviewRoutes = new Hono<{ Variables: AuthVariables }>();
boardOverviewRoutes.use("*", requireAuth);

interface ProductOverview {
  productId: string | null;
  productName: string;
  todo: number;
  inProgress: number;
  blocked: number;
  done: number;
  total: number;
  overdue: number;
  unassigned: number;
}

boardOverviewRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const productId = c.req.query("productId");

  const conditions = [eq(tasks.tenantId, tenantId), isNull(tasks.archivedAt)];
  if (productId) conditions.push(eq(tasks.productId, productId));
  const rows = await db
    .select({
      productId: tasks.productId,
      status: tasks.status,
      dueDate: tasks.dueDate,
      assigneeUserId: tasks.assigneeUserId,
      assigneeRole: tasks.assigneeRole,
    })
    .from(tasks)
    .where(and(...conditions));

  const products = await db
    .select({ id: boardProducts.id, name: boardProducts.name })
    .from(boardProducts)
    .where(eq(boardProducts.tenantId, tenantId))
    .orderBy(asc(boardProducts.name));
  const nameById = new Map(products.map((p) => [p.id, p.name]));

  // Agregare în aplicație (o singură trecere) — volumele per tenant sunt mici și evită
  // diferențele PGlite↔Postgres la GROUP BY cu expresii condiționale.
  const today = new Date().toISOString().slice(0, 10);
  const byProduct = new Map<string, ProductOverview>();
  for (const r of rows) {
    const key = r.productId ?? "__none__";
    let agg = byProduct.get(key);
    if (!agg) {
      agg = {
        productId: r.productId,
        productName: r.productId
          ? (nameById.get(r.productId) ?? "Produs șters")
          : "Fără produs",
        todo: 0,
        inProgress: 0,
        blocked: 0,
        done: 0,
        total: 0,
        overdue: 0,
        unassigned: 0,
      };
      byProduct.set(key, agg);
    }
    agg.total += 1;
    if (r.status === "todo") agg.todo += 1;
    else if (r.status === "in_progress") agg.inProgress += 1;
    else if (r.status === "blocked") agg.blocked += 1;
    else if (r.status === "done") agg.done += 1;
    if (r.dueDate && r.status !== "done" && r.dueDate < today) agg.overdue += 1;
    if (!r.assigneeUserId && !r.assigneeRole && r.status !== "done") agg.unassigned += 1;
  }

  const overview = [...byProduct.values()].sort((a, b) =>
    a.productName.localeCompare(b.productName, "ro")
  );
  return c.json({ overview });
});
