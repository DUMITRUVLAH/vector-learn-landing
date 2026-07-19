/**
 * @vitest-environment node
 * Business auth lifecycle — INTEGRATION tests against the REAL Hono routes + a PGlite DB.
 * Covers the endpoints added for the invitation/auth review:
 *   - POST /api/business/auth/signup        (self-serve business workspace)
 *   - POST /api/auth/forgot-password        (real reset-token issuance)
 *   - POST /api/auth/reset-password         (sets a new password from a token)
 *   - GET  /api/auth/google/pending         (surfaces an email-matched pending invite)
 *   - POST /api/auth/google/accept-matched-invite (one-click join, no token pasted)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema/index";
import { tenants, users, passwordResetTokens, finMembers } from "../db/schema";
import { parInvites, parMembers, parPayers } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let adminUserId: string;

vi.mock("../db/client", () => ({ get db() { return testDb; }, closeDb: async () => {} }));
vi.mock("../auth/session", () => ({
  createSession: vi.fn().mockResolvedValue({ token: "test-session-token", expiresAt: new Date(Date.now() + 86_400_000) }),
  revokeSession: vi.fn().mockResolvedValue(undefined),
  getSessionUser: vi.fn().mockResolvedValue(null),
  SESSION_COOKIE: "vl_session",
}));
vi.mock("../auth/password", () => ({
  hashPassword: vi.fn(async (pw: string) => `$mock$${pw}`),
  verifyPassword: vi.fn(async (pw: string, hash: string) => hash === `$mock$${pw}`),
}));

import { authRoutes } from "../routes/auth";
import { businessAuthRoutes } from "../routes/businessAuth";
import { encrypt } from "../lib/crypto";
import { Hono } from "hono";

const app = new Hono();
app.route("/api/auth", authRoutes);
app.route("/api/business", businessAuthRoutes);

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
  const cols: Array<[string, string, string]> = [
    ["tenants", "app_kind", "VARCHAR(20) NOT NULL DEFAULT 'learn'"],
    ["tenants", "institution_type", "VARCHAR(20) NOT NULL DEFAULT 'mixt'"],
    ["users", "google_id", "VARCHAR(64)"],
    ["users", "auth_provider", "VARCHAR(20) NOT NULL DEFAULT 'password'"],
    ["users", "avatar_url", "VARCHAR(2048)"],
    ["users", "is_active", "BOOLEAN NOT NULL DEFAULT TRUE"],
  ];
  for (const [t, col, def] of cols) {
    await pg.exec(`ALTER TABLE "${t}" ADD COLUMN IF NOT EXISTS "${col}" ${def};`).catch(() => {});
  }
}

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema }) as unknown as typeof testDb;
  await applyMigrations(pglite);
  const [t] = await testDb.insert(tenants).values({ name: "ONG Vector", slug: "ong-vector-life", plan: "starter", appKind: "business" }).returning();
  tenantId = t.id;
  const [admin] = await testDb.insert(users).values({ tenantId, email: "admin@ong.io", passwordHash: "$mock$adminpw", name: "Admin", role: "admin" }).returning();
  adminUserId = admin.id;
}, 60_000);

afterAll(async () => { await pglite.close(); });

const postJson = (p: string, body: unknown, headers: Record<string, string> = {}) =>
  app.request(p, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("business self-signup", () => {
  it("creates a business tenant + admin and returns 200", async () => {
    const res = await postJson("/api/business/auth/signup", { tenantName: "Acme Org", name: "Ana Pop", email: "ana@acme.io", password: "password123" });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tenant.appKind).toBe("business");
    const created = await testDb.query.tenants.findFirst({ where: eq(tenants.id, json.tenant.id) });
    expect(created?.appKind).toBe("business");
    const u = await testDb.query.users.findFirst({ where: eq(users.email, "ana@acme.io") });
    expect(u?.role).toBe("admin");
    expect(u?.tenantId).toBe(json.tenant.id);
    // Finding #1: the new admin must be bootstrapped for FinDesk (fin_members owner) + PAR (payer),
    // else FinDesk 403s ("Acces restricționat").
    const fm = await testDb.query.finMembers.findFirst({ where: and(eq(finMembers.tenantId, json.tenant.id), eq(finMembers.userId, u!.id)) });
    expect(fm?.role).toBe("owner");
    const payer = await testDb.query.parPayers.findFirst({ where: eq(parPayers.tenantId, json.tenant.id) });
    expect(payer).toBeTruthy();
  });

  it("rejects a duplicate email with 409", async () => {
    const res = await postJson("/api/business/auth/signup", { tenantName: "Dup Org", name: "Dup", email: "ana@acme.io", password: "password123" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("email_taken");
  });

  it("rejects a case-different duplicate email — one email = one workspace (Finding #3)", async () => {
    const res = await postJson("/api/business/auth/signup", { tenantName: "Case Org", name: "Case", email: "ANA@Acme.io", password: "password123" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("email_taken");
  });
});

describe("forgot + reset password", () => {
  it("forgot-password issues a reset token for an existing email (200)", async () => {
    const res = await postJson("/api/auth/forgot-password", { email: "admin@ong.io" });
    expect(res.status).toBe(200);
    const row = await testDb.query.passwordResetTokens.findFirst({ where: eq(passwordResetTokens.userId, adminUserId) });
    expect(row).toBeTruthy();
  });

  it("forgot-password returns 200 for an unknown email (anti-enumeration)", async () => {
    const res = await postJson("/api/auth/forgot-password", { email: "nobody@nowhere.io" });
    expect(res.status).toBe(200);
  });

  it("reset-password sets a new password from a valid token", async () => {
    const raw = "reset-raw-token-abc123";
    const tokenHash = createHash("sha256").update(raw).digest("hex");
    await testDb.insert(passwordResetTokens).values({ userId: adminUserId, tokenHash, expiresAt: new Date(Date.now() + 3_600_000) });
    const res = await postJson("/api/auth/reset-password", { token: raw, newPassword: "brandnewpass9" });
    expect(res.status).toBe(200);
    const u = await testDb.query.users.findFirst({ where: eq(users.id, adminUserId) });
    expect(u?.passwordHash).toBe("$mock$brandnewpass9");
  });

  it("reset-password rejects an invalid token with 400", async () => {
    const res = await postJson("/api/auth/reset-password", { token: "not-a-real-token", newPassword: "whatever12" });
    expect(res.status).toBe(400);
  });

  it("reset-password rejects a token for a soft-deleted account (Finding #6)", async () => {
    const [victim] = await testDb.insert(users).values({ tenantId, email: "gone@ong.io", passwordHash: "$mock$x", name: "Gone", role: "teacher", deletedAt: new Date() } as never).returning();
    const raw = "reset-for-deleted-user";
    await testDb.insert(passwordResetTokens).values({ userId: victim.id, tokenHash: createHash("sha256").update(raw).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) });
    const res = await postJson("/api/auth/reset-password", { token: raw, newPassword: "shouldnotwork9" });
    expect(res.status).toBe(400);
  });
});

describe("Google email-matched invite (one-click join)", () => {
  const inviteEmail = "invitee@matched.io";
  const pendingCookie = () => {
    const identity = { sub: "google-sub-xyz", email: inviteEmail, name: "Invitee", picture: null };
    return `vl_g_pending=${encrypt(JSON.stringify(identity))}`;
  };

  beforeAll(async () => {
    await testDb.insert(parInvites).values({
      tenantId,
      email: inviteEmail,
      parRole: "approver",
      payerScope: JSON.stringify([]),
      tokenHash: createHash("sha256").update("dummy-invite-token").digest("hex"),
      invitedByUserId: adminUserId,
      expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000),
    } as never);
  });

  it("google/pending surfaces the matched invite (org + role, no token)", async () => {
    const res = await app.request("/api/auth/google/pending", { headers: { Cookie: pendingCookie() } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.matchedInvite).toMatchObject({ orgName: "ONG Vector", role: "approver" });
    expect(json.matchedInvite.token).toBeUndefined();
  });

  it("accept-matched-invite joins the user with the invited role (200)", async () => {
    const res = await postJson("/api/auth/google/accept-matched-invite", {}, { Cookie: pendingCookie() });
    expect(res.status).toBe(200);
    expect((await res.json()).redirect).toContain("/business/par");
    const joined = await testDb.query.users.findFirst({ where: and(eq(users.tenantId, tenantId), eq(users.email, inviteEmail)) });
    expect(joined).toBeTruthy();
    const member = await testDb.query.parMembers.findFirst({ where: and(eq(parMembers.userId, joined!.id), eq(parMembers.role, "approver")) });
    expect(member).toBeTruthy();
    const invite = await testDb.query.parInvites.findFirst({ where: eq(parInvites.email, inviteEmail) });
    expect(invite?.acceptedAt).not.toBeNull();
  });

  it("accept-matched-invite without a pending cookie → 401", async () => {
    const res = await postJson("/api/auth/google/accept-matched-invite", {});
    expect(res.status).toBe(401);
  });
});
