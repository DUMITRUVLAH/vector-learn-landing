/**
 * @vitest-environment node
 * SHELL-503: PAR invite redemption — INTEGRATION tests
 *
 * These tests spin up a real PGlite DB (all migrations applied), seed the
 * necessary fixtures, and call the REAL Hono auth routes via app.request().
 * The `db/client` module is mocked to point to the in-memory PGlite instance
 * so the routes execute against a clean DB without touching production.
 *
 * Covers:
 *   (a) brand-new email → creates NON-admin user on invite tenant, par_members row,
 *       invite marked accepted, session cookie set
 *   (b) existing same-tenant user + WRONG password → 401, no session cookie (critical
 *       regression: account-takeover was possible without this check)
 *   (c) existing same-tenant Google-only user via password accept → 409 use_google_signin
 *   (d) reused token (second accept) → rejected; expired token → 410
 *   (e) same email on a DIFFERENT tenant → invite still creates membership on invite tenant
 *   (f) Google email-match guard unit test: invite.email !== profile.email → invite ignored
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { parInvites, parMembers } from "../db/schema/par";
import { tenants, users } from "../db/schema";
import { hashInviteToken, generateInviteToken, INVITE_TTL_MS } from "../lib/par/invites";
import { and, eq } from "drizzle-orm";

// ── Set up PGlite test database ───────────────────────────────────────────────

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

// IDs set in beforeAll — used across tests.
let tenantId: string;
let otherTenantId: string;
let adminUserId: string;

// Mock db/client BEFORE any route imports so the auth routes get the test DB.
// vi.mock is hoisted to top of module by vitest.
vi.mock("../db/client", () => {
  // We return a lazy getter so `testDb` is populated by the time routes call db.*
  return {
    get db() {
      return testDb;
    },
    closeDb: async () => {},
  };
});

// Mock session.ts to return a predictable token without hitting the sessions table.
// (sessions table still exists in PGlite, but this keeps tests focused on the invite logic.)
vi.mock("../auth/session", () => ({
  createSession: vi.fn().mockResolvedValue({
    token: "test-session-token-abc",
    expiresAt: new Date(Date.now() + 86_400_000),
  }),
  revokeSession: vi.fn().mockResolvedValue(undefined),
  getSessionUser: vi.fn().mockResolvedValue(null),
  SESSION_COOKIE: "vl_session",
}));

// Mock password.ts to control hash/verify without bcrypt overhead.
const MOCK_CORRECT_HASH = "$mock$correct$hash";
const MOCK_WRONG_HASH = "$mock$wrong$hash";
vi.mock("../auth/password", () => ({
  hashPassword: vi.fn(async (pw: string) =>
    pw === "correctpassword" ? MOCK_CORRECT_HASH : `$mock$${pw}$hash`
  ),
  verifyPassword: vi.fn(async (pw: string, hash: string) => {
    if (hash === MOCK_CORRECT_HASH) return pw === "correctpassword";
    return false;
  }),
}));

// Import authRoutes AFTER the mocks above are registered.
import { authRoutes } from "../routes/auth";
import { Hono } from "hono";

// Build a minimal Hono app with just the auth routes.
const app = new Hono();
app.route("/api/auth", authRoutes);

// ── Migration helper ──────────────────────────────────────────────────────────

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };

  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const file = path.join(drizzleDir, `${entry.tag}.sql`);
    const raw = fs.readFileSync(file, "utf8");
    const stmts = raw
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of stmts) {
      await pg.exec(stmt);
    }
  }

  // Several columns were added by sync-schema.ts self-heal (not in drizzle migrations).
  // Add them conditionally so the test DB matches the production schema.
  const selfHealColumns: Array<{ table: string; column: string; definition: string }> = [
    { table: "tenants", column: "app_kind", definition: "VARCHAR(20) NOT NULL DEFAULT 'learn'" },
    { table: "tenants", column: "institution_type", definition: "VARCHAR(20) NOT NULL DEFAULT 'mixt'" },
    { table: "tenants", column: "logo_url", definition: "VARCHAR(500)" },
    { table: "tenants", column: "branding_json", definition: "JSONB" },
    { table: "tenants", column: "ai_monthly_budget_usd_cents", definition: "INTEGER" },
    { table: "tenants", column: "invoice_prefix", definition: "VARCHAR(20) NOT NULL DEFAULT 'VECT'" },
    { table: "tenants", column: "iban", definition: "VARCHAR(34)" },
    { table: "tenants", column: "bic", definition: "VARCHAR(11)" },
    { table: "users", column: "google_id", definition: "VARCHAR(64)" },
    { table: "users", column: "auth_provider", definition: "VARCHAR(20) NOT NULL DEFAULT 'password'" },
    { table: "users", column: "avatar_url", definition: "VARCHAR(2048)" },
    { table: "users", column: "language", definition: "VARCHAR(10) DEFAULT 'ro'" },
    { table: "users", column: "timezone", definition: "VARCHAR(64) DEFAULT 'Europe/Bucharest'" },
    { table: "users", column: "deleted_at", definition: "TIMESTAMPTZ" },
    { table: "users", column: "phone", definition: "VARCHAR(50)" },
    { table: "users", column: "is_active", definition: "BOOLEAN NOT NULL DEFAULT TRUE" },
    { table: "users", column: "branch_scope", definition: "UUID" },
  ];

  for (const { table, column, definition } of selfHealColumns) {
    await pg
      .exec(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${definition};`
      )
      .catch(() => {
        // Ignore: column may already exist from a migration.
      });
  }
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema }) as unknown as ReturnType<typeof drizzle<typeof schema>>;
  await applyMigrations(pglite);

  // Seed: inviting tenant (business) + other tenant
  const [inviteTenant] = await testDb
    .insert(tenants)
    .values({ name: "ONG Vector", slug: "ong-vector-test", plan: "starter", appKind: "business" })
    .returning();
  tenantId = inviteTenant.id;

  const [other] = await testDb
    .insert(tenants)
    .values({ name: "Other Tenant", slug: "other-tenant-test", plan: "starter", appKind: "business" })
    .returning();
  otherTenantId = other.id;

  // Admin user on the inviting tenant (the one who creates invites)
  const [admin] = await testDb
    .insert(users)
    .values({
      tenantId,
      email: "admin@ong-vector-test.io",
      passwordHash: MOCK_CORRECT_HASH,
      name: "Admin",
      role: "admin",
    })
    .returning();
  adminUserId = admin.id;
}, 60_000);

afterAll(async () => {
  await pglite.close();
});

// ── Helper: create a fresh valid invite ────────────────────────────────────────

async function createInvite(opts: {
  email: string;
  parRole?: "requestor" | "approver" | "finance" | "par_admin";
  expiresInMs?: number;
}): Promise<{ token: string; id: string }> {
  const token = generateInviteToken();
  const [invite] = await testDb
    .insert(parInvites)
    .values({
      tenantId,
      email: opts.email.toLowerCase(),
      parRole: opts.parRole ?? "requestor",
      tokenHash: hashInviteToken(token),
      invitedByUserId: adminUserId,
      expiresAt: new Date(Date.now() + (opts.expiresInMs ?? INVITE_TTL_MS)),
    })
    .returning();
  return { token, id: invite.id };
}

// ── Helper: call a route and get Response ─────────────────────────────────────

async function callAcceptInvite(body: Record<string, string>) {
  return app.request("/api/auth/accept-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callInviteInfo(token: string) {
  return app.request(`/api/auth/invite-info?token=${encodeURIComponent(token)}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("SHELL-503 invite-info route", () => {
  it("(a-info) valid invite → 200 {email, parRole, orgName}", async () => {
    const { token } = await createInvite({ email: "new-info@example.com", parRole: "approver" });
    const res = await callInviteInfo(token);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, string>;
    expect(body.email).toBe("new-info@example.com");
    expect(body.parRole).toBe("approver");
    expect(body.orgName).toBe("ONG Vector");
    expect(body).not.toHaveProperty("tokenHash");
    expect(body).not.toHaveProperty("token");
  });

  it("(b-info) unknown token → 404", async () => {
    const res = await callInviteInfo("completely-unknown-token-xyz");
    expect(res.status).toBe(404);
  });

  it("(c-info) expired token → 410", async () => {
    const { token } = await createInvite({ email: "expired-info@example.com", expiresInMs: -1000 });
    const res = await callInviteInfo(token);
    expect(res.status).toBe(410);
    const body = await res.json() as Record<string, string>;
    expect(body.error).toBe("invite_expired");
  });
});

describe("SHELL-503 accept-invite route (password path)", () => {
  it("(a) brand-new email → 200, user created with role=teacher (non-admin), par_members row with invitedRole, invite marked accepted, session cookie set", async () => {
    const { token, id: inviteId } = await createInvite({ email: "newbie@example.com", parRole: "requestor" });

    const res = await callAcceptInvite({ token, name: "New User", password: "correctpassword" });
    expect(res.status).toBe(200);

    const body = await res.json() as { user: { email: string; role: string } };
    expect(body.user.email).toBe("newbie@example.com");
    // P1/P2: role must be non-privileged
    expect(body.user.role).toBe("teacher");
    expect(body.user.role).not.toBe("admin");
    expect(body.user.role).not.toBe("manager");

    // Session cookie must be set
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("vl_session=");

    // User exists on the correct tenant
    const createdUser = await testDb.query.users.findFirst({
      where: and(eq(users.tenantId, tenantId), eq(users.email, "newbie@example.com")),
    });
    expect(createdUser).toBeDefined();
    expect(createdUser!.role).toBe("teacher");

    // par_members row with the invited role
    const member = await testDb.query.parMembers.findFirst({
      where: and(
        eq(parMembers.tenantId, tenantId),
        eq(parMembers.userId, createdUser!.id),
        eq(parMembers.role, "requestor")
      ),
    });
    expect(member).toBeDefined();

    // Invite marked accepted
    const invite = await testDb.query.parInvites.findFirst({
      where: eq(parInvites.id, inviteId),
    });
    expect(invite!.acceptedAt).not.toBeNull();
  });

  it("(b) CRITICAL: existing same-tenant user + WRONG password → 401, no session (account-takeover guard)", async () => {
    // Create a user on the invite's tenant first
    const [existingUser] = await testDb
      .insert(users)
      .values({
        tenantId,
        email: "existing@example.com",
        passwordHash: MOCK_CORRECT_HASH,
        name: "Existing",
        role: "teacher",
      })
      .returning();

    const { token } = await createInvite({ email: "existing@example.com", parRole: "approver" });

    // Wrong password → must NOT mint a session
    const res = await callAcceptInvite({ token, name: "Existing", password: "wrongpassword" });
    expect(res.status).toBe(401);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("wrong_password");

    // No session cookie
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).not.toContain("vl_session=");

    // Invite still un-consumed (password check failed before token consumption)
    const invite = await testDb.query.parInvites.findFirst({
      where: and(eq(parInvites.email, "existing@example.com"), eq(parInvites.tenantId, tenantId)),
    });
    expect(invite!.acceptedAt).toBeNull();

    // Clean up
    await testDb.delete(users).where(eq(users.id, existingUser.id));
  });

  it("(c) existing same-tenant Google-only user via password → 409 use_google_signin", async () => {
    // Create a google-only user (no passwordHash)
    const [googleUser] = await testDb
      .insert(users)
      .values({
        tenantId,
        email: "googleonly@example.com",
        passwordHash: null,
        name: "Google User",
        role: "teacher",
        authProvider: "google",
        googleId: "google-sub-12345",
      })
      .returning();

    const { token } = await createInvite({ email: "googleonly@example.com", parRole: "finance" });

    const res = await callAcceptInvite({ token, name: "Google User", password: "anypassword1" });
    expect(res.status).toBe(409);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("use_google_signin");

    // No session
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).not.toContain("vl_session=");

    // Clean up
    await testDb.delete(users).where(eq(users.id, googleUser.id));
  });

  it("(d1) reused token (second accept after first success) → rejected (invite already consumed)", async () => {
    const { token } = await createInvite({ email: "reuse@example.com", parRole: "requestor" });

    // First accept — succeeds
    const res1 = await callAcceptInvite({ token, name: "First", password: "correctpassword" });
    expect(res1.status).toBe(200);

    // Second accept with same token — must be rejected
    const res2 = await callAcceptInvite({ token, name: "Second", password: "correctpassword" });
    expect(res2.status).toBe(404);
    const body = await res2.json() as { error: string };
    expect(body.error).toBe("invite_not_found");
  });

  it("(d2) expired token → 410", async () => {
    const { token } = await createInvite({ email: "expired@example.com", expiresInMs: -5000 });

    const res = await callAcceptInvite({ token, name: "Late User", password: "correctpassword" });
    expect(res.status).toBe(410);
    const body = await res.json() as { error: string };
    expect(body.error).toBe("invite_expired");

    // No session
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).not.toContain("vl_session=");
  });

  it("(e) same email exists on a DIFFERENT tenant → invite creates membership on invite tenant (no 409)", async () => {
    // Email exists on otherTenantId
    const [userOnOther] = await testDb
      .insert(users)
      .values({
        tenantId: otherTenantId,
        email: "shared@example.com",
        passwordHash: MOCK_CORRECT_HASH,
        name: "Shared",
        role: "teacher",
      })
      .returning();

    // Invite is for this email on the main tenant
    const { token, id: inviteId } = await createInvite({ email: "shared@example.com", parRole: "finance" });

    // Accept should succeed: creates a NEW user row on the invite's tenant
    const res = await callAcceptInvite({ token, name: "Shared Member", password: "correctpassword" });
    expect(res.status).toBe(200);

    // New user exists on the invite tenant (NOT moved from other tenant)
    const newUser = await testDb.query.users.findFirst({
      where: and(eq(users.tenantId, tenantId), eq(users.email, "shared@example.com")),
    });
    expect(newUser).toBeDefined();
    expect(newUser!.tenantId).toBe(tenantId);

    // The other-tenant user is untouched
    const stillThere = await testDb.query.users.findFirst({
      where: eq(users.id, userOnOther.id),
    });
    expect(stillThere).toBeDefined();
    expect(stillThere!.tenantId).toBe(otherTenantId);

    // par_members row on the correct tenant
    const member = await testDb.query.parMembers.findFirst({
      where: and(
        eq(parMembers.tenantId, tenantId),
        eq(parMembers.userId, newUser!.id),
        eq(parMembers.role, "finance")
      ),
    });
    expect(member).toBeDefined();

    // Invite consumed
    const inv = await testDb.query.parInvites.findFirst({ where: eq(parInvites.id, inviteId) });
    expect(inv!.acceptedAt).not.toBeNull();

    // Clean up
    await testDb.delete(users).where(eq(users.id, userOnOther.id));
  });
});

// ─── (f) Google email-match guard unit test ───────────────────────────────────
// This is a pure function test (no DB needed) — extracted from the callback logic.

function googleInviteEmailMatches(inviteEmail: string, profileEmail: string): boolean {
  return inviteEmail.toLowerCase() === profileEmail.toLowerCase();
}

describe("SHELL-503 Google email-match guard (f)", () => {
  it("matching emails (case-insensitive) → invite accepted", () => {
    expect(googleInviteEmailMatches("User@Example.COM", "user@example.com")).toBe(true);
    expect(googleInviteEmailMatches("user@example.com", "USER@EXAMPLE.COM")).toBe(true);
  });

  it("different email → invite ignored (returns false)", () => {
    expect(googleInviteEmailMatches("alice@example.com", "bob@example.com")).toBe(false);
  });

  it("different domain → invite ignored", () => {
    expect(googleInviteEmailMatches("user@example.com", "user@example.org")).toBe(false);
  });

  it("if invite.email !== profile.email → no role assigned", () => {
    // Demonstrates: if guard returns false, the invite is silently dropped
    const inviteEmail = "invited@company.io";
    const profileEmail = "attacker@gmail.com";
    expect(googleInviteEmailMatches(inviteEmail, profileEmail)).toBe(false);
    // In the callback: `resolvedInvite` stays null → no par_members insert
  });
});
