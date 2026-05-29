import { Hono } from "hono";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/client";
import { teachers, users } from "../db/schema";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

export const teacherRoutes = new Hono<{ Variables: AuthVariables }>();

teacherRoutes.use("*", requireAuth);

teacherRoutes.get("/", async (c) => {
  const tenantId = c.get("user").tenantId;
  const rows = await db
    .select({
      id: teachers.id,
      userId: teachers.userId,
      hourlyRateCents: teachers.hourlyRateCents,
      commissionPct: teachers.commissionPct,
      name: users.name,
      email: users.email,
    })
    .from(teachers)
    .innerJoin(users, eq(teachers.userId, users.id))
    .where(eq(teachers.tenantId, tenantId))
    .orderBy(desc(teachers.createdAt));
  return c.json({ items: rows });
});
