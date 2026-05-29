import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { sql } from "drizzle-orm";
import { db } from "./db/client";
import { tenants, users, students, lessons } from "./db/schema";
import { authRoutes } from "./routes/auth";
import { studentRoutes } from "./routes/students";

const app = new Hono();

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);

app.route("/api/auth", authRoutes);
app.route("/api/students", studentRoutes);

app.get("/api/health", async (c) => {
  try {
    await db.execute(sql`SELECT 1 as ping`);
    return c.json({
      ok: true,
      db: "connected",
      time: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        ok: false,
        db: "disconnected",
        error: error instanceof Error ? error.message : "unknown",
      },
      503
    );
  }
});

app.get("/api/health/db", async (c) => {
  try {
    const tablesResult = await db.execute(
      sql`SELECT count(*)::int as table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_name NOT LIKE '\\_\\_%' ESCAPE '\\'`
    );
    const tableRow = tablesResult.rows[0] as { table_count: number } | undefined;

    const [tenantCount] = await db.select({ c: sql<number>`count(*)::int` }).from(tenants);
    const [userCount] = await db.select({ c: sql<number>`count(*)::int` }).from(users);
    const [studentCount] = await db.select({ c: sql<number>`count(*)::int` }).from(students);
    const [lessonCount] = await db.select({ c: sql<number>`count(*)::int` }).from(lessons);

    return c.json({
      ok: true,
      tables: tableRow?.table_count ?? 0,
      counts: {
        tenants: tenantCount.c,
        users: userCount.c,
        students: studentCount.c,
        lessons: lessonCount.c,
      },
    });
  } catch (error) {
    return c.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "unknown",
      },
      503
    );
  }
});

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 Vector Learn API running on http://localhost:${info.port}`);
});

export default app;
