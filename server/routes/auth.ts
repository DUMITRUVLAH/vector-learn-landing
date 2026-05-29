import { Hono } from "hono";
import { setCookie, deleteCookie } from "hono/cookie";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { tenants, users } from "../db/schema";
import { hashPassword, verifyPassword } from "../auth/password";
import { createSession, revokeSession, SESSION_COOKIE } from "../auth/session";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";

const signupSchema = z.object({
  tenantName: z.string().min(2).max(200),
  email: z.string().email().max(255),
  password: z.string().min(8).max(200),
  name: z.string().min(2).max(200),
});

const loginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

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

export const authRoutes = new Hono<{ Variables: AuthVariables }>();

authRoutes.post("/signup", zValidator("json", signupSchema), async (c) => {
  const body = c.req.valid("json");
  const existingEmail = await db.query.users.findFirst({
    where: eq(users.email, body.email),
  });
  if (existingEmail) {
    return c.json({ error: "email_taken" }, 409);
  }

  let slug = slugify(body.tenantName) || `org-${Math.random().toString(36).slice(2, 8)}`;
  let attempt = 0;
  while (await db.query.tenants.findFirst({ where: eq(tenants.slug, slug) })) {
    attempt += 1;
    slug = `${slugify(body.tenantName)}-${attempt}`;
    if (attempt > 50) return c.json({ error: "slug_collision" }, 500);
  }

  const [tenant] = await db
    .insert(tenants)
    .values({ name: body.tenantName, slug, plan: "starter" })
    .returning();

  const passwordHash = await hashPassword(body.password);
  const [user] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email: body.email,
      passwordHash,
      name: body.name,
      role: "admin",
    })
    .returning();

  const { token, expiresAt } = await createSession(user.id);
  setSessionCookie(c, token, expiresAt);

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan },
  });
});

authRoutes.post("/login", zValidator("json", loginSchema), async (c) => {
  const body = c.req.valid("json");
  const user = await db.query.users.findFirst({
    where: eq(users.email, body.email),
  });
  if (!user) {
    return c.json({ error: "invalid_credentials" }, 401);
  }
  const ok = await verifyPassword(body.password, user.passwordHash);
  if (!ok) {
    return c.json({ error: "invalid_credentials" }, 401);
  }

  const tenant = await db.query.tenants.findFirst({ where: eq(tenants.id, user.tenantId) });
  if (!tenant) return c.json({ error: "tenant_not_found" }, 500);

  const { token, expiresAt } = await createSession(user.id);
  setSessionCookie(c, token, expiresAt);

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan },
  });
});

authRoutes.post("/logout", requireAuth, async (c) => {
  const token = c.get("sessionToken");
  await revokeSession(token);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

authRoutes.get("/me", requireAuth, async (c) => {
  const user = c.get("user");
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, user.tenantId),
  });
  if (!tenant) return c.json({ error: "tenant_not_found" }, 500);

  return c.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, plan: tenant.plan },
  });
});

// Helper to set a demo password for seeded admin (one-time helper for dev)
authRoutes.post("/__dev__/setup-demo-password", async (c) => {
  if (process.env.NODE_ENV === "production") {
    return c.json({ error: "not_available" }, 403);
  }
  const passwordHash = await hashPassword("demo123456");
  const updated = await db
    .update(users)
    .set({ passwordHash })
    .where(and(eq(users.email, "admin@demo.vectorlearn.io"), eq(users.passwordHash, "$placeholder$")))
    .returning({ id: users.id });
  return c.json({ updated: updated.length, password: "demo123456" });
});
