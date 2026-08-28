/**
 * PLATFORM-403 — „intră în contul lui X" pentru superadminul platformei.
 *
 * Rute separate de `/api/platform/*` dintr-un motiv concret: STOP trebuie să funcționeze
 * CÂND EȘTI DEJA în contul clientului, adică fără drepturi de superadmin pe sesiunea curentă.
 * Dacă ar sta sub `requirePlatformAdmin` (aplicat pe tot `/api/platform`), ieșirea din
 * impersonare ar fi imposibilă și singura scăpare ar fi ștergerea manuală a cookie-ului.
 *
 * Vezi `server/lib/impersonation.ts` pentru regulile și limitele mecanismului.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { setCookie } from "hono/cookie";
import { db } from "../db/client";
import { users } from "../db/schema";
import { tenants } from "../db/schema/tenants";
import { platformAuditLog } from "../db/schema/platform";
import { SESSION_COOKIE } from "../auth/session";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { requirePlatformAdmin } from "../middleware/requirePlatformAdmin";
import { clientIp } from "../lib/loginEvents";
import {
  getImpersonationSession,
  startImpersonation,
  stopImpersonation,
} from "../lib/impersonation";

const SECURE_COOKIES = process.env.NODE_ENV === "production";

function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string, expiresAt: Date) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: SECURE_COOKIES,
    path: "/",
    expires: expiresAt,
  });
}

/** Audit best-effort — o impersonare reușită nu se anulează fiindcă scrierea de audit a picat. */
async function audit(
  c: Parameters<typeof clientIp>[0],
  entry: {
    actorUserId: string;
    actorEmail: string;
    action: "impersonate.start" | "impersonate.stop";
    targetId: string;
    targetLabel: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db.insert(platformAuditLog).values({
      actorUserId: entry.actorUserId,
      actorEmail: entry.actorEmail,
      action: entry.action,
      targetType: "user",
      targetId: entry.targetId,
      targetLabel: entry.targetLabel,
      meta: entry.meta ?? null,
      ipAddress: clientIp(c),
    });
  } catch (e) {
    console.warn("[impersonation] audit write skipped:", e instanceof Error ? e.message : e);
  }
}

export const impersonationRoutes = new Hono<{ Variables: AuthVariables }>();

impersonationRoutes.use("*", requireAuth);

/**
 * GET /api/impersonation/status — pe ce fel de sesiune sunt?
 * Îl cheamă bannerul din shell; pentru o sesiune obișnuită răspunde `{ active: false }`.
 */
impersonationRoutes.get("/status", async (c) => {
  const row = await getImpersonationSession(c.get("sessionToken"));
  if (!row) return c.json({ active: false });

  const actor = await db.query.users.findFirst({ where: eq(users.id, row.impersonatedByUserId!) });
  const target = c.get("user");
  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, target.tenantId) });

  return c.json({
    active: true,
    actor: actor ? { email: actor.email, name: actor.name } : null,
    target: { id: target.id, email: target.email, name: target.name, role: target.role },
    workspace: tenant ? { id: tenant.id, name: tenant.name, appKind: tenant.appKind } : null,
    expiresAt: row.expiresAt.toISOString(),
  });
});

const startSchema = z.object({ userId: z.string().uuid() });

/** POST /api/impersonation/start — superadmin → sesiune pe contul-țintă. */
impersonationRoutes.post("/start", requirePlatformAdmin, zValidator("json", startSchema), async (c) => {
  const actor = c.get("user");
  const { userId } = c.req.valid("json");

  const result = await startImpersonation({
    actor,
    actorSessionToken: c.get("sessionToken"),
    targetUserId: userId,
    ipAddress: clientIp(c) ?? undefined,
    userAgent: c.req.header("user-agent") ?? undefined,
  });

  if ("refused" in result) {
    const status = result.refused === "target_not_found" ? 404 : 400;
    return c.json({ error: result.refused }, status);
  }

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, result.target.tenantId) });
  setSessionCookie(c, result.token, result.expiresAt);
  await audit(c, {
    actorUserId: actor.id,
    actorEmail: actor.email,
    action: "impersonate.start",
    targetId: result.target.id,
    targetLabel: `${result.target.name || result.target.email} · ${tenant?.name ?? "workspace necunoscut"}`,
    meta: { targetEmail: result.target.email, tenantId: result.target.tenantId, expiresAt: result.expiresAt.toISOString() },
  });

  return c.json({
    ok: true,
    user: { id: result.target.id, email: result.target.email, name: result.target.name, role: result.target.role },
    workspace: tenant ? { id: tenant.id, name: tenant.name, appKind: tenant.appKind } : null,
    expiresAt: result.expiresAt.toISOString(),
    // Unde să aterizeze clientul: aplicația pe care o folosește chiar utilizatorul-țintă.
    redirect: tenant?.appKind === "business" ? "/business/dashboard" : "/app/dashboard",
  });
});

/**
 * POST /api/impersonation/stop — ieșire din contul clientului.
 * Deliberat FĂRĂ `requirePlatformAdmin`: sesiunea curentă e a clientului, nu a superadminului.
 */
impersonationRoutes.post("/stop", async (c) => {
  const token = c.get("sessionToken");
  const target = c.get("user");

  const result = await stopImpersonation(token);
  if (!result) return c.json({ error: "not_impersonating" }, 400);

  const actor = await db.query.users.findFirst({ where: eq(users.id, result.actorUserId) });
  if (result.restoredToken && result.restoredExpiresAt) {
    setSessionCookie(c, result.restoredToken, result.restoredExpiresAt);
  }

  await audit(c, {
    actorUserId: result.actorUserId,
    actorEmail: actor?.email ?? "necunoscut",
    action: "impersonate.stop",
    targetId: result.targetUserId,
    targetLabel: target.name || target.email,
    meta: { targetEmail: target.email, restored: !!result.restoredToken },
  });

  return c.json({
    ok: true,
    // Sesiunea proprie a superadminului putea expira între timp — atunci îl trimitem la login.
    restored: !!result.restoredToken,
    redirect: result.restoredToken ? "/business/platform" : "/business/login",
  });
});
