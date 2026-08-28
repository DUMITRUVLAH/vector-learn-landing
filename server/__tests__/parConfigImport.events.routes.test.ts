/**
 * @vitest-environment node
 *
 * Importul Excel acoperă TOATE listele pe care le cere o cerere PAR — inclusiv evenimentele.
 *
 * Evenimentele erau singura listă de referință care apărea în admin și pe formularul de cerere,
 * dar NU se putea importa: fișierul le conținea, iar utilizatorul le introducea manual, unul
 * câte unul. La fel, codul de TVA al beneficiarului avea coloană în registru, dar importul îl
 * arunca.
 *
 * CLAUDE.md §3.5.1quater: rutele sunt CHEMATE cu fișiere reale, nu doar montate.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import ExcelJS from "exceljs";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parEvents, parPayerModules, parPayers, parProjects, parVendors } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let payerId: string;

vi.mock("../db/client", () => ({
  get db() { return testDb; },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "admin", email: "violeta@atic.md" });
    await next();
  },
}));

import { Hono } from "hono";
let app: Hono;

interface Category { created: number; updated: number; errors: { row: number; column: string; message: string }[] }
interface ImportBody {
  payers: Category; projects: Category; events?: Category; departments: Category;
  budgetCodes: Category; vendors?: Category; warnings: string[];
}

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

async function postImport(file: File) {
  const form = new FormData();
  form.append("file", file);
  return app.request("/api/par/config-import", { method: "POST", body: form });
}

/** O foaie „Evenimente" așa cum o are un fișier real: nume, proiect, două date. */
async function eventsFile(rows: Array<[string, string, string, string]>): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Evenimente");
  ws.addRow(["Denumire eveniment *", "Proiect", "Început (dată)", "Sfârșit (dată)"]);
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf], "evenimente.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parConfigImportRoutes } = await import("../routes/parConfigImport");
  app = new Hono();
  app.route("/api/par/config-import", parConfigImportRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-events" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb.insert(users).values({
    tenantId, email: "violeta@atic.md", passwordHash: "x", name: "Violeta", role: "admin",
  }).returning();
  userId = u.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC" }).returning();
  payerId = payer.id;
  await testDb.insert(parPayerModules).values({ tenantId, payerId, moduleKey: "par", enabled: true });
}, 240_000);

afterAll(async () => { await pglite.close(); });

beforeEach(async () => {
  await testDb.delete(parEvents).where(eq(parEvents.tenantId, tenantId));
  await testDb.delete(parProjects).where(eq(parProjects.tenantId, tenantId));
  await testDb.delete(parVendors).where(eq(parVendors.tenantId, tenantId));
});

describe("POST /api/par/config-import — evenimente", () => {
  it("[blocant] importă evenimentele și le leagă de proiect (creat din mers)", async () => {
    const res = await postImport(await eventsFile([
      ["Makeathon Chișinău", "LED 3", "2026-09-10", "2026-09-12"],
      ["Bootcamp Bălți", "LED 3", "01.10.2026", "03.10.2026"],
    ]));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportBody;
    expect(body.events?.errors).toEqual([]);
    expect(body.events?.created).toBe(2);
    // Foaia a fost citită ca evenimente, nu ca proiecte (coloana „Proiect" o trăgea acolo).
    expect(body.projects.created).toBe(1);

    const rows = await testDb.select().from(parEvents).where(eq(parEvents.tenantId, tenantId));
    expect(rows).toHaveLength(2);
    const makeathon = rows.find((r) => r.name === "Makeathon Chișinău")!;
    expect(makeathon.projectId).not.toBeNull();
    expect(makeathon.startsAt?.toISOString().slice(0, 10)).toBe("2026-09-10");
    // Data în format moldovenesc e citită la fel de bine.
    const bootcamp = rows.find((r) => r.name === "Bootcamp Bălți")!;
    expect(bootcamp.startsAt?.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("re-importul aceluiași fișier actualizează, nu dublează", async () => {
    await postImport(await eventsFile([["Makeathon Chișinău", "LED 3", "2026-09-10", "2026-09-12"]]));
    const res = await postImport(await eventsFile([["Makeathon Chișinău", "LED 3", "2026-09-11", "2026-09-13"]]));
    const body = (await res.json()) as ImportBody;
    expect(body.events?.created).toBe(0);
    expect(body.events?.updated).toBe(1);

    const rows = await testDb.select().from(parEvents).where(eq(parEvents.tenantId, tenantId));
    expect(rows).toHaveLength(1);
    expect(rows[0].startsAt?.toISOString().slice(0, 10)).toBe("2026-09-11");
  });

  it("o dată necitibilă oprește rândul cu mesaj, nu tot fișierul", async () => {
    const res = await postImport(await eventsFile([
      ["Eveniment bun", "", "2026-09-10", ""],
      ["Eveniment cu dată stricată", "", "septembrie", ""],
    ]));
    const body = (await res.json()) as ImportBody;
    expect(body.events?.created).toBe(1);
    expect(body.events?.errors).toHaveLength(1);
    expect(body.events?.errors[0].message).toContain("2026-08-01");
  });
});

describe("POST /api/par/config-import — beneficiari", () => {
  it("[blocant] aduce și codul de TVA, administratorul și contactele", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Furnizori");
    ws.addRow(["Denumire beneficiar *", "IDNO / IDNP", "IBAN", "Cod TVA", "Administrator / reprezentant", "Email", "Telefon"]);
    ws.addRow(["NEWS MAKER SRL", "1014600022332", "MD03AG000000022512323419", "0301234", "Ana Popescu", "office@newsmaker.md", "+373 22 000 000"]);
    const buf = await wb.xlsx.writeBuffer();

    const res = await postImport(new File([buf], "furnizori.xlsx"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportBody;
    expect(body.vendors?.errors).toEqual([]);

    const [vendor] = await testDb
      .select()
      .from(parVendors)
      .where(and(eq(parVendors.tenantId, tenantId), eq(parVendors.name, "NEWS MAKER SRL")));
    // Codul de TVA are coloană proprie în registru; importul îl arunca înainte.
    expect(vendor.vatCode).toBe("0301234");
    expect(vendor.administratorName).toBe("Ana Popescu");
    expect(vendor.contactEmail).toBe("office@newsmaker.md");
    expect(vendor.contactPhone).toBe("+373 22 000 000");
  });
});
