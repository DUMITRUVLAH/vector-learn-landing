/**
 * @vitest-environment node
 *
 * Auditul de securitate din 29.08.2026, testat pe RUTELE REALE + PGlite.
 *
 * Fiecare test invocă endpointul cu input realist și verifică statusul + forma răspunsului
 * (CLAUDE.md §3.5.1quater — testează ACȚIUNEA, nu butonul). Ordinea urmează gravitatea:
 * preluarea platformei, 2FA-ul ocolit, aria de vizibilitate, impersonarea.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/index";
import { tenants, users, twoFactorSettings } from "../db/schema";
import { platformAdmins, parPayers, parMembers, parProjects, parProjectMembers, parRequests, parInvites } from "../db/schema/par";

const OWNER_EMAIL = "vlah.business@gmail.com";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let clientTenantId: string;
let attackerTenantId: string;
let adminUserId: string;
let approverAId: string;
let parInProjectB: string;
let ownerUserId: string;
let impostorUserId: string;

vi.mock("../db/client", () => ({ get db() { return testDb; }, closeDb: async () => {} }));
vi.mock("../auth/password", () => ({
  hashPassword: vi.fn(async (pw: string) => `$mock$${pw}`),
  verifyPassword: vi.fn(async (pw: string, hash: string) => hash === `$mock$${pw}`),
}));
vi.mock("../lib/auth/accountEmails", () => ({
  sendPasswordResetEmail: vi.fn(async () => true),
  passwordResetUrl: () => "https://example.invalid/reset",
}));
vi.mock("../lib/par/invites", async (orig) => {
  const actual = await orig<typeof import("../lib/par/invites")>();
  return { ...actual, sendInviteEmail: vi.fn(async () => false) };
});

/** Sesiuni simulate: „admin" (client), „approverA", „impostor" (emailul proprietarului, alt tenant). */
let impersonatedSession = false;
vi.mock("../auth/session", () => ({
  SESSION_COOKIE: "vl_session",
  createSession: vi.fn().mockResolvedValue({ token: "t", expiresAt: new Date(Date.now() + 86_400_000) }),
  revokeSession: vi.fn().mockResolvedValue(undefined),
  dropAllCachedSessions: vi.fn(),
  getSessionUser: vi.fn(async (token: string) => {
    const id = token === "admin" ? adminUserId
      : token === "approverA" ? approverAId
      : token === "impostor" ? impostorUserId
      : null;
    if (!id) return null;
    const user = await testDb.query.users.findFirst({ where: eq(users.id, id) });
    if (!user) return null;
    return {
      session: { id: "s", impersonatedByUserId: impersonatedSession ? ownerUserId : null },
      user,
    };
  }),
}));

import { Hono } from "hono";
import { parInvitesRoutes } from "../routes/parInvites";
import { businessAuthRoutes } from "../routes/businessAuth";
import { authRoutes } from "../routes/auth";
import { parTimelineRoutes } from "../routes/parTimeline";
import { platformAdminRoutes } from "../routes/platformAdmin";
import { requireAuth, type AuthVariables } from "../middleware/requireAuth";
import { denyWhenImpersonating } from "../middleware/impersonationGuard";

const app = new Hono();
app.route("/api/par/invites", parInvitesRoutes);
app.route("/api/business", businessAuthRoutes);
app.route("/api/auth", authRoutes);
app.route("/api/par", parTimelineRoutes);
app.route("/api/platform", platformAdminRoutes);
// Sondă păzită exact ca deciziile financiare reale din server/app.ts.
const probe = new Hono<{ Variables: AuthVariables }>();
probe.use("*", requireAuth);
probe.use("*", denyWhenImpersonating);
probe.post("/approve", (c) => c.json({ ok: true }));
app.route("/api/probe", probe);

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

const as = (token: string, p: string, init: RequestInit = {}) =>
  app.request(p, { ...init, headers: { "content-type": "application/json", cookie: `vl_session=${token}`, ...(init.headers ?? {}) } });
const post = (body: unknown) => ({ method: "POST", body: JSON.stringify(body) });

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema }) as unknown as typeof testDb;
  await applyMigrations(pglite);

  const [platformTenant] = await testDb.insert(tenants)
    .values({ name: "Vector Platform", slug: "vector-platform", plan: "enterprise", appKind: "business" }).returning();
  const [owner] = await testDb.insert(users)
    .values({ tenantId: platformTenant.id, email: OWNER_EMAIL, passwordHash: "$mock$ownerpw", name: "Owner", role: "admin" }).returning();
  ownerUserId = owner.id;
  await testDb.insert(platformAdmins).values({ userId: ownerUserId });

  const [clientTenant] = await testDb.insert(tenants)
    .values({ name: "ONG Client", slug: "ong-client", plan: "starter", appKind: "business" }).returning();
  clientTenantId = clientTenant.id;
  const [payer] = await testDb.insert(parPayers)
    .values({ tenantId: clientTenantId, name: "ONG Client", legalName: "ONG Client" }).returning();

  const [admin] = await testDb.insert(users)
    .values({ tenantId: clientTenantId, email: "admin@ong.md", passwordHash: "$mock$adminpw", name: "Admin", role: "admin" }).returning();
  adminUserId = admin.id;

  // Aprobator invitat STRICT pe proiectul A (rol de workspace „teacher" — nu admin).
  const [approverA] = await testDb.insert(users)
    .values({ tenantId: clientTenantId, email: "aprobator.a@ong.md", passwordHash: "$mock$apw", name: "Aprobator A", role: "teacher" }).returning();
  approverAId = approverA.id;
  await testDb.insert(parMembers).values({ tenantId: clientTenantId, userId: approverAId, role: "approver" });

  const [projA] = await testDb.insert(parProjects)
    .values({ tenantId: clientTenantId, payerId: payer.id, name: "Proiect A", code: "A" }).returning();
  const [projB] = await testDb.insert(parProjects)
    .values({ tenantId: clientTenantId, payerId: payer.id, name: "Proiect B", code: "B" }).returning();
  await testDb.insert(parProjectMembers).values({ tenantId: clientTenantId, userId: approverAId, projectId: projA.id });

  const [parB] = await testDb.insert(parRequests).values({
    tenantId: clientTenantId, payerId: payer.id, projectId: projB.id, requestNo: "PAR-B-001",
    dateOfRequest: new Date(), purpose: "execute_payment", chargeTo: "program",
    requestedByUserId: adminUserId, status: "pending_approval", currency: "MDL",
    totalEstimatedCents: 500_000, payeeName: "Furnizor B", payeeIban: "MD24AG000225100013104168",
  }).returning();
  parInProjectB = parB.id;

  // „Impostorul": cont cu emailul proprietarului, creat în alt workspace.
  const [attackerTenant] = await testDb.insert(tenants)
    .values({ name: "Atacator SRL", slug: "atacator", plan: "starter", appKind: "business" }).returning();
  attackerTenantId = attackerTenant.id;
  const [impostor] = await testDb.insert(users)
    .values({ tenantId: attackerTenantId, email: OWNER_EMAIL, passwordHash: "$mock$x", name: "Impostor", role: "admin" }).returning();
  impostorUserId = impostor.id;
}, 90_000);

afterAll(async () => { await pglite.close(); });

describe("P0-1 — emailul de proprietar nu se poate revendica", () => {
  it("[blocant] invitația către emailul proprietarului e refuzată (prima verigă a lanțului)", async () => {
    const [payer] = await testDb.select().from(parPayers).where(eq(parPayers.tenantId, clientTenantId));
    const res = await as("admin", "/api/par/invites", post({
      email: OWNER_EMAIL, par_role: "par_admin", payer_ids: [payer.id],
    }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "email_reserved" });
  });

  it("[blocant] accept-invite pe un email rezervat nu creează cont", async () => {
    // Invitația e scrisă direct în DB, ca și cum ar fi fost creată înainte de reparație.
    const token = "t".repeat(48);
    const { hashInviteToken } = await import("../lib/par/invites");
    const [payer] = await testDb.select().from(parPayers).where(eq(parPayers.tenantId, clientTenantId));
    await testDb.insert(parInvites).values({
      tenantId: clientTenantId, email: OWNER_EMAIL, parRole: "par_admin",
      payerScope: JSON.stringify([payer.id]), tokenHash: hashInviteToken(token),
      invitedByUserId: adminUserId, expiresAt: new Date(Date.now() + 86_400_000),
    });
    const res = await app.request("/api/auth/accept-invite", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: "parolaMea123!", name: "Cine o fi" }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "email_reserved" });
    const created = await testDb.query.users.findMany({ where: eq(users.email, OWNER_EMAIL) });
    expect(created).toHaveLength(2); // proprietarul real + impostorul din fixture, nimic nou
  });

  it("[blocant] signup-ul business pe emailul proprietarului e refuzat", async () => {
    const res = await app.request("/api/business/auth/signup", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: OWNER_EMAIL, password: "parolaMea123!", name: "Nume Test", tenantName: "Workspace Test" }),
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "email_reserved" });
  });

  it("[blocant] un cont cu emailul proprietarului în alt workspace NU primește consola", async () => {
    // `platform_admins` are deja rândul proprietarului real → bootstrap-ul e consumat.
    const res = await as("impostor", "/api/platform/tenants");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "platform_admin_required" });
  });
});

describe("P1 — 2FA pe ruta prin care intră clienții", () => {
  it("[blocant] /api/business/auth/login cere al doilea factor când e activat", async () => {
    await testDb.insert(twoFactorSettings).values({
      userId: adminUserId, secretEncrypted: "x:y:z", recoveryCodesJson: "[]", enabledAt: new Date(),
    });
    const res = await app.request("/api/business/auth/login", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "admin@ong.md", password: "adminpw" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ requiresTwoFactor: true });
    await testDb.delete(twoFactorSettings).where(eq(twoFactorSettings.userId, adminUserId));
  });
});

describe("aria de vizibilitate (canViewPar)", () => {
  it("[blocant] un aprobator din proiectul A nu vede istoricul unei cereri din proiectul B", async () => {
    const res = await as("approverA", `/api/par/${parInProjectB}/timeline`);
    expect(res.status).toBe(404);
  });
});

describe("impersonare", () => {
  it("[blocant] deciziile financiare sunt refuzate dintr-o sesiune împrumutată", async () => {
    impersonatedSession = true;
    const res = await as("admin", "/api/probe/approve", { method: "POST", body: "{}" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: "impersonation_read_only" });
    impersonatedSession = false;
  });

  it("aceeași acțiune trece dintr-o sesiune normală", async () => {
    const res = await as("admin", "/api/probe/approve", { method: "POST", body: "{}" });
    expect(res.status).toBe(200);
  });
});
