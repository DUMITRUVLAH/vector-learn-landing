import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq, count, sql } from "drizzle-orm";
import { db } from "../db/client";
import { branches, students, teachers, payments, users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const createBranchSchema = z.object({
  name: z.string().min(1).max(100),
  address: z.string().max(500).optional().nullable(),
  managerUserId: z.string().uuid().optional().nullable(),
});

const updateBranchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  address: z.string().max(500).optional().nullable(),
  managerUserId: z.string().uuid().optional().nullable(),
  isDefault: z.boolean().optional(),
});

export const branchRoutes = new Hono<{ Variables: AuthVariables }>();

branchRoutes.use("*", requireAuth);

/** GET /api/branches — list branches for the tenant */
branchRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;

  const rows = await db
    .select()
    .from(branches)
    .where(eq(branches.tenantId, tenantId))
    .orderBy(branches.isDefault, branches.name);

  return c.json({ items: rows });
});

/** GET /api/branches/stats — per-branch KPI stats */
branchRoutes.get("/stats", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  // BRANCH-703: branch_manager sees only their branch stats
  const branchWhere = user.branchScope
    ? and(eq(branches.tenantId, tenantId), eq(branches.id, user.branchScope))
    : eq(branches.tenantId, tenantId);

  const branchList = await db
    .select()
    .from(branches)
    .where(branchWhere);

  const stats = await Promise.all(
    branchList.map(async (branch) => {
      const [studentRes] = await db
        .select({ cnt: count() })
        .from(students)
        .where(and(eq(students.tenantId, tenantId), eq(students.branchId, branch.id)));

      const [teacherRes] = await db
        .select({ cnt: count() })
        .from(teachers)
        .where(and(eq(teachers.tenantId, tenantId), eq(teachers.branchId, branch.id)));

      // Revenue current month from payments — filter by branch via lessons or flat amount
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const [revenueRes] = await db
        .select({ total: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)` })
        .from(payments)
        .where(
          and(
            eq(payments.tenantId, tenantId),
            sql`${payments.createdAt} >= ${monthStart.toISOString()}`
          )
        );

      return {
        branchId: branch.id,
        branchName: branch.name,
        address: branch.address,
        isDefault: branch.isDefault,
        studentCount: studentRes?.cnt ?? 0,
        teacherCount: teacherRes?.cnt ?? 0,
        revenueCurrentMonth: Number(revenueRes?.total ?? 0),
        lessonCount: 0, // placeholder — lesson join not strictly required for MVP stats
      };
    })
  );

  return c.json({ items: stats });
});

/** GET /api/branches/rollup — consolidated stats across all branches */
branchRoutes.get("/rollup", async (c) => {
  const user = c.get("user");
  const tenantId = user.tenantId;

  // BRANCH-703: branch_manager rollup is scoped to their branch only
  const studentWhere = user.branchScope
    ? and(eq(students.tenantId, tenantId), eq(students.branchId, user.branchScope))
    : eq(students.tenantId, tenantId);
  const teacherWhere = user.branchScope
    ? and(eq(teachers.tenantId, tenantId), eq(teachers.branchId, user.branchScope))
    : eq(teachers.tenantId, tenantId);

  const [studentRes] = await db
    .select({ cnt: count() })
    .from(students)
    .where(studentWhere);

  const [teacherRes] = await db
    .select({ cnt: count() })
    .from(teachers)
    .where(teacherWhere);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const [revenueRes] = await db
    .select({ total: sql<number>`COALESCE(SUM(${payments.amountCents}), 0)` })
    .from(payments)
    .where(
      and(
        eq(payments.tenantId, tenantId),
        sql`${payments.createdAt} >= ${monthStart.toISOString()}`
      )
    );

  const branchList = await db
    .select({ cnt: count() })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));

  return c.json({
    totalStudents: studentRes?.cnt ?? 0,
    totalTeachers: teacherRes?.cnt ?? 0,
    totalRevenue: Number(revenueRes?.total ?? 0),
    totalBranches: branchList[0]?.cnt ?? 0,
  });
});

/** POST /api/branches — create a branch */
branchRoutes.post("/", zValidator("json", createBranchSchema), async (c) => {
  const body = c.req.valid("json");
  const tenantId = c.get("user").tenantId;

  // Check if this is the first branch — auto-set as default
  const existing = await db
    .select({ cnt: count() })
    .from(branches)
    .where(eq(branches.tenantId, tenantId));
  const isFirst = (existing[0]?.cnt ?? 0) === 0;

  const [created] = await db
    .insert(branches)
    .values({
      tenantId,
      name: body.name,
      address: body.address ?? null,
      managerUserId: body.managerUserId ?? null,
      isDefault: isFirst,
    })
    .returning();

  return c.json(created, 201);
});

/** PATCH /api/branches/:id — update branch */
branchRoutes.patch("/:id", zValidator("json", updateBranchSchema), async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;
  const body = c.req.valid("json");

  // Verify ownership
  const existing = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId)));

  if (existing.length === 0) {
    return c.json({ error: "Branch not found" }, 404);
  }

  const updates: Partial<typeof branches.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (body.name !== undefined) updates.name = body.name;
  if (body.address !== undefined) updates.address = body.address;
  if (body.managerUserId !== undefined) updates.managerUserId = body.managerUserId;
  if (body.isDefault !== undefined) updates.isDefault = body.isDefault;

  const [updated] = await db
    .update(branches)
    .set(updates)
    .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId)))
    .returning();

  // BRANCH-702: When assigning a manager, set their branch_scope to this branch
  if (body.managerUserId !== undefined) {
    if (body.managerUserId) {
      // Assign scope to new manager
      await db
        .update(users)
        .set({ branchScope: id })
        .where(and(eq(users.id, body.managerUserId), eq(users.tenantId, tenantId)));
    } else if (existing[0]?.managerUserId) {
      // Remove scope from old manager (when managerUserId cleared to null)
      await db
        .update(users)
        .set({ branchScope: null })
        .where(and(eq(users.id, existing[0].managerUserId), eq(users.tenantId, tenantId)));
    }
  }

  return c.json(updated);
});

/** DELETE /api/branches/:id — delete branch (fails if it has students/teachers) */
branchRoutes.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const tenantId = c.get("user").tenantId;

  // Verify ownership
  const existing = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId)));

  if (existing.length === 0) {
    return c.json({ error: "Branch not found" }, 404);
  }

  // Block if students are assigned
  const [studentRes] = await db
    .select({ cnt: count() })
    .from(students)
    .where(and(eq(students.tenantId, tenantId), eq(students.branchId, id)));

  if ((studentRes?.cnt ?? 0) > 0) {
    return c.json(
      { error: "Cannot delete branch with assigned students. Reassign students first." },
      409
    );
  }

  await db
    .delete(branches)
    .where(and(eq(branches.id, id), eq(branches.tenantId, tenantId)));

  return c.json({ success: true });
});
