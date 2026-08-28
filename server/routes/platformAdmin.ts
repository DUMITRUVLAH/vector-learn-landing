/**
 * PLATFORM-001 — API-ul Consolei Platformă (`/api/platform/*`).
 *
 * Singurul consumator e proprietarul platformei (vezi lib/platformOwner + requirePlatformAdmin).
 * Acoperă: privire de ansamblu, workspace-uri cu statistici, module per workspace, implicitele
 * pentru workspace-uri noi, istoricul de logări, superadminii și auditul propriilor acțiuni.
 *
 * Notă de portabilitate: prod e Postgres, local/testele sunt PGlite — deci NIMIC prin
 * `db.execute(...).rows`. Tot ce urmează trece prin query builder (CLAUDE.md §3.5.1).
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, count, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import { parPayerModules, parPayers, parRequests, platformAdmins } from "../db/schema/par";
import { tenants } from "../db/schema/tenants";
import { users } from "../db/schema/users";
import {
  loginEvents,
  platformAuditLog,
  platformModuleDefaults,
  tenantModules,
  tenantNotes,
} from "../db/schema/platform";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePlatformAdmin } from "../middleware/requirePlatformAdmin";
import { parUuidGuard } from "../middleware/parUuidGuard";
import { clientIp } from "../lib/loginEvents";
import { MODULE_CATALOG, MODULE_KEYS, defaultModuleMap, isKnownModule } from "../lib/platformModules";

export const platformAdminRoutes = new Hono<{ Variables: AuthVariables }>();
platformAdminRoutes.use("*", requireAuth);
platformAdminRoutes.use("*", requirePlatformAdmin);
platformAdminRoutes.use("/organizations/:payerId/*", parUuidGuard("payerId"));
platformAdminRoutes.use("/workspaces/:tenantId/*", parUuidGuard("tenantId"));

/** Câte zile fără nicio logare înseamnă „risc de abandon". */
const CHURN_RISK_DAYS = 14;

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

/** Scrie o intrare de audit. Best-effort — o acțiune reușită nu se anulează fiindcă auditul a picat. */
async function audit(
  c: Parameters<typeof clientIp>[0],
  actor: { id: string; email: string },
  entry: { action: string; targetType?: string; targetId?: string; targetLabel?: string | null; meta?: Record<string, unknown> },
): Promise<void> {
  try {
    await db.insert(platformAuditLog).values({
      actorUserId: actor.id,
      actorEmail: actor.email,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      targetLabel: entry.targetLabel ?? null,
      meta: entry.meta ?? null,
      ipAddress: clientIp(c),
    });
  } catch (e) {
    console.warn("[platform] audit write skipped:", e instanceof Error ? e.message : e);
  }
}

/** Ghilimelizare CSV — o virgulă sau un ghilimel într-un nume de workspace nu are voie să rupă fișierul. */
function csv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const v = cell == null ? "" : String(cell);
          return /[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
        })
        .join(","),
    )
    .join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalog + implicitele pentru workspace-uri noi
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/platform/catalog — modulele existente + ce primește un workspace nou. */
platformAdminRoutes.get("/catalog", async (c) => {
  const rows = await db.select().from(platformModuleDefaults);
  const defaults = defaultModuleMap();
  for (const row of rows) defaults[row.moduleKey] = row.enabled;
  return c.json({ modules: MODULE_CATALOG, defaults });
});

const defaultsSchema = z.object({ module: z.string().min(1).max(50), enabled: z.boolean() });

/** PUT /api/platform/catalog/defaults — ce module vede un client care tocmai și-a făcut workspace. */
platformAdminRoutes.put("/catalog/defaults", zValidator("json", defaultsSchema), async (c) => {
  const actor = c.get("user");
  const body = c.req.valid("json");
  if (!isKnownModule(body.module)) return c.json({ error: "unknown_module" }, 400);

  const [existing] = await db
    .select({ id: platformModuleDefaults.id })
    .from(platformModuleDefaults)
    .where(eq(platformModuleDefaults.moduleKey, body.module));
  if (existing) {
    await db
      .update(platformModuleDefaults)
      .set({ enabled: body.enabled, updatedByUserId: actor.id, updatedAt: new Date() })
      .where(eq(platformModuleDefaults.id, existing.id));
  } else {
    await db
      .insert(platformModuleDefaults)
      .values({ moduleKey: body.module, enabled: body.enabled, updatedByUserId: actor.id });
  }
  await audit(c, actor, {
    action: "defaults.update",
    targetType: "module",
    targetId: body.module,
    meta: { enabled: body.enabled },
  });
  return c.json({ ok: true, module: body.module, enabled: body.enabled });
});

/**
 * POST /api/platform/catalog/apply-defaults — aplică implicitele la workspace-urile EXISTENTE.
 * Implicit doar la cele care n-au încă o setare explicită pentru modulul respectiv; cu
 * `{ overwrite: true }` rescrie și setările existente (util după o schimbare de ofertă).
 */
platformAdminRoutes.post(
  "/catalog/apply-defaults",
  zValidator("json", z.object({ overwrite: z.boolean().default(false) })),
  async (c) => {
    const actor = c.get("user");
    const { overwrite } = c.req.valid("json");

    const defaultRows = await db.select().from(platformModuleDefaults);
    const defaults = defaultModuleMap();
    for (const row of defaultRows) defaults[row.moduleKey] = row.enabled;

    const allTenants = await db.select({ id: tenants.id }).from(tenants);
    const existing = await db
      .select({ tenantId: tenantModules.tenantId, moduleKey: tenantModules.moduleKey })
      .from(tenantModules);
    const known = new Set(existing.map((r) => `${r.tenantId}:${r.moduleKey}`));

    let inserted = 0;
    let updated = 0;
    for (const t of allTenants) {
      for (const m of MODULE_CATALOG) {
        const enabled = defaults[m.key] === true;
        if (!known.has(`${t.id}:${m.key}`)) {
          await db
            .insert(tenantModules)
            .values({ tenantId: t.id, moduleKey: m.key, enabled, updatedByUserId: actor.id })
            .onConflictDoNothing();
          inserted++;
        } else if (overwrite) {
          await db
            .update(tenantModules)
            .set({ enabled, updatedByUserId: actor.id, updatedAt: new Date() })
            .where(and(eq(tenantModules.tenantId, t.id), eq(tenantModules.moduleKey, m.key)));
          updated++;
        }
      }
    }
    await audit(c, actor, {
      action: "defaults.apply_all",
      targetType: "platform",
      meta: { overwrite, inserted, updated, workspaces: allTenants.length },
    });
    return c.json({ ok: true, inserted, updated, workspaces: allTenants.length });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Privire de ansamblu
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/platform/overview — KPI-urile platformei + adopția modulelor. */
platformAdminRoutes.get("/overview", async (c) => {
  const allTenants = await db
    .select({ id: tenants.id, plan: tenants.plan, appKind: tenants.appKind, status: tenants.status, createdAt: tenants.createdAt })
    .from(tenants);
  const [{ value: userCount }] = await db.select({ value: count() }).from(users);

  const since30 = daysAgo(30);
  const since7 = daysAgo(7);
  const since1 = daysAgo(1);

  const recentLogins = await db
    .select({ tenantId: loginEvents.tenantId, success: loginEvents.success, createdAt: loginEvents.createdAt })
    .from(loginEvents)
    .where(gte(loginEvents.createdAt, since30));

  const activeTenantIds = new Set(
    recentLogins.filter((r) => r.success && r.createdAt >= since7 && r.tenantId).map((r) => r.tenantId as string),
  );

  const moduleRows = await db
    .select({ moduleKey: tenantModules.moduleKey, enabled: tenantModules.enabled })
    .from(tenantModules);
  const total = allTenants.length;
  const adoption = MODULE_CATALOG.map((m) => {
    const rows = moduleRows.filter((r) => r.moduleKey === m.key);
    // Cine n-are rând cade pe implicitul din cod: PAR pornit, restul oprite.
    const explicitlyOn = rows.filter((r) => r.enabled).length;
    const withoutRow = total - rows.length;
    const enabled = explicitlyOn + (m.defaultEnabled ? withoutRow : 0);
    return { key: m.key, label: m.label, enabled, total };
  });

  const plans = ["starter", "growth", "pro", "enterprise"].map((plan) => ({
    plan,
    count: allTenants.filter((t) => t.plan === plan).length,
  }));

  return c.json({
    workspaces: {
      total,
      business: allTenants.filter((t) => t.appKind === "business").length,
      learn: allTenants.filter((t) => t.appKind === "learn").length,
      suspended: allTenants.filter((t) => t.status === "suspended").length,
      new30d: allTenants.filter((t) => t.createdAt >= since30).length,
      active7d: activeTenantIds.size,
    },
    users: { total: userCount },
    logins: {
      last24h: recentLogins.filter((r) => r.success && r.createdAt >= since1).length,
      last7d: recentLogins.filter((r) => r.success && r.createdAt >= since7).length,
      failed7d: recentLogins.filter((r) => !r.success && r.createdAt >= since7).length,
    },
    adoption,
    plans,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Workspace-uri
// ─────────────────────────────────────────────────────────────────────────────

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  plan: string;
  appKind: string;
  status: string;
  trialEndsAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  userCount: number;
  lastLoginAt: string | null;
  logins30d: number;
  parRequests: number;
  modules: Record<string, boolean>;
  /** Fără nicio logare de peste CHURN_RISK_DAYS zile — semnal de abandon. */
  churnRisk: boolean;
}

/** Colectează lista de workspace-uri cu statistici, în puține interogări agregate. */
async function loadWorkspaces(): Promise<WorkspaceRow[]> {
  const tenantRows = await db
    .select({
      id: tenants.id, name: tenants.name, slug: tenants.slug, plan: tenants.plan,
      appKind: tenants.appKind, status: tenants.status, trialEndsAt: tenants.trialEndsAt,
      suspendedReason: tenants.suspendedReason, createdAt: tenants.createdAt,
    })
    .from(tenants)
    .orderBy(desc(tenants.createdAt));

  const userCounts = await db
    .select({ tenantId: users.tenantId, value: count() })
    .from(users)
    .groupBy(users.tenantId);

  const loginAgg = await db
    .select({
      tenantId: loginEvents.tenantId,
      last: sql<string>`max(${loginEvents.createdAt})`,
      value: count(),
    })
    .from(loginEvents)
    .where(and(eq(loginEvents.success, true), gte(loginEvents.createdAt, daysAgo(30))))
    .groupBy(loginEvents.tenantId);

  // Ultima logare de ORICÂND (nu doar în 30 de zile) — altfel un client inactiv de 2 luni
  // ar apărea ca „niciodată logat", ceea ce e fals și ascunde exact riscul de abandon.
  const lastEver = await db
    .select({ tenantId: loginEvents.tenantId, last: sql<string>`max(${loginEvents.createdAt})` })
    .from(loginEvents)
    .where(eq(loginEvents.success, true))
    .groupBy(loginEvents.tenantId);

  const parCounts = await db
    .select({ tenantId: parRequests.tenantId, value: count() })
    .from(parRequests)
    .groupBy(parRequests.tenantId);

  const moduleRows = await db
    .select({ tenantId: tenantModules.tenantId, moduleKey: tenantModules.moduleKey, enabled: tenantModules.enabled })
    .from(tenantModules);

  const userMap = new Map(userCounts.map((r) => [r.tenantId, r.value]));
  const loginMap = new Map(loginAgg.map((r) => [r.tenantId ?? "", r]));
  const lastMap = new Map(lastEver.map((r) => [r.tenantId ?? "", r.last]));
  const parMap = new Map(parCounts.map((r) => [r.tenantId, r.value]));

  const churnCutoff = daysAgo(CHURN_RISK_DAYS);

  return tenantRows.map((t) => {
    const modules = defaultModuleMap();
    for (const row of moduleRows) if (row.tenantId === t.id) modules[row.moduleKey] = row.enabled;

    const lastRaw = lastMap.get(t.id) ?? null;
    const lastLoginAt = lastRaw ? new Date(lastRaw).toISOString() : null;
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      plan: t.plan,
      appKind: t.appKind,
      status: t.status,
      trialEndsAt: t.trialEndsAt ? t.trialEndsAt.toISOString() : null,
      suspendedReason: t.suspendedReason,
      createdAt: t.createdAt.toISOString(),
      userCount: userMap.get(t.id) ?? 0,
      lastLoginAt,
      logins30d: loginMap.get(t.id)?.value ?? 0,
      parRequests: parMap.get(t.id) ?? 0,
      modules,
      churnRisk: !lastLoginAt || new Date(lastLoginAt) < churnCutoff,
    };
  });
}

/** GET /api/platform/workspaces — lista cu statistici. `?format=csv` întoarce un export. */
platformAdminRoutes.get("/workspaces", async (c) => {
  const rows = await loadWorkspaces();
  if (c.req.query("format") === "csv") {
    const header = ["Workspace", "Slug", "Aplicație", "Plan", "Stare", "Utilizatori", "Logări 30z", "Ultima logare", "Cereri PAR", "Creat", "Module active"];
    const body = rows.map((r) => [
      r.name, r.slug, r.appKind, r.plan, r.status, r.userCount, r.logins30d,
      r.lastLoginAt ?? "niciodată", r.parRequests, r.createdAt.slice(0, 10),
      MODULE_KEYS.filter((k) => r.modules[k] !== false).join(" · "),
    ]);
    return new Response(csv([header, ...body]), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="workspaces-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }
  return c.json({ workspaces: rows, churnRiskDays: CHURN_RISK_DAYS });
});

/** GET /api/platform/workspaces/:tenantId — detaliu: membri, logări recente, note. */
platformAdminRoutes.get("/workspaces/:tenantId", parUuidGuard("tenantId"), async (c) => {
  const tenantId = c.req.param("tenantId");
  const all = await loadWorkspaces();
  const workspace = all.find((w) => w.id === tenantId);
  if (!workspace) return c.json({ error: "not_found" }, 404);

  const members = await db
    .select({
      id: users.id, email: users.email, name: users.name, role: users.role,
      isActive: users.isActive, authProvider: users.authProvider, createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .orderBy(asc(users.createdAt));

  const lastByUser = await db
    .select({ userId: loginEvents.userId, last: sql<string>`max(${loginEvents.createdAt})` })
    .from(loginEvents)
    .where(and(eq(loginEvents.tenantId, tenantId), eq(loginEvents.success, true)))
    .groupBy(loginEvents.userId);
  const lastMap = new Map(lastByUser.map((r) => [r.userId ?? "", r.last]));

  const recentLogins = await db
    .select({
      id: loginEvents.id, email: loginEvents.email, success: loginEvents.success,
      failureReason: loginEvents.failureReason, app: loginEvents.app, method: loginEvents.method,
      ipAddress: loginEvents.ipAddress, userAgent: loginEvents.userAgent, createdAt: loginEvents.createdAt,
    })
    .from(loginEvents)
    .where(eq(loginEvents.tenantId, tenantId))
    .orderBy(desc(loginEvents.createdAt))
    .limit(25);

  const notes = await db
    .select()
    .from(tenantNotes)
    .where(eq(tenantNotes.tenantId, tenantId))
    .orderBy(desc(tenantNotes.createdAt))
    .limit(50);

  const payers = await db
    .select({ id: parPayers.id, name: parPayers.name, idno: parPayers.idno })
    .from(parPayers)
    .where(eq(parPayers.tenantId, tenantId));

  return c.json({
    workspace,
    members: members.map((m) => {
      const last = lastMap.get(m.id);
      return { ...m, createdAt: m.createdAt.toISOString(), lastLoginAt: last ? new Date(last).toISOString() : null };
    }),
    recentLogins: recentLogins.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
    notes: notes.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() })),
    payers,
  });
});

const moduleToggleSchema = z.object({ module: z.string().min(1).max(50), enabled: z.boolean() });

/**
 * PUT /api/platform/workspaces/:tenantId/modules — comută un modul pentru un workspace.
 * Oglindim și în `par_payer_modules` (verificarea per entitate juridică folosită de PAR),
 * ca să nu existe două surse de adevăr care se contrazic.
 */
platformAdminRoutes.put("/workspaces/:tenantId/modules", zValidator("json", moduleToggleSchema), async (c) => {
  const tenantId = c.req.param("tenantId");
  const actor = c.get("user");
  const body = c.req.valid("json");
  if (!isKnownModule(body.module)) return c.json({ error: "unknown_module" }, 400);

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return c.json({ error: "not_found" }, 404);

  const [existing] = await db
    .select({ id: tenantModules.id })
    .from(tenantModules)
    .where(and(eq(tenantModules.tenantId, tenantId), eq(tenantModules.moduleKey, body.module)));
  if (existing) {
    await db
      .update(tenantModules)
      .set({ enabled: body.enabled, updatedByUserId: actor.id, updatedAt: new Date() })
      .where(eq(tenantModules.id, existing.id));
  } else {
    await db
      .insert(tenantModules)
      .values({ tenantId, moduleKey: body.module, enabled: body.enabled, updatedByUserId: actor.id });
  }

  if (body.module === "par" || body.module === "findesk") {
    const payerRows = await db.select({ id: parPayers.id }).from(parPayers).where(eq(parPayers.tenantId, tenantId));
    for (const payer of payerRows) {
      const [payerModule] = await db
        .select({ id: parPayerModules.id })
        .from(parPayerModules)
        .where(and(eq(parPayerModules.payerId, payer.id), eq(parPayerModules.moduleKey, body.module)));
      if (payerModule) {
        await db
          .update(parPayerModules)
          .set({ enabled: body.enabled, updatedByUserId: actor.id, updatedAt: new Date() })
          .where(eq(parPayerModules.id, payerModule.id));
      } else {
        await db
          .insert(parPayerModules)
          .values({ tenantId, payerId: payer.id, moduleKey: body.module, enabled: body.enabled, updatedByUserId: actor.id });
      }
    }
  }

  await audit(c, actor, {
    action: "module.toggle",
    targetType: "workspace",
    targetId: tenantId,
    targetLabel: tenant.name,
    meta: { module: body.module, enabled: body.enabled },
  });
  return c.json({ ok: true, tenantId, module: body.module, enabled: body.enabled });
});

const statusSchema = z.object({
  status: z.enum(["active", "trial", "suspended"]),
  reason: z.string().max(300).optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
});

/** PUT /api/platform/workspaces/:tenantId/status — activ / probă / suspendat. Reversibil. */
platformAdminRoutes.put("/workspaces/:tenantId/status", zValidator("json", statusSchema), async (c) => {
  const tenantId = c.req.param("tenantId");
  const actor = c.get("user");
  const body = c.req.valid("json");

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return c.json({ error: "not_found" }, 404);

  await db
    .update(tenants)
    .set({
      status: body.status,
      suspendedReason: body.status === "suspended" ? (body.reason ?? null) : null,
      ...(body.trialEndsAt !== undefined
        ? { trialEndsAt: body.trialEndsAt ? new Date(body.trialEndsAt) : null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, tenantId));

  await audit(c, actor, {
    action: body.status === "suspended" ? "workspace.suspend" : "workspace.status",
    targetType: "workspace",
    targetId: tenantId,
    targetLabel: tenant.name,
    meta: { status: body.status, reason: body.reason ?? null },
  });
  return c.json({ ok: true, tenantId, status: body.status });
});

const planSchema = z.object({ plan: z.enum(["starter", "growth", "pro", "enterprise"]) });

/** PUT /api/platform/workspaces/:tenantId/plan */
platformAdminRoutes.put("/workspaces/:tenantId/plan", zValidator("json", planSchema), async (c) => {
  const tenantId = c.req.param("tenantId");
  const actor = c.get("user");
  const { plan } = c.req.valid("json");
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  if (!tenant) return c.json({ error: "not_found" }, 404);
  await db.update(tenants).set({ plan, updatedAt: new Date() }).where(eq(tenants.id, tenantId));
  await audit(c, actor, {
    action: "workspace.plan", targetType: "workspace", targetId: tenantId,
    targetLabel: tenant.name, meta: { plan, from: tenant.plan },
  });
  return c.json({ ok: true, tenantId, plan });
});

/** POST /api/platform/workspaces/:tenantId/notes — notă internă (niciodată vizibilă clientului). */
platformAdminRoutes.post(
  "/workspaces/:tenantId/notes",
  zValidator("json", z.object({ body: z.string().min(1).max(4000) })),
  async (c) => {
    const tenantId = c.req.param("tenantId");
    const actor = c.get("user");
    const { body } = c.req.valid("json");
    const [tenant] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, tenantId));
    if (!tenant) return c.json({ error: "not_found" }, 404);
    const [note] = await db
      .insert(tenantNotes)
      .values({ tenantId, authorUserId: actor.id, authorEmail: actor.email, body })
      .returning();
    return c.json({ note: { ...note, createdAt: note.createdAt.toISOString() } }, 201);
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Istoric de logări
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/platform/logins — istoricul, cu filtre (`tenantId`, `q`, `result`, `days`) și
 * paginare. `?format=csv` exportă exact rândurile filtrate.
 */
platformAdminRoutes.get("/logins", async (c) => {
  const q = c.req.query("q")?.trim();
  const tenantId = c.req.query("tenantId");
  const result = c.req.query("result"); // "success" | "failed"
  const days = Math.min(Math.max(Number(c.req.query("days") ?? 30), 1), 365);
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 100), 1), 500);
  const offset = Math.max(Number(c.req.query("offset") ?? 0), 0);

  const conditions = [gte(loginEvents.createdAt, daysAgo(days))];
  if (tenantId && /^[0-9a-f-]{36}$/i.test(tenantId)) conditions.push(eq(loginEvents.tenantId, tenantId));
  if (result === "success") conditions.push(eq(loginEvents.success, true));
  if (result === "failed") conditions.push(eq(loginEvents.success, false));
  if (q) {
    const like = `%${q}%`;
    // `or()` poate întoarce undefined pentru o listă goală — aici avem mereu două condiții.
    conditions.push(or(ilike(loginEvents.email, like), ilike(loginEvents.ipAddress, like))!);
  }
  const where = and(...conditions);

  const [{ value: total }] = await db.select({ value: count() }).from(loginEvents).where(where);

  const rows = await db
    .select({
      id: loginEvents.id, email: loginEvents.email, success: loginEvents.success,
      failureReason: loginEvents.failureReason, app: loginEvents.app, method: loginEvents.method,
      ipAddress: loginEvents.ipAddress, userAgent: loginEvents.userAgent,
      createdAt: loginEvents.createdAt, tenantId: loginEvents.tenantId, userId: loginEvents.userId,
      tenantName: tenants.name, userName: users.name,
    })
    .from(loginEvents)
    .leftJoin(tenants, eq(tenants.id, loginEvents.tenantId))
    .leftJoin(users, eq(users.id, loginEvents.userId))
    .where(where)
    .orderBy(desc(loginEvents.createdAt))
    .limit(c.req.query("format") === "csv" ? 5000 : limit)
    .offset(c.req.query("format") === "csv" ? 0 : offset);

  if (c.req.query("format") === "csv") {
    const header = ["Data", "Email", "Nume", "Workspace", "Aplicație", "Metodă", "Rezultat", "Motiv", "IP", "User-Agent"];
    const body = rows.map((r) => [
      r.createdAt.toISOString(), r.email, r.userName ?? "", r.tenantName ?? "",
      r.app, r.method, r.success ? "reușit" : "eșuat", r.failureReason ?? "",
      r.ipAddress ?? "", r.userAgent ?? "",
    ]);
    return new Response(csv([header, ...body]), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="logari-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  // Semnal de brute-force: emailuri cu ≥5 eșecuri în intervalul filtrat. Se calculează pe
  // fereastra selectată, nu pe pagina curentă — altfel ar depinde de cât ai derulat.
  const failures = await db
    .select({ email: loginEvents.email, value: count() })
    .from(loginEvents)
    .where(and(eq(loginEvents.success, false), gte(loginEvents.createdAt, daysAgo(days))))
    .groupBy(loginEvents.email);
  const suspicious = failures
    .filter((f) => f.value >= 5)
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((f) => ({ email: f.email, failures: f.value }));

  return c.json({
    events: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    total,
    limit,
    offset,
    suspicious,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Superadmini + audit
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/platform/admins */
platformAdminRoutes.get("/admins", async (c) => {
  const rows = await db
    .select({
      id: platformAdmins.id, userId: platformAdmins.userId, createdAt: platformAdmins.createdAt,
      email: users.email, name: users.name, tenantName: tenants.name,
    })
    .from(platformAdmins)
    .leftJoin(users, eq(users.id, platformAdmins.userId))
    .leftJoin(tenants, eq(tenants.id, users.tenantId))
    .orderBy(asc(platformAdmins.createdAt));
  return c.json({
    admins: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    self: c.get("user").id,
  });
});

/** POST /api/platform/admins — promovează un cont EXISTENT (nu creează utilizatori). */
platformAdminRoutes.post(
  "/admins",
  zValidator("json", z.object({ email: z.string().email().max(255) })),
  async (c) => {
    const actor = c.get("user");
    const email = c.req.valid("json").email.trim().toLowerCase();
    const target = await db.query.users.findFirst({ where: eq(users.email, email) });
    if (!target) return c.json({ error: "user_not_found" }, 404);
    await db.insert(platformAdmins).values({ userId: target.id }).onConflictDoNothing();
    await audit(c, actor, {
      action: "admin.add", targetType: "user", targetId: target.id, targetLabel: target.email,
    });
    return c.json({ ok: true, userId: target.id, email: target.email }, 201);
  },
);

/** DELETE /api/platform/admins/:userId — nu te poți scoate singur (ar închide ușa pe dinăuntru). */
platformAdminRoutes.delete("/admins/:userId", async (c) => {
  const actor = c.get("user");
  const userId = c.req.param("userId");
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return c.json({ error: "invalid_id" }, 400);
  if (userId === actor.id) return c.json({ error: "cannot_remove_self" }, 400);
  const deleted = await db.delete(platformAdmins).where(eq(platformAdmins.userId, userId)).returning({ id: platformAdmins.id });
  if (deleted.length === 0) return c.json({ error: "not_found" }, 404);
  await audit(c, actor, { action: "admin.remove", targetType: "user", targetId: userId });
  return c.json({ ok: true });
});

/** GET /api/platform/audit — ce am schimbat eu, superadminul, și când. */
platformAdminRoutes.get("/audit", async (c) => {
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 100), 1), 500);
  const rows = await db
    .select()
    .from(platformAuditLog)
    .orderBy(desc(platformAuditLog.createdAt))
    .limit(limit);
  return c.json({ entries: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })) });
});

// ─────────────────────────────────────────────────────────────────────────────
// Compatibilitate: modulele per entitate juridică (PAR), ecranul existent
// ─────────────────────────────────────────────────────────────────────────────

platformAdminRoutes.get("/organizations", async (c) => {
  const rows = await db.select({
    id: parPayers.id, name: parPayers.name, legalName: parPayers.legalName, idno: parPayers.idno,
    tenantId: parPayers.tenantId, workspaceName: tenants.name, moduleKey: parPayerModules.moduleKey,
    moduleEnabled: parPayerModules.enabled,
  }).from(parPayers).leftJoin(tenants, eq(tenants.id, parPayers.tenantId))
    .leftJoin(parPayerModules, eq(parPayerModules.payerId, parPayers.id)).orderBy(asc(tenants.name), asc(parPayers.name));
  const organizations = new Map<string, { id: string; name: string; legalName: string | null; idno: string | null; tenantId: string; workspaceName: string | null; modules: Record<string, boolean> }>();
  rows.forEach((r) => {
    const item = organizations.get(r.id) ?? { id: r.id, name: r.name, legalName: r.legalName, idno: r.idno, tenantId: r.tenantId, workspaceName: r.workspaceName, modules: {} };
    if (r.moduleKey) item.modules[r.moduleKey] = r.moduleEnabled ?? false;
    organizations.set(r.id, item);
  });
  return c.json({ organizations: [...organizations.values()] });
});

const moduleSchema = z.object({ module: z.enum(["par", "findesk"]), enabled: z.boolean() });
platformAdminRoutes.put("/organizations/:payerId/modules", zValidator("json", moduleSchema), async (c) => {
  const payerId = c.req.param("payerId"); const actor = c.get("user"); const body = c.req.valid("json");
  const [payer] = await db.select().from(parPayers).where(eq(parPayers.id, payerId));
  if (!payer) return c.json({ error: "not_found" }, 404);
  const [existing] = await db.select({ id: parPayerModules.id }).from(parPayerModules).where(and(eq(parPayerModules.payerId, payerId), eq(parPayerModules.moduleKey, body.module)));
  if (existing) await db.update(parPayerModules).set({ enabled: body.enabled, updatedByUserId: actor.id, updatedAt: new Date() }).where(eq(parPayerModules.id, existing.id));
  else await db.insert(parPayerModules).values({ tenantId: payer.tenantId, payerId, moduleKey: body.module, enabled: body.enabled, updatedByUserId: actor.id });
  await audit(c, actor, {
    action: "payer_module.toggle", targetType: "payer", targetId: payerId, targetLabel: payer.name,
    meta: { module: body.module, enabled: body.enabled },
  });
  return c.json({ ok: true, payerId, module: body.module, enabled: body.enabled });
});
