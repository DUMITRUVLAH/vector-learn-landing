/**
 * @vitest-environment node
 *
 * PLATFORM-002 — telemetria de erori + semnalele de creștere, pe rutele reale + PGlite.
 *
 * Testul central nu e „endpointul răspunde 200", ci: **provoc o eroare reală și verific
 * că apare în consolă**. O telemetrie care se testează doar pe ea însăși nu dovedește
 * nimic despre ce se întâmplă când chiar se strică ceva (CLAUDE.md §3.5.1quater).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { errorEvents, errorGroups } from "../db/schema/telemetry";
import { platformAdmins } from "../db/schema/par";
import { fingerprintOf, isNoise, normalizeLocation, normalizeMessage } from "../lib/errorTelemetry";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let ownerUserId: string;
let clientUserId: string;
let clientTenantId: string;

vi.mock("../db/client", () => ({ get db() { return testDb; }, closeDb: async () => {} }));
vi.mock("../auth/password", () => ({
  hashPassword: vi.fn(async (pw: string) => `$mock$${pw}`),
  verifyPassword: vi.fn(async (pw: string, hash: string) => hash === `$mock$${pw}`),
}));
vi.mock("../auth/session", () => ({
  SESSION_COOKIE: "vl_session",
  createSession: vi.fn().mockResolvedValue({ token: "t", expiresAt: new Date(Date.now() + 86_400_000) }),
  revokeSession: vi.fn().mockResolvedValue(undefined),
  getSessionUser: vi.fn(async (token: string) => {
    const id = token === "owner" ? ownerUserId : token === "client" ? clientUserId : null;
    if (!id) return null;
    const user = await testDb.query.users.findFirst({ where: eq(users.id, id) });
    return user ? { session: { id: "s" }, user } : null;
  }),
}));
// Alerta pe email e testată separat prin efectul ei (alertedAt); aici o dezactivăm ca
// testele să nu depindă de un provider extern.
vi.mock("../lib/errorAlerts", () => ({ alertOwnerOnNewError: vi.fn().mockResolvedValue(undefined) }));

import { Hono } from "hono";
import { platformInsightsRoutes } from "../routes/platformInsights";
import { telemetryRoutes } from "../routes/telemetry";
import { errorCapture } from "../middleware/errorCapture";
import { requireAuth } from "../middleware/requireAuth";
import { recordError } from "../lib/errorTelemetry";

const app = new Hono();
app.use("/api/*", errorCapture);
app.route("/api/platform", platformInsightsRoutes);
app.route("/api/telemetry", telemetryRoutes);
// Două rute-cobai: una care aruncă, una păzită care răspunde 500 „curat".
app.onError((err, c) => {
  void recordError({
    kind: "server_exception",
    message: err.message,
    stack: err.stack ?? null,
    location: new URL(c.req.url).pathname,
    method: c.req.method,
    statusCode: 500,
  });
  return c.json({ error: err.message }, 500);
});
app.get("/api/boom", () => {
  throw new Error("Ceva s-a rupt în handler");
});
app.get("/api/guarded-boom", requireAuth, (c) => c.json({ error: "internal_disaster" }, 500));
// Cobai pentru "not_found" de business, ca cel real de la GET /api/par/:id/purchase-order
// înainte de emitere — o rută care EXISTĂ și răspunde 404 cu alt cod decât route_not_found.
app.get("/api/some-resource/:id", (c) => c.json({ error: "not_found" }, 404));

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

const asOwner = (p: string, init: RequestInit = {}) =>
  app.request(p, { ...init, headers: { "content-type": "application/json", cookie: "vl_session=owner", ...(init.headers ?? {}) } });
const asClient = (p: string, init: RequestInit = {}) =>
  app.request(p, { ...init, headers: { "content-type": "application/json", cookie: "vl_session=client", ...(init.headers ?? {}) } });

/** Captarea e `void`-uită intenționat (nu întârzie răspunsul), deci așteptăm scrierea. */
const settle = () => new Promise((r) => setTimeout(r, 120));

beforeAll(async () => {
  pglite = new PGlite();
  testDb = drizzle({ client: pglite, schema }) as unknown as typeof testDb;
  await applyMigrations(pglite);

  const [ownerTenant] = await testDb
    .insert(tenants).values({ name: "Vector Platform", slug: "vp", plan: "enterprise", appKind: "business" }).returning();
  const [owner] = await testDb
    .insert(users).values({ tenantId: ownerTenant.id, email: "owner@vector.md", passwordHash: "$mock$pw", name: "Owner", role: "admin" }).returning();
  ownerUserId = owner.id;
  await testDb.insert(platformAdmins).values({ userId: ownerUserId });

  const [clientTenant] = await testDb
    .insert(tenants).values({ name: "Client SRL", slug: "client-srl", plan: "starter", appKind: "business", signupSource: "linkedin" }).returning();
  clientTenantId = clientTenant.id;
  const [client] = await testDb
    .insert(users).values({ tenantId: clientTenantId, email: "client@srl.md", passwordHash: "$mock$pw", name: "Client", role: "admin" }).returning();
  clientUserId = client.id;
}, 90_000);

afterAll(async () => { await pglite.close(); });

describe("amprentarea erorilor", () => {
  it("normalizează ce diferă între apariții", () => {
    expect(normalizeMessage('Nu găsesc "abc" cu id 123'))
      .toBe(normalizeMessage('Nu găsesc "xyz" cu id 999'));
    expect(normalizeLocation("/api/par/1e1f8f4c-1111-2222-3333-444455556666/timeline"))
      .toBe("/api/par/:id/timeline");
  });

  it("două apariții ale aceleiași erori au aceeași amprentă, alt tip are alta", () => {
    const a = fingerprintOf("server_5xx", "/api/par/abc", "boom 1");
    const b = fingerprintOf("server_5xx", "/api/par/abc", "boom 2");
    const c = fingerprintOf("client_crash", "/api/par/abc", "boom 1");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("nu tratează ca bug o sesiune expirată sau un drept lipsă", () => {
    expect(isNoise("unauthenticated", 401)).toBe(true);
    expect(isNoise("module_disabled", 403)).toBe(true);
    expect(isNoise("Cannot read properties of undefined", 500)).toBe(false);
  });
});

describe("captarea automată pe server", () => {
  it("o excepție într-un handler ajunge în consolă", async () => {
    const res = await app.request("/api/boom");
    expect(res.status).toBe(500);
    await settle();
    const groups = await testDb.select().from(errorGroups);
    const hit = groups.find((g) => g.title.includes("Ceva s-a rupt în handler"));
    expect(hit).toBeTruthy();
    expect(hit?.kind).toBe("server_exception");
  });

  it("un 5xx cu utilizator autentificat reține CINE l-a lovit", async () => {
    const res = await asClient("/api/guarded-boom");
    expect(res.status).toBe(500);
    await settle();
    const events = await testDb.select().from(errorEvents).where(eq(errorEvents.kind, "server_5xx"));
    const mine = events.find((e) => e.message === "internal_disaster");
    expect(mine).toBeTruthy();
    expect(mine?.tenantId).toBe(clientTenantId);
    expect(mine?.userEmail).toBe("client@srl.md");
  });

  it("un 404 pe /api/* e tratat ca bug (rută nemontată), nu ca zgomot", async () => {
    const res = await app.request("/api/aceasta-ruta-nu-exista");
    expect(res.status).toBe(404);
    await settle();
    const groups = await testDb.select().from(errorGroups).where(eq(errorGroups.kind, "api_route_missing"));
    expect(groups.length).toBeGreaterThan(0);
  });

  it("un 404 de business pe o rută care EXISTĂ nu e tratat ca rută lipsă", async () => {
    // Bug real (2026-08-28): GET /api/par/:id/purchase-order înainte de emitere, sau
    // GET /api/par/:id cu un id necunoscut, răspund 404 cu `{error:"not_found"}` — ruta EXISTĂ
    // și funcționează corect. errorCapture le clasifica drept `api_route_missing` doar pentru
    // că statusul era 404 pe /api/*, umplând Consola Platformă cu "rută API lipsă" false.
    const before = (await testDb.select().from(errorGroups).where(eq(errorGroups.kind, "api_route_missing"))).length;
    const res = await app.request("/api/some-resource/xyz");
    expect(res.status).toBe(404);
    await settle();
    const after = (await testDb.select().from(errorGroups).where(eq(errorGroups.kind, "api_route_missing"))).length;
    expect(after).toBe(before);
  });

  it("aceeași eroare de două ori = UN grup cu două apariții, nu două grupuri", async () => {
    const before = (await testDb.select().from(errorGroups)).length;
    await app.request("/api/boom");
    await settle();
    const after = await testDb.select().from(errorGroups);
    expect(after.length).toBe(before);
    const hit = after.find((g) => g.title.includes("Ceva s-a rupt în handler"))!;
    expect(hit.occurrences).toBeGreaterThanOrEqual(2);
  });

  it("un 401/403 normal NU poluează lista de erori", async () => {
    const before = (await testDb.select().from(errorEvents)).length;
    const res = await app.request("/api/platform/errors"); // fără sesiune → 401
    expect(res.status).toBe(401);
    await settle();
    expect((await testDb.select().from(errorEvents)).length).toBe(before);
  });
});

describe("regresie: /api/* inexistent NU are voie să întoarcă HTML", () => {
  // Bug real, prins de smoke-ul live (nu de testele unitare): pe serverul adevărat, o rută
  // API inexistentă cădea în fallback-ul SPA și primea 200 + index.html. Clientul făcea
  // JSON.parse("<!doctype …") → „Unexpected token '<'", clasa de bug-uri #1 din repo.
  // Plasa e `app.all("/api/*")` de la capătul lui server/app.ts.
  it("întoarce JSON 404, nu pagina SPA", async () => {
    const { app: realApp } = await import("../app");
    const res = await realApp.request("/api/aceasta-ruta-nu-a-fost-montata");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("route_not_found");
  });

  it("nu afectează rutele API reale", async () => {
    const { app: realApp } = await import("../app");
    const res = await realApp.request("/api/platform/errors");
    // 401 (fără sesiune), NU 404 — plasa se aplică doar la ce chiar lipsește.
    expect(res.status).toBe(401);
  });
});

describe("erorile din browser", () => {
  it("POST /api/telemetry/error acceptă un raport și îl leagă de utilizatorul din SESIUNE", async () => {
    const res = await app.request("/api/telemetry/error", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "vl_session=client" },
      body: JSON.stringify({
        kind: "client_crash",
        message: "Cannot read properties of undefined (reading 'map')",
        stack: "at ParDashboard",
        location: "/business/par",
        url: "http://localhost/#/business/par",
      }),
    });
    expect(res.status).toBe(200);
    const events = await testDb.select().from(errorEvents).where(eq(errorEvents.kind, "client_crash"));
    expect(events.length).toBe(1);
    // Identitatea vine din cookie, nu din corp — nimeni nu poate pune erori pe seama altui client.
    expect(events[0].tenantId).toBe(clientTenantId);
    expect(events[0].userEmail).toBe("client@srl.md");
    expect(events[0].location).toBe("/business/par");
  });

  it("acceptă rapoarte și fără sesiune (crash pe ecranul de login)", async () => {
    const res = await app.request("/api/telemetry/error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "client_unhandled", message: "boom pe ecranul public", location: "/business/login" }),
    });
    expect(res.status).toBe(200);
    const events = await testDb.select().from(errorEvents).where(eq(errorEvents.kind, "client_unhandled"));
    expect(events[0].userId).toBeNull();
  });

  it("refuză un corp invalid", async () => {
    const res = await app.request("/api/telemetry/error", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "server_exception", message: "încerc să mă dau drept server" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("consola de erori", () => {
  it("GET /errors grupează și numără", async () => {
    const res = await asOwner("/api/platform/errors?status=open&days=30");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { groups: { title: string; occurrences: number }[]; openCount: number };
    expect(json.groups.length).toBeGreaterThan(0);
    expect(json.openCount).toBe(json.groups.length);
  });

  it("GET /errors/:id întoarce aparițiile cu context", async () => {
    const list = (await (await asOwner("/api/platform/errors?status=open")).json()) as { groups: { id: string }[] };
    const res = await asOwner(`/api/platform/errors/${list.groups[0].id}`);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { group: { id: string }; events: unknown[] };
    expect(json.events.length).toBeGreaterThan(0);
  });

  it("PUT /errors/:id/status marchează rezolvat, iar reapariția o REDESCHIDE singură", async () => {
    const list = (await (await asOwner("/api/platform/errors?status=open")).json()) as {
      groups: { id: string; title: string }[];
    };
    const target = list.groups.find((g) => g.title.includes("Ceva s-a rupt în handler"))!;
    const res = await asOwner(`/api/platform/errors/${target.id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: "resolved" }),
    });
    expect(res.status).toBe(200);
    let [row] = await testDb.select().from(errorGroups).where(eq(errorGroups.id, target.id));
    expect(row.status).toBe("resolved");

    // Reapare → trebuie să revină în listă, altfel ar dispărea tăcut exact când redevine problemă.
    await app.request("/api/boom");
    await settle();
    [row] = await testDb.select().from(errorGroups).where(eq(errorGroups.id, target.id));
    expect(row.status).toBe("open");
  });

  it("un utilizator obișnuit nu vede erorile platformei", async () => {
    const res = await asClient("/api/platform/errors");
    expect(res.status).toBe(403);
  });
});

describe("semnalele de creștere", () => {
  it("GET /growth întoarce pâlnia, sursele, adopția reală și lista de sunat", async () => {
    // Regula e „nu deranja un cont făcut acum 5 minute": lista de sunat cere cel puțin o zi
    // vechime. Îmbătrânim workspace-ul clientului ca să testăm regula reală, nu una relaxată.
    await testDb
      .update(tenants)
      .set({ createdAt: new Date(Date.now() - 5 * 86_400_000) })
      .where(eq(tenants.id, clientTenantId));

    const res = await asOwner("/api/platform/growth?days=90");
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      funnel: { signedUp: number; loggedIn: number; activated: number };
      sources: { source: string; signups: number }[];
      adoption: { key: string; enabled: number; used: number }[];
      callList: { name: string; reasons: string[] }[];
    };
    expect(json.funnel.signedUp).toBeGreaterThan(0);
    // Nimeni n-a făcut nimic real în test → activarea trebuie să fie 0, nu egală cu înscrierile.
    expect(json.funnel.activated).toBe(0);
    expect(json.sources.some((s) => s.source === "linkedin")).toBe(true);
    expect(json.adoption).toHaveLength(4);
    expect(json.adoption.every((a) => a.used <= a.enabled)).toBe(true);
    // Clienți care nu s-au logat niciodată → apar cu motiv în lista de sunat.
    expect(json.callList.some((t) => t.reasons.includes("nu s-a logat niciodată"))).toBe(true);
  });

  it("GET /growth/contacts.csv livrează lista pentru campanii", async () => {
    const res = await asOwner("/api/platform/growth/contacts.csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("client@srl.md");
    expect(text).toContain("Client SRL");
  });

  it("un utilizator obișnuit nu vede datele de creștere", async () => {
    const res = await asClient("/api/platform/growth");
    expect(res.status).toBe(403);
  });
});
