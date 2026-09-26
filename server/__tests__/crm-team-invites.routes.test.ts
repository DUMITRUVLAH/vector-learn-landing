/**
 * @vitest-environment node
 * CRM — ECHIPA: invitații, rol, scoatere din CRM, dezactivare — INTEGRATION.
 *
 * Testează ACȚIUNEA, nu butonul (CLAUDE.md §3.5.1quater): administratorul invită prin rută, omul
 * acceptă prin ruta reală de acceptare (aceeași ca la PAR), iar accesul se verifică pe o rută CRM
 * reală, prin poarta montată ca în app.ts. „Scos din CRM" trebuie să însemne 403 pe server, nu
 * doar un meniu ascuns.
 *
 * Și o regresie pentru refactorizare: invitația PAR, acum acordată prin `grantInviteAccess`, dă
 * în continuare rândul `par_members`.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomBytes } from "node:crypto";
import * as schema from "../db/schema/index";
import { tenants, users, sessions } from "../db/schema";
import { parInvites, parMembers } from "../db/schema/par";
import { generateInviteToken, hashInviteToken, INVITE_TTL_MS } from "../lib/par/invites";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

// Sesiuni în memorie: token → userId. Utilizatorul se citește PROASPĂT din bază la fiecare cerere,
// deci o schimbare de rol sau o dezactivare se vede imediat — exact ca în producție.
const liveSessions = new Map<string, string>();
const dropAllCachedSessions = vi.hoisted(() => vi.fn());
vi.mock("../auth/session", () => ({
  SESSION_COOKIE: "vl_session",
  dropAllCachedSessions,
  dropCachedSession: vi.fn(),
  createSession: vi.fn(async (userId: string) => {
    const token = randomBytes(16).toString("hex");
    liveSessions.set(token, userId);
    return { token, expiresAt: new Date(Date.now() + 86_400_000) };
  }),
  revokeSession: vi.fn(async () => {}),
  getSessionUser: vi.fn(async (token: string) => {
    const userId = liveSessions.get(token);
    if (!userId) return null;
    const user = await testDb.query.users.findFirst({ where: eq(users.id, userId) });
    return user ? { user, session: { impersonatedByUserId: null } } : null;
  }),
}));

vi.mock("../auth/password", () => ({
  hashPassword: vi.fn(async (pw: string) => `$mock$${pw}`),
  verifyPassword: vi.fn(async (pw: string, hash: string) => hash === `$mock$${pw}`),
}));

import { Hono } from "hono";
import { authRoutes } from "../routes/auth";
import { crmTeamRoutes } from "../routes/crmTeam";
import { crmPermissionsRoutes } from "../routes/crmPermissions";
import { parInvitesRoutes } from "../routes/parInvites";
import { teamRoutes } from "../routes/team";
import { myModulesRoutes } from "../routes/myModules";
import { requireCrmAccess } from "../middleware/requireCrmAccess";

// Aceeași ordine ca în app.ts: poarta pe /api/crm/* înaintea routerelor CRM.
const app = new Hono();
app.route("/api/auth", authRoutes);
app.use("/api/crm/*", requireCrmAccess);
app.route("/api/crm/team", crmTeamRoutes);
app.route("/api/crm/permissions", crmPermissionsRoutes);
app.route("/api/par/invites", parInvitesRoutes);
app.route("/api/team", teamRoutes);
app.route("/api/modules", myModulesRoutes);

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
  // Coloane pe care prod le are din self-heal (sync-schema), nu din migrări.
  for (const [table, column, def] of [
    ["tenants", "app_kind", "VARCHAR(20) NOT NULL DEFAULT 'learn'"],
    ["users", "google_id", "VARCHAR(64)"],
    ["users", "auth_provider", "VARCHAR(20) NOT NULL DEFAULT 'password'"],
    ["users", "avatar_url", "VARCHAR(2048)"],
    ["users", "is_active", "BOOLEAN NOT NULL DEFAULT TRUE"],
  ]) {
    await pg.exec(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column}" ${def};`).catch(() => {});
  }
}

let tenantId: string;
let adminId: string;
let adminCookie: string;

async function loginAs(userId: string): Promise<string> {
  const token = randomBytes(16).toString("hex");
  liveSessions.set(token, userId);
  return `vl_session=${token}`;
}

async function call(method: string, url: string, cookie: string, body?: unknown) {
  const res = await app.request(url, {
    method,
    headers: { cookie, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* corp gol */
  }
  return { status: res.status, json, headers: res.headers };
}

function tokenFromUrl(url: unknown): string {
  const m = String(url).match(/token=([^&\s]+)/);
  if (!m) throw new Error(`fără token în ${String(url)}`);
  return m[1];
}

async function mkUser(email: string, role: "admin" | "manager" | "teacher") {
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email, passwordHash: `$mock$parola123`, name: email.split("@")[0], role })
    .returning();
  return u;
}

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema }) as unknown as ReturnType<typeof drizzle<typeof schema>>;
  await applyMigrations(pglite);
  const [t] = await testDb
    .insert(tenants)
    .values({ name: "Ecosolar", slug: "eco-team", plan: "starter", appKind: "business" })
    .returning();
  tenantId = t.id;
  const admin = await mkUser("admin@eco-team.io", "admin");
  adminId = admin.id;
  adminCookie = await loginAs(adminId);
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Invitația CRM, cap-coadă", () => {
  it("[blocant] adminul invită → omul acceptă cu parolă → primește rolul ales și intră direct în CRM", async () => {
    const inv = await call("POST", "/api/crm/team/invites", adminCookie, { email: "Ion@Eco-Team.io", role: "manager" });
    expect(inv.status).toBe(201);
    expect(inv.json.role).toBe("manager");
    expect(String(inv.json.inviteUrl)).toContain("/#/business/invite?token=");

    // Rândul e o invitație CRM, fără rol PAR — și nu apare în lista de invitații PAR.
    const [row] = await testDb.select().from(parInvites).where(eq(parInvites.email, "ion@eco-team.io"));
    expect(row.module).toBe("crm");
    expect(row.parRole).toBeNull();
    expect(row.workspaceRole).toBe("manager");
    const parList = await call("GET", "/api/par/invites", adminCookie);
    expect(parList.status).toBe(200);
    expect((parList.json.invites as { email: string }[]).map((i) => i.email)).not.toContain("ion@eco-team.io");

    // Lista echipei o arată în așteptare.
    const team = await call("GET", "/api/crm/team", adminCookie);
    expect(team.status).toBe(200);
    expect((team.json.invites as { email: string }[]).map((i) => i.email)).toContain("ion@eco-team.io");

    const token = tokenFromUrl(inv.json.inviteUrl);
    const info = await call("GET", `/api/auth/invite-info?token=${token}`, "");
    expect(info.status).toBe(200);
    expect(info.json.module).toBe("crm");
    expect(info.json.workspaceRole).toBe("manager");

    const accepted = await call("POST", "/api/auth/accept-invite", "", { token, name: "Ion Popescu", password: "parola123" });
    expect(accepted.status).toBe(200);
    expect(accepted.json.redirect).toBe("/business/crm");

    const ion = await testDb.query.users.findFirst({ where: and(eq(users.tenantId, tenantId), eq(users.email, "ion@eco-team.io")) });
    expect(ion?.role).toBe("manager");
    // O invitație CRM nu dă rol PAR.
    const par = await testDb.select().from(parMembers).where(eq(parMembers.userId, ion!.id));
    expect(par).toHaveLength(0);

    // Sesiunea minată la acceptare trece de poarta CRM.
    const cookie = accepted.headers.get("set-cookie")!.split(";")[0];
    const perms = await call("GET", "/api/crm/permissions", cookie);
    expect(perms.status).toBe(200);
    expect(perms.json.permissions).toContain("crm.access");
  });

  it("[blocant] cine are deja CRM nu se re-invită (409); ne-adminul nu invită (403)", async () => {
    const maria = await mkUser("maria@eco-team.io", "teacher");
    const dup = await call("POST", "/api/crm/team/invites", adminCookie, { email: "maria@eco-team.io", role: "teacher" });
    expect(dup.status).toBe(409);
    expect(dup.json.error).toBe("already_member");

    const byAgent = await call("POST", "/api/crm/team/invites", await loginAs(maria.id), { email: "x@eco-team.io", role: "admin" });
    expect(byAgent.status).toBe(403);
  });

  it("[normal] o re-invitație înlocuiește linkul vechi; anularea îl scoate din listă", async () => {
    const first = await call("POST", "/api/crm/team/invites", adminCookie, { email: "ana@eco-team.io", role: "teacher" });
    const second = await call("POST", "/api/crm/team/invites", adminCookie, { email: "ana@eco-team.io", role: "manager" });
    expect(second.status).toBe(201);
    const oldInfo = await call("GET", `/api/auth/invite-info?token=${tokenFromUrl(first.json.inviteUrl)}`, "");
    expect(oldInfo.status).toBe(404);

    const del = await call("DELETE", `/api/crm/team/invites/${second.json.id}`, adminCookie);
    expect(del.status).toBe(200);
    const team = await call("GET", "/api/crm/team", adminCookie);
    expect((team.json.invites as { email: string }[]).map((i) => i.email)).not.toContain("ana@eco-team.io");
  });
});

describe("Scos din CRM — poarta e pe server", () => {
  it("[blocant] retragerea dă 403 pe orice rută CRM, ascunde modulul și scoate omul din lista de responsabili; readucerea le întoarce", async () => {
    const vlad = await mkUser("vlad@eco-team.io", "teacher");
    const vladCookie = await loginAs(vlad.id);
    expect((await call("GET", "/api/crm/permissions", vladCookie)).status).toBe(200);

    const revoke = await call("PUT", `/api/crm/team/members/${vlad.id}/access`, adminCookie, { crmAccess: false });
    expect(revoke.status).toBe(200);

    const blocked = await call("GET", "/api/crm/permissions", vladCookie);
    expect(blocked.status).toBe(403);
    expect(blocked.json.error).toBe("crm_access_revoked");
    const modules = await call("GET", "/api/modules", vladCookie);
    expect(modules.json.enabled).not.toContain("crm");
    const picker = await call("GET", "/api/team/members", adminCookie);
    expect((picker.json as unknown as { id: string }[]).map((m) => m.id)).not.toContain(vlad.id);

    const team = await call("GET", "/api/crm/team", adminCookie);
    const row = (team.json.members as { id: string; crmAccess: boolean }[]).find((m) => m.id === vlad.id);
    expect(row?.crmAccess).toBe(false);

    const restore = await call("PUT", `/api/crm/team/members/${vlad.id}/access`, adminCookie, { crmAccess: true });
    expect(restore.status).toBe(200);
    expect((await call("GET", "/api/crm/permissions", vladCookie)).status).toBe(200);
  });

  it("[blocant] un om scos din CRM se poate invita înapoi, iar acceptarea îi redă accesul", async () => {
    const dan = await mkUser("dan@eco-team.io", "teacher");
    await call("PUT", `/api/crm/team/members/${dan.id}/access`, adminCookie, { crmAccess: false });
    const inv = await call("POST", "/api/crm/team/invites", adminCookie, { email: "dan@eco-team.io", role: "teacher" });
    expect(inv.status).toBe(201);
    const acc = await call("POST", "/api/auth/accept-invite", "", {
      token: tokenFromUrl(inv.json.inviteUrl),
      name: "Dan",
      password: "parola123",
    });
    expect(acc.status).toBe(200);
    expect((await call("GET", "/api/crm/permissions", await loginAs(dan.id))).status).toBe(200);
  });

  it("[normal] adminul nu poate fi scos din CRM (are mereu acces) și nimeni nu se poate scoate singur", async () => {
    const otherAdmin = await mkUser("admin2@eco-team.io", "admin");
    const r = await call("PUT", `/api/crm/team/members/${otherAdmin.id}/access`, adminCookie, { crmAccess: false });
    expect(r.status).toBe(409);
    expect(r.json.error).toBe("admin_always_has_access");
    const self = await call("PUT", `/api/crm/team/members/${adminId}/active`, adminCookie, { active: false });
    expect(self.status).toBe(409);
    expect(self.json.error).toBe("cannot_change_self");
  });
});

describe("Rol și dezactivare", () => {
  it("[blocant] dezactivarea închide contul și îi șterge sesiunile; reactivarea îl redeschide", async () => {
    const eva = await mkUser("eva@eco-team.io", "teacher");
    const evaCookie = await loginAs(eva.id);
    await testDb.insert(sessions).values({ userId: eva.id, token: `tok-${eva.id}`, expiresAt: new Date(Date.now() + 86_400_000) });

    dropAllCachedSessions.mockClear();
    const off = await call("PUT", `/api/crm/team/members/${eva.id}/active`, adminCookie, { active: false });
    expect(off.status).toBe(200);
    // Sesiunile stau 30 s în cache cu rândul omului — fără golire, contul ar mai merge (bug prins live).
    expect(dropAllCachedSessions).toHaveBeenCalled();
    expect((await call("GET", "/api/crm/permissions", evaCookie)).status).toBe(401);
    const left = await testDb.select().from(sessions).where(eq(sessions.userId, eva.id));
    expect(left).toHaveLength(0);

    const on = await call("PUT", `/api/crm/team/members/${eva.id}/active`, adminCookie, { active: true });
    expect(on.status).toBe(200);
    expect((await call("GET", "/api/crm/permissions", evaCookie)).status).toBe(200);
  });

  it("[blocant] rolul se schimbă pe loc (drepturile urmează rolul); un admin retrogradat pierde administrarea", async () => {
    const [iso] = await testDb.insert(tenants).values({ name: "Solo", slug: "solo-team", appKind: "business" }).returning();
    const [solo] = await testDb
      .insert(users)
      .values({ tenantId: iso.id, email: "solo@solo.io", passwordHash: "x", name: "Solo", role: "admin" })
      .returning();
    const [agent] = await testDb
      .insert(users)
      .values({ tenantId: iso.id, email: "ag@solo.io", passwordHash: "x", name: "Ag", role: "teacher" })
      .returning();
    const soloCookie = await loginAs(solo.id);
    const agentCookie = await loginAs(agent.id);

    // Agentul nu vede jurnalul; promovat manager, îl vede.
    const before = await call("GET", "/api/crm/permissions", agentCookie);
    expect(before.json.permissions).not.toContain("audit.view");
    dropAllCachedSessions.mockClear();
    expect((await call("PATCH", `/api/crm/team/members/${agent.id}`, soloCookie, { role: "manager" })).status).toBe(200);
    expect(dropAllCachedSessions).toHaveBeenCalled();
    const after = await call("GET", "/api/crm/permissions", agentCookie);
    expect(after.json.permissions).toContain("audit.view");

    // Managerul vede echipa, dar n-o administrează.
    const view = await call("GET", "/api/crm/team", agentCookie);
    expect(view.status).toBe(200);
    expect(view.json.canManage).toBe(false);
    expect((await call("PATCH", `/api/crm/team/members/${solo.id}`, agentCookie, { role: "teacher" })).status).toBe(403);

    // Alt workspace: nu poți atinge oamenii lui.
    expect((await call("PATCH", `/api/crm/team/members/${agent.id}`, adminCookie, { role: "teacher" })).status).toBe(404);
  });

  it("[normal] un id care nu e uuid dă 404, nu 500", async () => {
    expect((await call("PATCH", "/api/crm/team/members/nu-e-uuid", adminCookie, { role: "teacher" })).status).toBe(404);
  });
});

describe("Regresie: invitația PAR trece prin același acordare", () => {
  it("[blocant] invitația PAR dă în continuare rândul par_members și aterizează în PAR", async () => {
    const token = generateInviteToken();
    await testDb.insert(parInvites).values({
      tenantId,
      email: "par@eco-team.io",
      parRole: "approver",
      tokenHash: hashInviteToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
    const acc = await call("POST", "/api/auth/accept-invite", "", { token, name: "Par User", password: "parola123" });
    expect(acc.status).toBe(200);
    expect(acc.json.redirect).toBe("/business/par");
    const u = await testDb.query.users.findFirst({ where: eq(users.email, "par@eco-team.io") });
    expect(u?.role).toBe("teacher");
    const members = await testDb.select().from(parMembers).where(eq(parMembers.userId, u!.id));
    expect(members.map((m) => m.role)).toEqual(["approver"]);
  });
});
