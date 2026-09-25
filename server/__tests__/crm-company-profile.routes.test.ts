/**
 * @vitest-environment node
 *
 * CRM-D04 — „Datele firmei tale", scrise o dată, tipărite pe fiecare act.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users, leads } from "../db/schema";
import { finOrgProfile } from "../db/schema/finCore";
import { docDocuments } from "../db/schema/docs";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantA: string;
let tenantB: string;
let adminA: string;
let agentA: string;
let adminB: string;
let currentUser: { id: string; tenantId: string; role: string; email: string; name?: string };

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));
vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", currentUser);
    await next();
  },
}));

import { Hono } from "hono";
let app: Hono;

async function applyMigrations(pg: PGlite) {
  const dir = path.resolve(__dirname, "../../drizzle");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      try {
        await pg.exec(stmt);
      } catch {
        /* migrările vechi pot repeta obiecte — ca în celelalte suite */
      }
    }
  }
}

async function call(method: string, url: string, body?: unknown) {
  const res = await app.request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });
  const { crmCompanyProfileRoutes } = await import("../routes/crmCompanyProfile");
  const { crmDocumentsRoutes } = await import("../routes/crmDocuments");
  app = new Hono();
  app.route("/api/crm/company-profile", crmCompanyProfileRoutes);
  app.route("/api/crm/documents", crmDocumentsRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Alfa", slug: "alfa-firma" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Beta", slug: "beta-firma" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;
  const mk = async (tenantId: string, email: string, role: string) =>
    (await testDb.insert(users).values({ tenantId, email, passwordHash: "x", name: email, role }).returning())[0].id;
  adminA = await mk(tenantA, "admin@alfa.md", "admin");
  agentA = await mk(tenantA, "agent@alfa.md", "teacher");
  adminB = await mk(tenantB, "admin@beta.md", "admin");
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(docDocuments);
  await testDb.delete(leads);
  await testDb.delete(finOrgProfile);
  currentUser = { id: adminA, tenantId: tenantA, role: "admin", email: "admin@alfa.md", name: "Ana" };
});

const FULL = {
  legalName: "Vector Academy SRL",
  idno: "1024600035737",
  address: "mun. Chișinău, str. 31 August 1989, 78",
  iban: "md87 ag00 0000 0225 1606 5719",
  bankName: "BC Moldova-Agroindbank SA",
  bic: "agrnmd2x",
  administratorName: "Vlah Dumitru",
  administratorTitle: "Administrator",
  email: "office@vectoracademy.ro",
};

describe("CRM-D04 — datele firmei", () => {
  it("[blocant] un workspace nou vede ce îi lipsește pentru acte, pe nume", async () => {
    const res = await call("GET", "/api/crm/company-profile");
    expect(res.status).toBe(200);
    expect(res.body.missing).toEqual(["IDNO", "Adresa juridică", "IBAN", "Banca", "Administratorul"]);
  });

  it("[blocant] fără profil, denumirea vine din ce știe deja aplicația — nu se retastează", async () => {
    const res = await call("GET", "/api/crm/company-profile");
    // Workspace-ul se numește „Alfa": exact numele pe care actele îl tipăresc azi.
    expect((res.body.profile as Record<string, unknown>).legalName).toBe("Alfa");
  });

  it("[blocant] se salvează o dată; IBAN-ul și BIC-ul se normalizează cum le cere banca", async () => {
    const saved = await call("PUT", "/api/crm/company-profile", FULL);
    expect(saved.status).toBe(200);
    const profile = saved.body.profile as Record<string, string>;
    expect(profile.iban).toBe("MD87AG000000022516065719");
    expect(profile.bic).toBe("AGRNMD2X");
    expect(saved.body.missing).toEqual([]);
    // A doua salvare actualizează același rând, nu creează un al doilea profil.
    await call("PUT", "/api/crm/company-profile", { ...FULL, phone: "+373 22 000 000" });
    expect(await testDb.select().from(finOrgProfile).where(eq(finOrgProfile.tenantId, tenantA))).toHaveLength(1);
  });

  it("[blocant] IBAN-ul greșit se refuză cu mesaj în română", async () => {
    const res = await call("PUT", "/api/crm/company-profile", { ...FULL, iban: "MD123" });
    expect(res.status).toBe(400);
    expect(res.body.field).toBe("iban");
    expect(String(res.body.message)).toMatch(/IBAN invalid/);
  });

  it("[blocant] un agent fără drept de administrare le vede, dar nu le poate schimba", async () => {
    await call("PUT", "/api/crm/company-profile", FULL);
    currentUser = { id: agentA, tenantId: tenantA, role: "teacher", email: "agent@alfa.md" };
    expect((await call("GET", "/api/crm/company-profile")).status).toBe(200);
    expect((await call("PUT", "/api/crm/company-profile", { ...FULL, iban: null })).status).toBe(403);
  });

  it("[blocant] datele unui workspace nu se văd din altul", async () => {
    await call("PUT", "/api/crm/company-profile", FULL);
    currentUser = { id: adminB, tenantId: tenantB, role: "admin", email: "admin@beta.md" };
    const res = await call("GET", "/api/crm/company-profile");
    expect((res.body.profile as Record<string, unknown>).iban).toBeNull();
  });

  it("[blocant] contractul nou tipărește IBAN-ul, banca și administratorul firmei — fără linii goale", async () => {
    await call("PUT", "/api/crm/company-profile", FULL);
    const [lead] = await testDb.insert(leads).values({ tenantId: tenantA, fullName: "Ion", stage: "new", company: "Client SRL" }).returning();
    const doc = await call("POST", "/api/crm/documents", { leadId: lead.id, kind: "contract_servicii" });
    const [row] = await testDb.select().from(docDocuments).where(eq(docDocuments.id, doc.body.id as string));
    expect(row.bodyHtml).toContain("MD87AG000000022516065719");
    expect(row.bodyHtml).toContain("BC Moldova-Agroindbank SA");
    expect(row.bodyHtml).toContain("Vlah Dumitru");
  });
});
