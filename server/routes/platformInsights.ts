/**
 * PLATFORM-002 — `/api/platform/errors/*` și `/api/platform/growth`.
 *
 * Două întrebări la care consola nu putea răspunde:
 *   „ce s-a stricat la clienți?"  → lista grupată de erori, cu apariții și cine a lovit-o
 *   „de unde vin și cine rămâne?" → pâlnia înregistrare → logare → activare, sursele,
 *                                    folosirea reală a modulelor și lista „de sunat azi".
 *
 * Montat sub același prefix `/api/platform`, deci moștenește requireAuth + requirePlatformAdmin
 * din `platformAdmin.ts`? NU — routerele Hono nu împart middleware între ele. Le declarăm
 * explicit aici; a te baza pe montarea vecinului e exact felul în care se scapă o rută
 * de administrare nepăzită.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "../db/client";
import { tenants } from "../db/schema/tenants";
import { errorEvents, errorGroups } from "../db/schema/telemetry";
import { loginEvents, tenantModules } from "../db/schema/platform";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePlatformAdmin } from "../middleware/requirePlatformAdmin";
import { MODULE_CATALOG } from "../lib/platformModules";
import {
  backfillActivation,
  contactEmailByTenant,
  isActivated,
  loadUsageByTenant,
  usesModule,
} from "../lib/growthSignals";

export const platformInsightsRoutes = new Hono<{ Variables: AuthVariables }>();
platformInsightsRoutes.use("*", requireAuth);
platformInsightsRoutes.use("*", requirePlatformAdmin);

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

// ─────────────────────────────────────────────────────────────────────────────
// Erori
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/platform/errors — grupurile de erori, cele mai recente primele.
 * Filtre: `status` (open|resolved|ignored|all), `kind`, `days`.
 */
platformInsightsRoutes.get("/errors", async (c) => {
  const status = c.req.query("status") ?? "open";
  const kind = c.req.query("kind");
  const days = Math.min(Math.max(Number(c.req.query("days") ?? 30), 1), 365);

  const conditions = [gte(errorGroups.lastSeenAt, daysAgo(days))];
  if (status !== "all") conditions.push(eq(errorGroups.status, status));
  if (kind) conditions.push(eq(errorGroups.kind, kind));

  const groups = await db
    .select()
    .from(errorGroups)
    .where(and(...conditions))
    .orderBy(desc(errorGroups.lastSeenAt))
    .limit(200);

  // Câte sunt deschise în total (independent de filtru) — pentru insigna din meniu.
  const openRows = await db
    .select({ id: errorGroups.id })
    .from(errorGroups)
    .where(and(eq(errorGroups.status, "open"), gte(errorGroups.lastSeenAt, daysAgo(30))));

  return c.json({
    groups: groups.map((g) => ({
      ...g,
      firstSeenAt: g.firstSeenAt.toISOString(),
      lastSeenAt: g.lastSeenAt.toISOString(),
      resolvedAt: g.resolvedAt ? g.resolvedAt.toISOString() : null,
      alertedAt: g.alertedAt ? g.alertedAt.toISOString() : null,
      createdAt: g.createdAt.toISOString(),
    })),
    openCount: openRows.length,
  });
});

/** GET /api/platform/errors/:groupId — ultimele apariții, cu cine le-a lovit. */
platformInsightsRoutes.get("/errors/:groupId", async (c) => {
  const groupId = c.req.param("groupId");
  if (!/^[0-9a-f-]{36}$/i.test(groupId)) return c.json({ error: "not_found" }, 404);

  const [group] = await db.select().from(errorGroups).where(eq(errorGroups.id, groupId));
  if (!group) return c.json({ error: "not_found" }, 404);

  const events = await db
    .select({
      id: errorEvents.id,
      message: errorEvents.message,
      stack: errorEvents.stack,
      location: errorEvents.location,
      method: errorEvents.method,
      statusCode: errorEvents.statusCode,
      url: errorEvents.url,
      userEmail: errorEvents.userEmail,
      userAgent: errorEvents.userAgent,
      createdAt: errorEvents.createdAt,
      tenantId: errorEvents.tenantId,
      tenantName: tenants.name,
    })
    .from(errorEvents)
    .leftJoin(tenants, eq(tenants.id, errorEvents.tenantId))
    .where(eq(errorEvents.groupId, groupId))
    .orderBy(desc(errorEvents.createdAt))
    .limit(50);

  return c.json({
    group: {
      ...group,
      firstSeenAt: group.firstSeenAt.toISOString(),
      lastSeenAt: group.lastSeenAt.toISOString(),
      resolvedAt: group.resolvedAt ? group.resolvedAt.toISOString() : null,
      alertedAt: group.alertedAt ? group.alertedAt.toISOString() : null,
      createdAt: group.createdAt.toISOString(),
    },
    events: events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
  });
});

/**
 * PUT /api/platform/errors/:groupId/status — rezolvat / ignorat / redeschis.
 * O eroare marcată „rezolvat" care reapare se redeschide singură (vezi lib/errorTelemetry).
 */
platformInsightsRoutes.put(
  "/errors/:groupId/status",
  zValidator("json", z.object({ status: z.enum(["open", "resolved", "ignored"]) })),
  async (c) => {
    const groupId = c.req.param("groupId");
    if (!/^[0-9a-f-]{36}$/i.test(groupId)) return c.json({ error: "not_found" }, 404);
    const actor = c.get("user");
    const { status } = c.req.valid("json");

    const [group] = await db.select({ id: errorGroups.id }).from(errorGroups).where(eq(errorGroups.id, groupId));
    if (!group) return c.json({ error: "not_found" }, 404);

    await db
      .update(errorGroups)
      .set({
        status,
        resolvedByUserId: status === "open" ? null : actor.id,
        resolvedAt: status === "open" ? null : new Date(),
      })
      .where(eq(errorGroups.id, groupId));
    return c.json({ ok: true, groupId, status });
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// Creștere
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/platform/growth — pâlnia, sursele, folosirea reală a modulelor și
 * lista „de sunat azi". Un singur apel: ecranul e o pagină, nu cinci.
 */
platformInsightsRoutes.get("/growth", async (c) => {
  const days = Math.min(Math.max(Number(c.req.query("days") ?? 90), 7), 365);
  const since = daysAgo(days);

  const tenantRows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      plan: tenants.plan,
      status: tenants.status,
      appKind: tenants.appKind,
      createdAt: tenants.createdAt,
      activatedAt: tenants.activatedAt,
      trialEndsAt: tenants.trialEndsAt,
      signupSource: tenants.signupSource,
      signupMedium: tenants.signupMedium,
      signupCampaign: tenants.signupCampaign,
      signupReferrer: tenants.signupReferrer,
    })
    .from(tenants);

  const usage = await loadUsageByTenant();
  // Marchează activarea celor care au făcut deja ceva real dar n-aveau momentul notat
  // (inclusiv clienții de dinaintea acestei funcționalități). Idempotent.
  await backfillActivation(usage);

  const contacts = await contactEmailByTenant();

  const loggedInIds = new Set(
    (
      await db
        .selectDistinct({ tenantId: loginEvents.tenantId })
        .from(loginEvents)
        .where(eq(loginEvents.success, true))
    )
      .map((r) => r.tenantId)
      .filter((x): x is string => !!x),
  );

  const lastLoginRows = await db
    .select({ tenantId: loginEvents.tenantId, last: sql<string>`max(${loginEvents.createdAt})` })
    .from(loginEvents)
    .where(eq(loginEvents.success, true))
    .groupBy(loginEvents.tenantId);
  const lastLogin = new Map(lastLoginRows.map((r) => [r.tenantId ?? "", r.last]));

  const inWindow = tenantRows.filter((t) => t.createdAt >= since);

  // Pâlnia: câte workspace-uri s-au creat, câte s-au logat vreodată, câte au făcut ceva real.
  const funnel = {
    signedUp: inWindow.length,
    loggedIn: inWindow.filter((t) => loggedInIds.has(t.id)).length,
    activated: inWindow.filter((t) => isActivated(usage.get(t.id))).length,
  };

  // Sursele — „direct" pentru cine a venit fără UTM.
  const bySource = new Map<string, { source: string; signups: number; activated: number }>();
  for (const t of inWindow) {
    const key = t.signupSource ?? (t.signupReferrer ? "referral" : "direct");
    const entry = bySource.get(key) ?? { source: key, signups: 0, activated: 0 };
    entry.signups++;
    if (isActivated(usage.get(t.id))) entry.activated++;
    bySource.set(key, entry);
  }

  // Adopția reală: câte workspace-uri au modulul pornit vs câte îl chiar folosesc.
  const moduleRows = await db
    .select({ tenantId: tenantModules.tenantId, moduleKey: tenantModules.moduleKey, enabled: tenantModules.enabled })
    .from(tenantModules);
  const disabledFor = new Map<string, Set<string>>();
  for (const row of moduleRows) {
    if (row.enabled) continue;
    const set = disabledFor.get(row.moduleKey) ?? new Set<string>();
    set.add(row.tenantId);
    disabledFor.set(row.moduleKey, set);
  }
  const adoption = MODULE_CATALOG.map((m) => {
    const disabled = disabledFor.get(m.key) ?? new Set<string>();
    const enabled = tenantRows.filter((t) => !disabled.has(t.id));
    const used = enabled.filter((t) => usesModule(usage.get(t.id), m.key));
    return { key: m.key, label: m.label, enabled: enabled.length, used: used.length, total: tenantRows.length };
  });

  // „De sunat azi": clienții unde o intervenție chiar schimbă ceva, cu motivul alături.
  const now = Date.now();
  const callList = tenantRows
    .map((t) => {
      const reasons: string[] = [];
      const last = lastLogin.get(t.id);
      const lastMs = last ? new Date(last).getTime() : null;
      const activated = isActivated(usage.get(t.id));
      const ageDays = (now - t.createdAt.getTime()) / 86_400_000;

      if (!loggedInIds.has(t.id) && ageDays >= 1) reasons.push("nu s-a logat niciodată");
      else if (!activated && ageDays >= 3) reasons.push("s-a logat, dar n-a făcut nimic real");
      if (lastMs && now - lastMs > 14 * 86_400_000) reasons.push("inactiv de peste 2 săptămâni");
      if (t.trialEndsAt && t.trialEndsAt.getTime() > now && t.trialEndsAt.getTime() - now < 7 * 86_400_000) {
        reasons.push("perioada de probă expiră în mai puțin de 7 zile");
      }
      if (t.status === "suspended") reasons.push("workspace suspendat");

      return {
        id: t.id,
        name: t.name,
        plan: t.plan,
        contactEmail: contacts.get(t.id) ?? null,
        createdAt: t.createdAt.toISOString(),
        lastLoginAt: last ? new Date(last).toISOString() : null,
        activatedAt: t.activatedAt ? t.activatedAt.toISOString() : null,
        activated,
        reasons,
      };
    })
    .filter((t) => t.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length)
    .slice(0, 50);

  return c.json({
    windowDays: days,
    funnel,
    sources: [...bySource.values()].sort((a, b) => b.signups - a.signups),
    adoption,
    callList,
    contactsAvailable: contacts.size,
  });
});

/**
 * GET /api/platform/growth/contacts.csv — lista de contacte pentru o campanie:
 * workspace, email, plan, sursă, activat, ultima logare. Exact ce se dă unei liste de email.
 */
platformInsightsRoutes.get("/growth/contacts.csv", async (c) => {
  const onlyActive = c.req.query("filter") !== "all";
  const tenantRows = await db
    .select({
      id: tenants.id, name: tenants.name, plan: tenants.plan, status: tenants.status,
      createdAt: tenants.createdAt, activatedAt: tenants.activatedAt, signupSource: tenants.signupSource,
    })
    .from(tenants);
  const contacts = await contactEmailByTenant();
  const usage = await loadUsageByTenant();

  const lastLoginRows = await db
    .select({ tenantId: loginEvents.tenantId, last: sql<string>`max(${loginEvents.createdAt})` })
    .from(loginEvents)
    .where(eq(loginEvents.success, true))
    .groupBy(loginEvents.tenantId);
  const lastLogin = new Map(lastLoginRows.map((r) => [r.tenantId ?? "", r.last]));

  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ["Workspace", "Email", "Plan", "Stare", "Sursă", "Activat", "Creat", "Ultima logare"];
  const lines = [header.join(",")];
  for (const t of tenantRows) {
    const email = contacts.get(t.id);
    if (!email) continue;
    if (onlyActive && t.status === "suspended") continue;
    const last = lastLogin.get(t.id);
    lines.push(
      [
        t.name, email, t.plan, t.status, t.signupSource ?? "direct",
        isActivated(usage.get(t.id)) ? "da" : "nu",
        t.createdAt.toISOString().slice(0, 10),
        last ? new Date(last).toISOString().slice(0, 10) : "niciodată",
      ].map(esc).join(","),
    );
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacte-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});
