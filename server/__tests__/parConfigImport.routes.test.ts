/**
 * @vitest-environment node
 *
 * POST /api/par/config-import — end-to-end against a real PGlite database.
 *
 * Regression for the 2026-08-25 live bug: a client uploaded LED.xlsx (one sheet "Sheet1",
 * columns `Cod | Denumire | Denumire proiect`, 41 grant budget lines) on the "Coduri bugetare"
 * tab. The screen stayed empty — the API answered 200 with `budgetCodes: 0 created, 0 errors`
 * because sheets were matched by NAME/POSITION only, so the single sheet was read as the
 * "Proiecte" sheet instead. Two failure modes are locked in here:
 *   1. the codes ARE imported (the action is invoked, not just the button asserted — §3.5.1quater)
 *   2. a "Cod" cell carrying the whole 100-char label is split, instead of exceeding varchar(50)
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
import { parBudgetCodes, parPayerModules, parPayers, parProjects, parVendors } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let payerId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    // Tenant admin ⇒ implicit par_admin (see requirePARRole) and unrestricted payer scope.
    c.set("user", { id: userId, tenantId, role: "admin", email: "violeta@atic.md" });
    await next();
  },
}));

import { Hono } from "hono";

let app: Hono;

/** The 41 budget lines from the real file, abbreviated to the interesting shapes. */
const LED_LINES = [
  "1.1 Director/Project Manager (50%)",
  "1.2 Project Coordinator (100%)",
  "2.1 Office supplies",
  "4.2.6.3 Logistic support national makeathon (transportation, accomodation, refreshments, materials)",
  "6.3 Banking fees LED 0.05 prc",
];

/** Rebuilds LED.xlsx: one sheet called "Sheet1", label duplicated in both columns. */
async function ledFile(): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Sheet1");
  ws.addRow(["Cod", "Denumire", "Denumire proiect"]);
  for (const label of LED_LINES) ws.addRow([label, label, "LED 3/Youth Maker club"]);
  const buf = await wb.xlsx.writeBuffer();
  return new File([buf], "LED.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

async function postImport(file: File, mapping?: unknown) {
  const form = new FormData();
  form.append("file", file);
  if (mapping !== undefined) form.append("mapping", JSON.stringify(mapping));
  return app.request("/api/par/config-import", { method: "POST", body: form });
}

async function postPreview(file: File) {
  const form = new FormData();
  form.append("file", file);
  return app.request("/api/par/config-import/preview", { method: "POST", body: form });
}

interface PreviewBody {
  sheets: {
    name: string; headers: string[]; totalRows: number; sampleRows: string[][];
    detectedKind: string | null; suggestedKind: string; suggestedMapping: Record<string, string | null>;
  }[];
  fields: Record<string, { key: string; label: string; required: boolean }[]>;
  kindLabels: Record<string, string>;
}

interface Category { created: number; updated: number; errors: { row: number; column: string; message: string }[] }
interface ImportBody {
  payers: Category; projects: Category; departments: Category; budgetCodes: Category; vendors?: Category; warnings: string[];
}

async function applyMigrations(pg: PGlite) {
  const drizzleDir = path.resolve(__dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(drizzleDir, "meta/_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string }[] };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(drizzleDir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parConfigImportRoutes } = await import("../routes/parConfigImport");
  app = new Hono();
  app.route("/api/par/config-import", parConfigImportRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-import" }).returning();
  tenantId = tenant.id;
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "violeta@atic.md", passwordHash: "x", name: "Violeta", role: "admin" })
    .returning();
  userId = u.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC" }).returning();
  payerId = payer.id;
  await testDb.insert(parPayerModules).values({ tenantId, payerId, moduleKey: "par", enabled: true });
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(parBudgetCodes).where(eq(parBudgetCodes.tenantId, tenantId));
  await testDb.delete(parProjects).where(eq(parProjects.tenantId, tenantId));
});

describe("POST /api/par/config-import — LED.xlsx (one sheet, 'Cod | Denumire | Denumire proiect')", () => {
  it("[blocant] imports every budget code instead of silently returning zero", async () => {
    const res = await postImport(await ledFile());
    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportBody;

    expect(body.budgetCodes.errors).toEqual([]);
    expect(body.budgetCodes.created).toBe(LED_LINES.length);

    const stored = await testDb.select().from(parBudgetCodes).where(eq(parBudgetCodes.tenantId, tenantId));
    expect(stored).toHaveLength(LED_LINES.length);
    expect(stored.map((r) => r.code).sort()).toEqual(["1.1", "1.2", "2.1", "4.2.6.3", "6.3"]);
  });

  it("[blocant] splits the label out of the 'Cod' column (varchar(50) would otherwise reject it)", async () => {
    await postImport(await ledFile());
    const stored = await testDb.select().from(parBudgetCodes).where(eq(parBudgetCodes.tenantId, tenantId));
    const long = stored.find((r) => r.code === "4.2.6.3");
    expect(long).toBeDefined();
    expect(long!.name).toBe(
      "Logistic support national makeathon (transportation, accomodation, refreshments, materials)"
    );
  });

  it("[blocant] does NOT import the sheet as 41 copies of a project (the old behaviour)", async () => {
    const res = await postImport(await ledFile());
    const body = (await res.json()) as ImportBody;
    // Exactly one project — created once from the "Denumire proiect" column, then reused.
    expect(body.projects.created).toBe(1);
    expect(body.projects.updated).toBe(0);

    const projects = await testDb.select().from(parProjects).where(eq(parProjects.tenantId, tenantId));
    expect(projects).toHaveLength(1);
    expect(projects[0].name).toBe("LED 3/Youth Maker club");
    expect(projects[0].payerId).toBe(payerId);
  });

  it("links every imported code to that project and to the default payer", async () => {
    await postImport(await ledFile());
    const [project] = await testDb.select().from(parProjects).where(eq(parProjects.tenantId, tenantId));
    const stored = await testDb.select().from(parBudgetCodes).where(eq(parBudgetCodes.tenantId, tenantId));
    expect(stored.every((r) => r.projectId === project.id)).toBe(true);
    expect(stored.every((r) => r.payerId === payerId)).toBe(true);
  });

  it("tells the user which sheet was read as what", async () => {
    const res = await postImport(await ledFile());
    const body = (await res.json()) as ImportBody;
    expect(body.warnings.join(" ")).toContain("Sheet1");
    expect(body.warnings.join(" ")).toContain("Coduri bugetare");
  });

  it("is idempotent — re-uploading the same file updates instead of duplicating", async () => {
    await postImport(await ledFile());
    const res = await postImport(await ledFile());
    const body = (await res.json()) as ImportBody;
    expect(body.budgetCodes.created).toBe(0);
    expect(body.budgetCodes.updated).toBe(LED_LINES.length);

    const stored = await testDb.select().from(parBudgetCodes).where(eq(parBudgetCodes.tenantId, tenantId));
    expect(stored).toHaveLength(LED_LINES.length);
  });
  it("warns when the PAR module is not enabled for the payer the rows landed on", async () => {
    // A saved row that the PAR lists filter out reads exactly like "the import didn't work" —
    // GET /api/par/budget-codes only returns codes of payers entitled to the "par" module.
    // PAR is the product default, so "not enabled" has to be an explicit enabled=false row;
    // deleting the row now means "on", which is a different scenario entirely.
    await testDb
      .update(parPayerModules)
      .set({ enabled: false })
      .where(and(eq(parPayerModules.payerId, payerId), eq(parPayerModules.moduleKey, "par")));
    try {
      const res = await postImport(await ledFile());
      const body = (await res.json()) as ImportBody;
      expect(body.budgetCodes.created).toBe(LED_LINES.length);
      expect(body.warnings.join(" ")).toContain("Modulul PAR nu este activat");
    } finally {
      await testDb
        .update(parPayerModules)
        .set({ enabled: true })
        .where(and(eq(parPayerModules.payerId, payerId), eq(parPayerModules.moduleKey, "par")));
    }
  });
});


describe("POST /api/par/config-import — the four-sheet template still works", () => {
  it("imports payers, projects, departments and budget codes from the template layout", async () => {
    const wb = new ExcelJS.Workbook();
    const p = wb.addWorksheet("Plătitori");
    p.addRow(["Denumire plătitor *", "Denumire juridică", "IDNO"]);
    p.addRow(["ATIC", "A.O. ATIC", "1010600000000"]);
    const pr = wb.addWorksheet("Proiecte");
    pr.addRow(["Denumire proiect *", "Donor / Finanțator", "Plătitor / Organizație *"]);
    pr.addRow(["LED 3", "SDC", "ATIC"]);
    const d = wb.addWorksheet("Departamente");
    d.addRow(["Denumire departament *"]);
    d.addRow(["Programe"]);
    const b = wb.addWorksheet("Coduri buget");
    b.addRow(["Cod buget *", "Denumire *", "Suma alocată (MDL)", "Plătitor / Organizație *", "Proiect (opțional)"]);
    b.addRow(["1.1", "Director", "45 000,50", "ATIC", "LED 3"]);
    const buf = await wb.xlsx.writeBuffer();

    const res = await postImport(new File([buf], "template.xlsx"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportBody;

    expect(body.payers.errors).toEqual([]);
    expect(body.projects.errors).toEqual([]);
    expect(body.departments.errors).toEqual([]);
    expect(body.budgetCodes.errors).toEqual([]);
    expect(body.projects.created).toBe(1);
    expect(body.budgetCodes.created).toBe(1);

    const [code] = await testDb.select().from(parBudgetCodes).where(eq(parBudgetCodes.tenantId, tenantId));
    // "45 000,50" MDL → cents
    expect(code.allocatedCents).toBe(4500050);
  });
});

describe("POST /api/par/config-import — datele organizației plătitoare", () => {
  it("aduce rechizitele complete ale plătitorului din fișier", async () => {
    const wb = new ExcelJS.Workbook();
    const p = wb.addWorksheet("Plătitori");
    p.addRow(["Denumire plătitor *", "Denumire juridică", "IDNO", "Cod TVA", "Adresă juridică", "Bancă", "IBAN", "Cod bancar (BIC/SWIFT)", "Semnatar", "Funcție semnatar"]);
    p.addRow([
      "Fundația Vector", "A.O. Fundația Vector", "1015600001234", "0301234",
      "str. Maria Cebotari 37, mun. Chișinău", 'BC "MAIB" S.A.',
      "md24 ag00 0225 1000 1310 4168", "AGRNMD2X885", "Ana Popescu", "Director executiv",
    ]);
    const buf = await wb.xlsx.writeBuffer();

    const res = await postImport(new File([buf], "platitori.xlsx"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportBody;
    expect(body.payers.errors).toEqual([]);

    const [row] = await testDb
      .select()
      .from(parPayers)
      .where(and(eq(parPayers.tenantId, tenantId), eq(parPayers.name, "Fundația Vector")));
    expect(row.legalName).toBe("A.O. Fundația Vector");
    expect(row.vatCode).toBe("0301234");
    expect(row.address).toBe("str. Maria Cebotari 37, mun. Chișinău");
    expect(row.bankName).toBe('BC "MAIB" S.A.');
    expect(row.iban).toBe("MD24AG000225100013104168");
    expect(row.bankCode).toBe("AGRNMD2X885");
    expect(row.directorName).toBe("Ana Popescu");
    expect(row.directorRole).toBe("Director executiv");
  });

  it("[blocant] un import fără coloanele de identitate NU șterge datele completate manual", async () => {
    // Datele există deja pe plătitor (completate în admin).
    await testDb
      .update(parPayers)
      .set({ legalName: "A.O. ATIC", idno: "1010600000000", iban: "MD24AG000225100013104168" })
      .where(eq(parPayers.id, payerId));

    const wb = new ExcelJS.Workbook();
    const p = wb.addWorksheet("Plătitori");
    p.addRow(["Denumire plătitor *"]);
    p.addRow(["ATIC"]);
    const buf = await wb.xlsx.writeBuffer();

    const res = await postImport(new File([buf], "doar-nume.xlsx"));
    expect(res.status).toBe(200);

    const [row] = await testDb.select().from(parPayers).where(eq(parPayers.id, payerId));
    // Înainte, update-ul scria null peste tot ce nu era mapat.
    expect(row.legalName).toBe("A.O. ATIC");
    expect(row.idno).toBe("1010600000000");
    expect(row.iban).toBe("MD24AG000225100013104168");
  });
});

describe("POST /api/par/config-import — unreadable files fail loudly, not silently", () => {
  it("[blocant] answers 422 with the expected headers when no sheet can be recognised", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Foaie");
    ws.addRow(["Coloana 1", "Coloana 2"]);
    ws.addRow(["x", "y"]);
    const buf = await wb.xlsx.writeBuffer();

    const res = await postImport(new File([buf], "necunoscut.xlsx"));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Cod");
    expect(body.error).toContain("Foaie");

    const stored = await testDb.select().from(parBudgetCodes).where(eq(parBudgetCodes.tenantId, tenantId));
    expect(stored).toHaveLength(0);
  });

  it("reports a too-long code as a row error rather than failing the whole file", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["Cod", "Denumire"]);
    ws.addRow(["A".repeat(60), "Cod prea lung"]); // no numeric prefix ⇒ nothing to split
    ws.addRow(["2.2", "Utility/maintenance costs"]);
    const buf = await wb.xlsx.writeBuffer();

    const res = await postImport(new File([buf], "lung.xlsx"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportBody;
    expect(body.budgetCodes.created).toBe(1);
    expect(body.budgetCodes.errors).toHaveLength(1);
    expect(body.budgetCodes.errors[0].row).toBe(2);
    expect(body.budgetCodes.errors[0].message).toContain("50");
  });
});

describe("POST /api/par/config-import/preview — the user decides, detection only suggests", () => {
  it("returns the sheet's columns, sample rows and a suggested mapping, writing nothing", async () => {
    const res = await postPreview(await ledFile());
    expect(res.status).toBe(200);
    const body = (await res.json()) as PreviewBody;

    expect(body.sheets).toHaveLength(1);
    const [sheet] = body.sheets;
    expect(sheet.name).toBe("Sheet1");
    expect(sheet.headers).toEqual(["Cod", "Denumire", "Denumire proiect"]);
    expect(sheet.totalRows).toBe(LED_LINES.length);
    expect(sheet.sampleRows[0]).toEqual([LED_LINES[0], LED_LINES[0], "LED 3/Youth Maker club"]);
    expect(sheet.suggestedKind).toBe("budgetCodes");
    expect(sheet.suggestedMapping).toMatchObject({ code: "Cod", name: "Denumire", project: "Denumire proiect" });
    expect(body.fields.budgetCodes.find((f) => f.key === "code")?.required).toBe(true);

    // Preview must not touch the database.
    const stored = await testDb.select().from(parBudgetCodes).where(eq(parBudgetCodes.tenantId, tenantId));
    expect(stored).toHaveLength(0);
  });

  it("rejects a non-xlsx file", async () => {
    const res = await postPreview(new File(["x"], "note.txt"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/par/config-import — an explicit mapping overrides detection", () => {
  it("[blocant] imports the columns the user chose, ignoring the ones left unmapped", async () => {
    const res = await postImport(await ledFile(), {
      sheets: [{ name: "Sheet1", kind: "budgetCodes", columns: { code: "Cod", name: "Denumire", project: null } }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportBody;
    expect(body.budgetCodes.created).toBe(LED_LINES.length);
    // "Denumire proiect" was deliberately not mapped → no project is created.
    expect(body.projects.created).toBe(0);

    const stored = await testDb.select().from(parBudgetCodes).where(eq(parBudgetCodes.tenantId, tenantId));
    expect(stored.every((r) => r.projectId === null)).toBe(true);
  });

  it("[blocant] honours a sheet imported as a DIFFERENT kind than detection suggested", async () => {
    const res = await postImport(await ledFile(), {
      sheets: [{ name: "Sheet1", kind: "projects", columns: { name: "Denumire proiect" } }],
    });
    const body = (await res.json()) as ImportBody;
    expect(body.budgetCodes.created).toBe(0);
    // Same project name on every row ⇒ created once, updated for the rest.
    expect(body.projects.created).toBe(1);
    expect(body.projects.updated).toBe(LED_LINES.length - 1);

    const projects = await testDb.select().from(parProjects).where(eq(parProjects.tenantId, tenantId));
    expect(projects.map((p) => p.name)).toEqual(["LED 3/Youth Maker club"]);
  });

  it("takes a field from whatever column the user points at, however odd", async () => {
    await postImport(await ledFile(), {
      sheets: [{ name: "Sheet1", kind: "budgetCodes", columns: { code: "Cod", name: "Denumire proiect" } }],
    });
    const stored = await testDb.select().from(parBudgetCodes).where(eq(parBudgetCodes.tenantId, tenantId));
    expect(stored.every((r) => r.name === "LED 3/Youth Maker club")).toBe(true);
  });

  it("skips a sheet marked 'skip' and says so", async () => {
    const res = await postImport(await ledFile(), {
      sheets: [{ name: "Sheet1", kind: "skip", columns: {} }],
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Nicio foaie");
  });

  it("rejects a malformed mapping instead of importing something unintended", async () => {
    const form = new FormData();
    form.append("file", await ledFile());
    form.append("mapping", "{not json");
    const res = await app.request("/api/par/config-import", { method: "POST", body: form });
    expect(res.status).toBe(400);

    const stored = await testDb.select().from(parBudgetCodes).where(eq(parBudgetCodes.tenantId, tenantId));
    expect(stored).toHaveLength(0);
  });

  it("imports a file whose headers mean nothing to detection, once the user maps it", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Buget 2026");
    ws.addRow(["Coloana A", "Coloana B"]);
    ws.addRow(["7.1", "Chirie sediu"]);
    ws.addRow(["7.2", "Servicii audit"]);
    const buf = await wb.xlsx.writeBuffer();

    const res = await postImport(new File([buf], "necunoscut.xlsx"), {
      sheets: [{ name: "Buget 2026", kind: "budgetCodes", columns: { code: "Coloana A", name: "Coloana B" } }],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportBody;
    expect(body.budgetCodes.created).toBe(2);

    const stored = await testDb.select().from(parBudgetCodes).where(eq(parBudgetCodes.tenantId, tenantId));
    expect(stored.map((r) => r.code).sort()).toEqual(["7.1", "7.2"]);
  });
});

/**
 * 2026-08-28: un client a încărcat furnizori_dima_iban_banca.xlsx (332 de rânduri
 * `Nume | Cod fiscal/IDNO | IBAN | Banca`) și nu avea ce alege la „Importă ca" — importul
 * știa doar de plătitori/proiecte/departamente/coduri, iar lista „Beneficiar salvat" din
 * formularul PAR (par_vendors) rămânea goală. Aici se blochează comportamentul corect.
 */
describe("POST /api/par/config-import — foaie de furnizori (par_vendors)", () => {
  async function furnizoriFile(): Promise<File> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Furnizori");
    ws.addRow(["Nume", "Cod fiscal/IDNO", "IBAN", "Banca"]);
    ws.addRow(['BC "Moldindconbank" S.A. filiala centru', "1002600028096", "MD68ML000000000467760943", "BC'Moldindconbank'S.A."]);
    ws.addRow(["MF - Trezoreria de Stat", "1006601000037", "MD83TRGAAA11122001500000", "Ministerul Finantelor"]);
    ws.addRow(["Boghean Natalia", "2005036037383", "MD49MO2259ASV55955757100", "OTP Bank S.A."]);
    const buf = await wb.xlsx.writeBuffer();
    return new File([buf], "furnizori.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
  }

  beforeEach(async () => {
    await testDb.delete(parVendors).where(eq(parVendors.tenantId, tenantId));
  });

  it("[blocant] recunoaște foaia după coloana IBAN, fără mapare manuală", async () => {
    const res = await postPreview(await furnizoriFile());
    expect(res.status).toBe(200);
    const body = (await res.json()) as PreviewBody;
    expect(body.sheets[0].detectedKind).toBe("vendors");
    expect(body.kindLabels.vendors).toBe("Beneficiari / Furnizori");
    // Coloanele fișierului real trebuie pre-selectate, altfel omul le alege pe toate manual.
    expect(body.sheets[0].suggestedMapping).toMatchObject({
      name: "Nume",
      idnp: "Cod fiscal/IDNO",
      iban: "IBAN",
      bank: "Banca",
    });
  });

  it("[blocant] scrie beneficiarii în registru, cu IBAN, cod fiscal și bancă", async () => {
    const res = await postImport(await furnizoriFile());
    expect(res.status).toBe(200);
    const body = (await res.json()) as ImportBody;
    expect(body.vendors!.errors).toEqual([]);
    expect(body.vendors!.created).toBe(3);

    const stored = await testDb.select().from(parVendors).where(eq(parVendors.tenantId, tenantId));
    expect(stored).toHaveLength(3);
    const trezoreria = stored.find((v) => v.name === "MF - Trezoreria de Stat");
    expect(trezoreria).toMatchObject({
      idnp: "1006601000037",
      iban: "MD83TRGAAA11122001500000",
      bank: "Ministerul Finantelor",
      active: true,
    });
  });

  it("[blocant] re-importul aceluiași fișier actualizează, nu dublează (dedup pe IBAN)", async () => {
    await postImport(await furnizoriFile());
    const res = await postImport(await furnizoriFile());
    const body = (await res.json()) as ImportBody;
    expect(body.vendors!.created).toBe(0);
    expect(body.vendors!.updated).toBe(3);

    const stored = await testDb.select().from(parVendors).where(eq(parVendors.tenantId, tenantId));
    expect(stored).toHaveLength(3);
  });

  it("raportează rândul fără denumire în loc să-l scrie gol", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Furnizori");
    ws.addRow(["Nume", "IBAN"]);
    ws.addRow(["", "MD11ML000000000000000001"]);
    const buf = await wb.xlsx.writeBuffer();

    const res = await postImport(new File([buf], "furnizori-goale.xlsx"));
    const body = (await res.json()) as ImportBody;
    expect(body.vendors!.created).toBe(0);
    expect(body.vendors!.errors).toHaveLength(1);
    expect(body.vendors!.errors[0].column).toBe("Denumire beneficiar");
  });
});
