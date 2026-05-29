import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { existsSync } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "./db/client";
import { tenants, users, students, lessons } from "./db/schema";
import { authRoutes } from "./routes/auth";
import { studentRoutes } from "./routes/students";
import { teacherRoutes } from "./routes/teachers";
import { courseRoutes } from "./routes/courses";
import { lessonRoutes } from "./routes/lessons";
import { paymentRoutes } from "./routes/payments";
import { leadRoutes } from "./routes/leads";
import { webhookRoutes } from "./routes/webhooks";

const app = new Hono();

app.use("*", logger());
const allowedOrigins = [
  "http://localhost:5173",
  ...(process.env.ALLOWED_ORIGINS?.split(",").map((o) => o.trim()).filter(Boolean) ?? []),
];

app.use(
  "/api/*",
  cors({
    origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
    credentials: true,
  })
);

app.route("/api/auth", authRoutes);
app.route("/api/students", studentRoutes);
app.route("/api/teachers", teacherRoutes);
app.route("/api/courses", courseRoutes);
app.route("/api/lessons", lessonRoutes);
app.route("/api/payments", paymentRoutes);
app.route("/api/leads", leadRoutes);
app.route("/webhooks", webhookRoutes);

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

// Serve frontend static files in production (dist/)
const distDir = path.resolve(process.cwd(), "dist");
if (existsSync(distDir)) {
  console.log(`📦 Serving frontend from ${distDir}`);
  app.use(
    "/*",
    serveStatic({
      root: "./dist",
    })
  );
  // SPA fallback: any unknown path returns index.html
  app.notFound(async (c) => {
    const indexPath = path.join(distDir, "index.html");
    if (existsSync(indexPath)) {
      const html = await import("node:fs/promises").then((fs) => fs.readFile(indexPath, "utf8"));
      return c.html(html);
    }
    return c.text("Not found", 404);
  });
}

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`🚀 Vector Learn running on http://localhost:${info.port}`);
});

export default app;
