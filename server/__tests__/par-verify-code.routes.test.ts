/**
 * @vitest-environment node
 * PARVERIFY-001 — administrarea codului de verificare (rută reală + PGlite).
 *
 * Ce apără testele: `revoke` și `reissue` invalidează exemplare deja TIPĂRITE, inclusiv dintr-un
 * dosar de audit predat. E singura pereche de operațiuni din această funcție care distruge ceva,
 * deci limita de rol trebuie să țină pe server, nu doar în interfață (unde butoanele sunt ascunse).
 */
import { describe, it, expect, beforeAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parRequests, parMembers, parPayers, parPayerModules } from "../db/schema/par";
import { parVerifyTokens } from "../db/schema/parVerifyTokens";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let parId: string;
let adminId: string;
let plainId: string;
/** Cine „e logat" la cererea curentă — mockul de autentificare citește variabila asta. */
let actingUserId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: actingUserId, tenantId, role: "manager", email: "x@vector.md" });
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8")
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

const tokenRow = () =>
  testDb
    .select()
    .from(parVerifyTokens)
    .where(and(eq(parVerifyTokens.parId, parId), eq(parVerifyTokens.tenantId, tenantId)));

beforeAll(async () => {
  process.env.PAR_SIGN_SECRET = "secret-de-test";
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parRoutes } = await import("../routes/par");
  app = new Hono();
  app.route("/api/par", parRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-code" }).returning();
  tenantId = tenant.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC" }).returning();
  await testDb.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true });

  // Rolul de TENANT contează: „admin" și „manager" primesc implicit par_admin în tot modulul
  // (`IMPLICIT_PAR_ADMIN_TENANT_ROLES`, requirePARRole.ts). Un solicitant obișnuit trebuie deci
  // creat cu un rol din afara listei (aici „receptionist"), altfel testul de mai jos ar trece degeaba — l-am scris întâi greșit.
  const mk = async (email: string, name: string, role: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name, role })
      .returning();
    return u.id;
  };
  adminId = await mk("admin@vector.md", "Admin PAR", "manager");
  plainId = await mk("dorina@vector.md", "Dorina Harghel", "receptionist");
  await testDb.insert(parMembers).values([
    { tenantId, userId: adminId, role: "par_admin" },
    { tenantId, userId: plainId, role: "requestor" },
  ]);

  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      requestNo: "PAR-2026-0300",
      // Autorul e utilizatorul simplu: fără asta, 403-ul de mai jos s-ar putea datora
      // faptului că nu vede cererea, nu lipsei rolului — iar testul n-ar dovedi nimic.
      requestedByUserId: plainId,
      purpose: "execute_payment",
      chargeTo: "program",
      status: "approved",
      payerId: payer.id,
      currency: "MDL",
      totalEstimatedCents: 500000,
      dateOfRequest: new Date("2026-09-10T00:00:00Z"),
    })
    .returning();
  parId = par.id;

  actingUserId = adminId;
});

describe("GET /api/par/:id/verify-code", () => {
  it("înainte de prima tipărire spune că nu există cod, nu dă eroare", async () => {
    const res = await app.request(`/api/par/${parId}/verify-code`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ issued: false });
  });

  it("după descărcarea formularului arată codul și linkul lui", async () => {
    process.env.APP_URL = "https://www.finflow.best";
    const pdf = await app.request(`/api/par/${parId}/form.pdf`);
    expect(pdf.status).toBe(200);

    const body = await (await app.request(`/api/par/${parId}/verify-code`)).json();
    expect(body.issued).toBe(true);
    expect(body.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(body.url).toContain("/#/verificare/par/");
    expect(body.scanCount).toBe(0);
  });

  it("a doua descărcare refolosește tokenul — altfel fiecare PDF ar lăsa un link valid în plus", async () => {
    const before = (await tokenRow())[0].token;
    await app.request(`/api/par/${parId}/form.pdf`);
    const rows = await tokenRow();
    expect(rows).toHaveLength(1);
    expect(rows[0].token).toBe(before);
  });
});

describe("POST /api/par/:id/verify-code", () => {
  it("refuză retragerea unui solicitant obișnuit, chiar dacă e autorul cererii", async () => {
    actingUserId = plainId;
    const res = await app.request(`/api/par/${parId}/verify-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "revoke" }),
    });
    expect(res.status).toBe(403);
    expect((await tokenRow())[0].revokedAt).toBeNull();
    actingUserId = adminId;
  });

  it("retragerea închide linkul public", async () => {
    const res = await app.request(`/api/par/${parId}/verify-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "revoke" }),
    });
    expect(res.status).toBe(200);
    expect((await tokenRow())[0].revokedAt).not.toBeNull();
  });

  it("reemiterea dă alt cod și ȘTERGE vechiul token — nu lasă un al doilea link valid", async () => {
    const old = (await tokenRow())[0].token;
    const res = await app.request(`/api/par/${parId}/verify-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reissue" }),
    });
    expect(res.status).toBe(200);

    const rows = await tokenRow();
    expect(rows).toHaveLength(1);
    expect(rows[0].token).not.toBe(old);
    // Reemiterea readuce codul la viață: e pentru cazul „a circulat unde nu trebuia", nu „anulat".
    expect(rows[0].revokedAt).toBeNull();
    expect(rows[0].scanCount).toBe(0);

    const stillThere = await testDb
      .select()
      .from(parVerifyTokens)
      .where(eq(parVerifyTokens.token, old));
    expect(stillThere).toHaveLength(0);
  });

  it("respinge o acțiune inventată", async () => {
    const res = await app.request(`/api/par/${parId}/verify-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "delete-everything" }),
    });
    expect(res.status).toBe(400);
  });
});
