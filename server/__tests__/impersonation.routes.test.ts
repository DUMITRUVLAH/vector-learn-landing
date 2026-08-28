/**
 * @vitest-environment node
 * PLATFORM-403 — impersonare („intră în contul lui X") pe rutele REALE + PGlite.
 *
 * Testăm ACȚIUNEA, nu afordanța (CLAUDE.md §3.5.1quater): pornim efectiv sesiunea, o folosim
 * ca să citim `/api/auth/me` (deci chiar suntem clientul), și ieșim înapoi în contul propriu.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/index";
import { tenants, users, sessions } from "../db/schema";
import { platformAdmins } from "../db/schema/par";
import { platformAuditLog } from "../db/schema/platform";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;

vi.mock("../db/client", () => ({ get db() { return testDb; }, closeDb: async () => {} }));

import { impersonationRoutes } from "../routes/impersonation";
import { authRoutes } from "../routes/auth";
import { createSession } from "../auth/session";
import { Hono } from "hono";

const app = new Hono();
app.route("/api/impersonation", impersonationRoutes);
app.route("/api/auth", authRoutes);

let tenantId: string;
let ownerId: string;         // superadmin de platformă
let clientUserId: string;    // clientul în care intrăm
let otherAdminId: string;    // alt superadmin — interzis
let ownerToken: string;

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt).catch(() => {});
    }
  }
}

const post = (p: string, body: unknown, token?: string) =>
  app.request(p, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { cookie: `vl_session=${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const get = (p: string, token?: string) =>
  app.request(p, { headers: token ? { cookie: `vl_session=${token}` } : {} });

/** Cookie-ul de sesiune returnat de rută (impersonarea îl schimbă din zbor). */
function sessionCookie(res: Response): string | null {
  const raw = res.headers.get("set-cookie");
  const m = raw?.match(/vl_session=([^;]+)/);
  return m ? m[1] : null;
}

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema }) as unknown as typeof testDb;
  await applyMigrations(pglite);

  const [t] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-test", plan: "starter", appKind: "business" }).returning();
  tenantId = t.id;
  const [owner] = await testDb.insert(users).values({ tenantId, email: "vlah.business@gmail.com", passwordHash: "x", name: "Dumitru", role: "admin" }).returning();
  ownerId = owner.id;
  const [client] = await testDb.insert(users).values({ tenantId, email: "violeta@example.org", passwordHash: "x", name: "Violeta B", role: "manager" }).returning();
  clientUserId = client.id;
  const [other] = await testDb.insert(users).values({ tenantId, email: "admin2@example.org", passwordHash: "x", name: "Alt Admin", role: "admin" }).returning();
  otherAdminId = other.id;
  await testDb.insert(platformAdmins).values([{ userId: ownerId }, { userId: otherAdminId }]);

  ownerToken = (await createSession(ownerId)).token;
}, 60_000);

afterAll(async () => { await pglite.close(); });

describe("PLATFORM-403 — impersonare", () => {
  it("[blocant] superadminul intră în contul clientului și /me răspunde ca acel client", async () => {
    const res = await post("/api/impersonation/start", { userId: clientUserId }, ownerToken);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.user.email).toBe("violeta@example.org");
    expect(json.redirect).toBe("/business/dashboard");

    const token = sessionCookie(res);
    expect(token).toBeTruthy();

    // Chiar SUNTEM clientul: endpointul de identitate răspunde cu contul lui.
    const me = await get("/api/auth/me", token!);
    expect(me.status).toBe(200);
    expect((await me.json()).user.email).toBe("violeta@example.org");

    // …iar statusul spune cine a deschis sesiunea, ca bannerul să poată explica.
    const status = await get("/api/impersonation/status", token!);
    const sj = await status.json();
    expect(sj.active).toBe(true);
    expect(sj.actor.email).toBe("vlah.business@gmail.com");
    expect(sj.target.email).toBe("violeta@example.org");

    // Sesiunea proprie a superadminului rămâne validă în paralel.
    const ownerMe = await get("/api/auth/me", ownerToken);
    expect((await ownerMe.json()).user.email).toBe("vlah.business@gmail.com");

    // START e în audit, cu cine pe cine.
    const entries = await testDb.select().from(platformAuditLog).where(eq(platformAuditLog.action, "impersonate.start"));
    expect(entries).toHaveLength(1);
    expect(entries[0].actorEmail).toBe("vlah.business@gmail.com");
    expect(entries[0].targetId).toBe(clientUserId);

    // Ieșirea repune sesiunea superadminului și șterge sesiunea împrumutată.
    const stop = await post("/api/impersonation/stop", undefined, token!);
    expect(stop.status).toBe(200);
    const stopJson = await stop.json();
    expect(stopJson.restored).toBe(true);
    expect(sessionCookie(stop)).toBe(ownerToken);
    const left = await testDb.select().from(sessions).where(eq(sessions.token, token!));
    expect(left).toHaveLength(0);
    const stops = await testDb.select().from(platformAuditLog).where(eq(platformAuditLog.action, "impersonate.stop"));
    expect(stops).toHaveLength(1);
  });

  it("[blocant] un utilizator obișnuit NU poate porni o impersonare", async () => {
    const clientToken = (await createSession(clientUserId)).token;
    const res = await post("/api/impersonation/start", { userId: ownerId }, clientToken);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("platform_admin_required");
  });

  it("[blocant] nu se poate intra în contul altui superadmin", async () => {
    const res = await post("/api/impersonation/start", { userId: otherAdminId }, ownerToken);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("target_is_platform_admin");
  });

  it("[blocant] fără lanțuri: dintr-o sesiune împrumutată nu se pornește alta", async () => {
    const started = await post("/api/impersonation/start", { userId: clientUserId }, ownerToken);
    const token = sessionCookie(started)!;
    // Ținta nu e superadmin, deci ar trece de requirePlatformAdmin doar dacă ar fi — dar
    // verificăm explicit că mecanismul refuză lanțul chiar și dacă ar avea drepturi.
    const { startImpersonation } = await import("../lib/impersonation");
    const owner = await testDb.query.users.findFirst({ where: eq(users.id, ownerId) });
    const chained = await startImpersonation({ actor: owner!, actorSessionToken: token, targetUserId: clientUserId });
    expect("refused" in chained && chained.refused).toBe("already_impersonating");
    await post("/api/impersonation/stop", undefined, token);
  });

  it("[blocant] STOP pe o sesiune normală răspunde 400, nu deconectează pe nimeni", async () => {
    const res = await post("/api/impersonation/stop", undefined, ownerToken);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("not_impersonating");
    const me = await get("/api/auth/me", ownerToken);
    expect(me.status).toBe(200);
  });

  it("[blocant] contul dezactivat nu poate fi impersonat", async () => {
    const [disabled] = await testDb.insert(users).values({ tenantId, email: "off@example.org", passwordHash: "x", name: "Off", role: "teacher", isActive: false }).returning();
    const res = await post("/api/impersonation/start", { userId: disabled.id }, ownerToken);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("target_disabled");
  });
});
