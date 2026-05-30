import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
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
import { pipelineRoutes } from "./routes/pipeline";
import { taskRoutes } from "./routes/tasks";
import { templateRoutes } from "./routes/templates";
import { automationRoutes } from "./routes/automations";
import { analyticsRoutes } from "./routes/analytics";
import { tagRoutes } from "./routes/tags";

/**
 * The configured Hono app (routes + middleware), with NO server binding and NO
 * static-file serving. Shared by:
 *   - server/index.ts        → local single-port Node server (adds static + serve()).
 *   - server/vercel-entry.ts → Vercel serverless function (bundled by build-vercel.mjs).
 */
export const app = new Hono();

app.use("*", logger());

// TEMPORARY diagnostic #4 — does reading a POST JSON body hang? (GET diagnostics all pass;
// only POST login hangs. Suspect: Vercel Node helpers pre-consume the body, so Hono's
// c.req.json() waits forever for an already-read stream.)
app.post("/api/__diag__/echo", async (c) => {
  const t = Date.now();
  let timer: ReturnType<typeof setTimeout>;
  try {
    const body = await Promise.race([
      c.req.json(),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error("c.req.json() timeout 6000ms — body stream hung")), 6000); }),
    ]);
    clearTimeout(timer!);
    return c.json({ ok: true, ms: Date.now() - t, body });
  } catch (e) {
    clearTimeout(timer!);
    return c.json({ ok: false, ms: Date.now() - t, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

// TEMPORARY diagnostic #3 — runs EACH login step in isolation to find which one hangs:
// bcrypt verify, the session INSERT (write), etc. DB read already proven fine.
app.get("/api/__diag__/login-steps", async (c) => {
  const out: Record<string, unknown> = {};
  const cap = <T,>(label: string, ms: number, p: Promise<T>) => {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      p,
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`${label}: timeout ${ms}ms`)), ms); }),
    ]).finally(() => clearTimeout(timer!));
  };
  try {
    const { db } = await import("./db/client");
    const { users, sessions } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    const { verifyPassword } = await import("./auth/password");
    const { randomBytes } = await import("node:crypto");

    let t = Date.now();
    const u = await cap("find", 8000, db.query.users.findFirst({ where: eq(users.email, "admin@demo.vectorlearn.io") }));
    out.find_ms = Date.now() - t;
    const user = u as { id: string; passwordHash: string } | undefined;
    if (!user) return c.json({ ok: false, step: "find", error: "no user" }, 500);

    t = Date.now();
    out.bcrypt_ok = await cap("bcrypt", 8000, verifyPassword("demo123456", user.passwordHash));
    out.bcrypt_ms = Date.now() - t;

    t = Date.now();
    const token = randomBytes(48).toString("base64url");
    await cap("insert-session", 8000, db.insert(sessions).values({ userId: user.id, token, expiresAt: new Date(Date.now() + 86400000) }) as unknown as Promise<unknown>);
    out.insertSession_ms = Date.now() - t;

    // cleanup the test session
    await cap("cleanup", 8000, db.delete(sessions).where(eq(sessions.token, token)) as unknown as Promise<unknown>);

    return c.json({ ok: true, ...out });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e), ...out }, 500);
  }
});

// TEMPORARY diagnostic #2 — runs the EXACT login query through the app's shared `db` client
// (the one login uses), step by step with hard timeouts, to find which step hangs.
app.get("/api/__diag__/login-path", async (c) => {
  const out: Record<string, unknown> = {};
  const cap = <T,>(label: string, ms: number, p: Promise<T>) => {
    let timer: ReturnType<typeof setTimeout>;
    return Promise.race([
      p,
      new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error(`${label}: timeout ${ms}ms`)), ms); }),
    ]).finally(() => clearTimeout(timer!));
  };
  try {
    const t0 = Date.now();
    const { db } = await import("./db/client");
    const { users } = await import("./db/schema");
    const { eq } = await import("drizzle-orm");
    out.import_ms = Date.now() - t0;

    const t1 = Date.now();
    const u = await cap("findFirst", 8000, db.query.users.findFirst({ where: eq(users.email, "admin@demo.vectorlearn.io") }));
    out.findFirst_ms = Date.now() - t1;
    out.foundUser = (u as { email?: string } | undefined)?.email ?? null;

    const t2 = Date.now();
    const raw = await cap("raw-select", 8000, (db as unknown as { execute: (q: unknown) => Promise<unknown> }).execute((await import("drizzle-orm")).sql`select 1 as ok`));
    out.raw_ms = Date.now() - t2;
    out.rawShape = Array.isArray(raw) ? "array" : typeof raw;

    return c.json({ ok: true, ...out });
  } catch (e) {
    return c.json({ ok: false, error: e instanceof Error ? e.message : String(e), ...out }, 500);
  }
});

// TEMPORARY diagnostic — pinpoints the prod DB hang. Tries several connection strategies
// against the env URLs with hard per-attempt timeouts, reporting connect time, query time,
// or the exact error/timeout. Mounted FIRST so no auth/route shadows it. Remove once fixed.
app.get("/api/__diag__/db", async (c) => {
  const postgres = (await import("postgres")).default;

  function pick(suffix: string): { name: string; url: string } | null {
    if (process.env[suffix]) return { name: suffix, url: process.env[suffix]! };
    const k = Object.keys(process.env).find((x) => x.endsWith(suffix) && process.env[x]);
    return k ? { name: k, url: process.env[k]! } : null;
  }

  async function withTimeout<T>(label: string, ms: number, p: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<never>((_, rej) => {
      timer = setTimeout(() => rej(new Error(`${label}: hard timeout after ${ms}ms`)), ms);
    });
    try {
      return await Promise.race([p, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }

  async function attempt(label: string, urlInfo: { name: string; url: string } | null, opts: Record<string, unknown>) {
    if (!urlInfo) return { label, skipped: "url not present in env" };
    const hostport = urlInfo.url.replace(/.*@([^/?]+).*/, "$1");
    const t0 = Date.now();
    let client: ReturnType<typeof postgres> | undefined;
    try {
      client = postgres(urlInfo.url, { ...opts, max: 1 });
      // Force an actual round-trip with a hard 8s ceiling.
      await withTimeout(label, 8000, client`select 1 as ok` as unknown as Promise<unknown>);
      return { label, env: urlInfo.name, hostport, ok: true, ms: Date.now() - t0, opts: Object.keys(opts) };
    } catch (e) {
      return { label, env: urlInfo.name, hostport, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e), opts: Object.keys(opts) };
    } finally {
      try { await withTimeout("end", 2000, (client?.end({ timeout: 1 }) ?? Promise.resolve()) as Promise<unknown>); } catch { /* ignore */ }
    }
  }

  const pooled = pick("POSTGRES_URL");
  const nonpool = pick("POSTGRES_URL_NON_POOLING");

  const results = [];
  // Run sequentially so one hang doesn't mask another; each is hard-capped at 8s.
  results.push(await attempt("transaction-pooler :6543 (prepare:false)", pooled, { prepare: false, ssl: "require", connect_timeout: 8 }));
  results.push(await attempt("session-pooler :5432 (prepare:false)", nonpool, { prepare: false, ssl: "require", connect_timeout: 8 }));
  results.push(await attempt("session-pooler :5432 (ssl:false/url-ssl)", nonpool, { connect_timeout: 8 }));
  results.push(await attempt("session-pooler :5432 (prepare:false, no-explicit-ssl)", nonpool, { prepare: false, connect_timeout: 8 }));

  return c.json({
    runtime: { onVercel: !!process.env.VERCEL, region: process.env.VERCEL_REGION ?? null, node: process.version },
    envUrls: { pooled: pooled?.name ?? null, nonpool: nonpool?.name ?? null, hasDATABASE_URL: !!process.env.DATABASE_URL },
    results,
  });
});

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
app.route("/api/pipeline-stages", pipelineRoutes);
app.route("/api/leads", taskRoutes); // tasks/attachments under /api/leads/:leadId/...
app.route("/api/templates", templateRoutes);
app.route("/api/automations", automationRoutes);
app.route("/api/analytics", analyticsRoutes);
app.route("/api", tagRoutes); // tags, custom-fields, field-values under /api/leads/:id/... and /api/settings/...

app.get("/api/health", async (c) => {
  try {
    await db.execute(sql`SELECT 1 as ping`);
    return c.json({ ok: true, db: "connected", time: new Date().toISOString() });
  } catch (error) {
    return c.json(
      { ok: false, db: "disconnected", error: error instanceof Error ? error.message : "unknown" },
      503
    );
  }
});

app.get("/api/health/db", async (c) => {
  try {
    const tablesResult = await db.execute(
      sql`SELECT count(*)::int as table_count FROM information_schema.tables WHERE table_schema = 'public' AND table_name NOT LIKE '\\_\\_%' ESCAPE '\\'`
    );
    // postgres-js returns the rows array directly; PGlite wraps them in `.rows`.
    const tableRows = (Array.isArray(tablesResult) ? tablesResult : tablesResult.rows) as
      | Array<{ table_count: number }>
      | undefined;
    const tableRow = tableRows?.[0];
    const [tenantCount] = await db.select({ c: sql<number>`count(*)::int` }).from(tenants);
    const [userCount] = await db.select({ c: sql<number>`count(*)::int` }).from(users);
    const [studentCount] = await db.select({ c: sql<number>`count(*)::int` }).from(students);
    const [lessonCount] = await db.select({ c: sql<number>`count(*)::int` }).from(lessons);
    return c.json({
      ok: true,
      tables: tableRow?.table_count ?? 0,
      counts: { tenants: tenantCount.c, users: userCount.c, students: studentCount.c, lessons: lessonCount.c },
    });
  } catch (error) {
    return c.json({ ok: false, error: error instanceof Error ? error.message : "unknown" }, 503);
  }
});

export default app;
