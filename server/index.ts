import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { sql } from "drizzle-orm";
import { db } from "./db/client.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "/api/*",
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);

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
    const result = await db.execute(
      sql`SELECT count(*)::int as table_count FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const row = result.rows[0] as { table_count: number } | undefined;
    return c.json({
      ok: true,
      tables: row?.table_count ?? 0,
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
