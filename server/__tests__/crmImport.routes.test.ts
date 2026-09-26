/**
 * @vitest-environment node
 *
 * Importul de lead-uri din fișier, pe rutele reale.
 *
 * De ce testele astea sunt printre cele mai importante din modul: un import
 * scrie SUTE de rânduri deodată într-o bază de producție, iar greșelile lui nu
 * se văd imediat — se văd peste o săptămână, când cineva sună un client al
 * altcuiva sau când jumătate din lead-uri lipsesc din pâlnie fiindcă au căzut
 * într-o etapă care nu există.
 *
 * Fiecare test de mai jos e un mod real în care un import strică o bază:
 *  - scrie în alt workspace;
 *  - atribuie lead-uri unui om din altă firmă;
 *  - creează o etapă fantomă și ascunde lead-urile din pâlnie;
 *  - dublează baza la al doilea import al aceluiași fișier;
 *  - arată un lucru la previzualizare și scrie altul.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { and, eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users, leads, leadTags, customFields, leadFieldValues } from "../db/schema";
import { crmPipelineStages } from "../db/schema/crmPipelineStages";
import { crmCompanies, crmImportJobs, crmImportMappings } from "../db/schema/crmCompanies";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantA: string;
let tenantB: string;
let anaId: string;
let boId: string;
let currentUser: { id: string; tenantId: string; role: string; email: string };

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
  const journal = JSON.parse(fs.readFileSync(path.join(dir, "meta/_journal.json"), "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  for (const entry of journal.entries.sort((a, b) => a.idx - b.idx)) {
    const raw = fs.readFileSync(path.join(dir, `${entry.tag}.sql`), "utf8");
    for (const stmt of raw.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean)) {
      await pg.exec(stmt);
    }
  }
}

/** Cerere scurtă la rute, ca testele să citească a intenție, nu a plumbing. */
async function post(url: string, body: unknown) {
  const res = await app.request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { crmImportRoutes } = await import("../routes/crmImport");
  app = new Hono();
  app.route("/api/crm/import", crmImportRoutes);

  const [tA] = await testDb.insert(tenants).values({ name: "Alfa", slug: "alfa-import" }).returning();
  const [tB] = await testDb.insert(tenants).values({ name: "Beta", slug: "beta-import" }).returning();
  tenantA = tA.id;
  tenantB = tB.id;

  const [ana] = await testDb
    .insert(users)
    .values({ tenantId: tenantA, email: "ana@alfa.md", passwordHash: "x", name: "Ana Pop", role: "admin" })
    .returning();
  const [bo] = await testDb
    .insert(users)
    .values({ tenantId: tenantB, email: "bo@beta.md", passwordHash: "x", name: "Bo Rusu", role: "admin" })
    .returning();
  anaId = ana.id;
  boId = bo.id;
}, 240_000);

afterAll(async () => {
  await pglite.close();
});

beforeEach(async () => {
  await testDb.delete(leads);
  await testDb.delete(crmImportJobs);
  await testDb.delete(crmImportMappings);
  await testDb.delete(crmCompanies);
  currentUser = { id: anaId, tenantId: tenantA, role: "admin", email: "ana@alfa.md" };
});

const CSV_SIMPLU = ["Nume,Telefon,Email", "Ion Popescu,069391979,ion@x.md", "Maria Ionescu,069222222,maria@x.md"].join(
  "\n"
);

// ─── Izolarea între workspace-uri ────────────────────────────────────────────

describe("izolarea între workspace-uri", () => {
  it("[blocant] lead-urile importate intră DOAR în workspace-ul celui care importă", async () => {
    const res = await post("/api/crm/import/run", { text: CSV_SIMPLU });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(2);

    const inB = await testDb.select().from(leads).where(eq(leads.tenantId, tenantB));
    expect(inB).toHaveLength(0);
    const inA = await testDb.select().from(leads).where(eq(leads.tenantId, tenantA));
    expect(inA).toHaveLength(2);
  });

  it("[blocant] un responsabil dintr-un alt workspace NU primește lead-urile importate", async () => {
    // „Bo Rusu" există — dar în firma cealaltă. Un import care l-ar găsi după
    // nume ar da clienții firmei Alfa unui om din firma Beta.
    const csv = ["Nume,Telefon,Responsabil", "Ion Popescu,069391979,Bo Rusu"].join("\n");
    const res = await post("/api/crm/import/run", { text: csv });
    expect(res.body.created).toBe(1);

    const [row] = await testDb.select().from(leads).where(eq(leads.tenantId, tenantA));
    expect(row.assignedTo).toBeNull();

    // Și omul trebuie să AFLE, nu să descopere peste o lună că nimeni n-a sunat.
    const prev = await post("/api/crm/import/preview", { text: csv });
    const rows = prev.body.rows as { warnings: string[] }[];
    expect(rows[0].warnings.join(" ")).toContain("Bo Rusu");
  });

  it("un responsabil din echipa proprie e legat corect, după nume sau după email", async () => {
    const csv = [
      "Nume,Telefon,Responsabil",
      "Ion Popescu,069391979,Ana Pop",
      "Vasile Rusu,069333333,ana@alfa.md",
    ].join("\n");
    await post("/api/crm/import/run", { text: csv });

    const rows = await testDb.select().from(leads).where(eq(leads.tenantId, tenantA));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.assignedTo === anaId)).toBe(true);
  });

  it("[blocant] mapările salvate nu se văd din alt workspace", async () => {
    await post("/api/crm/import/mappings", { name: "Export CRM vechi", mapping: { 0: "full_name" } });

    currentUser = { id: boId, tenantId: tenantB, role: "admin", email: "bo@beta.md" };
    const res = await app.request("/api/crm/import/mappings");
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });
});

// ─── Previzualizarea spune adevărul ──────────────────────────────────────────

describe("previzualizarea", () => {
  it("[blocant] ce arată previzualizarea e exact ce se scrie", async () => {
    // Dacă previzualizarea ar rula alt cod decât importul, omul ar aproba un
    // lucru și s-ar scrie altul. Aici verificăm că numerele coincid.
    const csv = [
      "Nume,Telefon,Email",
      "Ion Popescu,069391979,ion@x.md",
      ",069222222,fara-nume@x.md", // eroare: lipsește numele
      "Ana Fără Contact,,", // eroare: fără telefon și fără email
      "Ion Popescu,069391979,ion@x.md", // repetat în fișier
    ].join("\n");

    const prev = await post("/api/crm/import/preview", { text: csv });
    const counts = prev.body.counts as Record<string, number>;
    expect(counts.total).toBe(4);
    expect(counts.errors).toBe(2);
    expect(counts.duplicatesInFile).toBe(1);

    const run = await post("/api/crm/import/run", { text: csv });
    expect(run.body.counts).toEqual(counts);
    expect(run.body.created).toBe(1);
    expect(run.body.skipped).toBe(3);
  });

  it("[blocant] numărul de pe buton e exact câte lead-uri se scriu", async () => {
    // Interfața afișează `importableNew` pe buton („Importă N lead-uri"). Dacă
    // numărul ăla s-ar despărți de ce scrie `/run`, omul ar aproba o cifră și
    // ar primi alta — într-o bază reală, ireversibil.
    const csv = [
      "Nume,Telefon,Email",
      "Ion Popescu,069391979,ion@x.md",
      ",069222222,fara-nume@x.md",
      "Ion Popescu,069391979,ion@x.md",
      "Vasile Rusu,069333333,vasile@x.md",
    ].join("\n");

    const prev = await post("/api/crm/import/preview", { text: csv });
    const counts = prev.body.counts as Record<string, number>;

    const run = await post("/api/crm/import/run", { text: csv, skipDuplicates: true });
    expect(run.body.created).toBe(counts.importableNew);
  });

  it("fără «sari peste duplicate», butonul arată celălalt număr — și tot el se scrie", async () => {
    const csv = ["Nume,Telefon", "Ion Popescu,069391979", "Ion Popescu,069391979"].join("\n");
    const prev = await post("/api/crm/import/preview", { text: csv });
    const counts = prev.body.counts as Record<string, number>;

    const run = await post("/api/crm/import/run", { text: csv, skipDuplicates: false });
    expect(run.body.created).toBe(counts.importableAll);
  });

  it("previzualizarea NU scrie nimic în bază", async () => {
    await post("/api/crm/import/preview", { text: CSV_SIMPLU });
    const rows = await testDb.select().from(leads);
    expect(rows).toHaveLength(0);
  });

  it("propune singură maparea coloanelor din antetul fișierului", async () => {
    const prev = await post("/api/crm/import/preview", { text: CSV_SIMPLU });
    expect(prev.body.mapping).toMatchObject({ 0: "full_name", 1: "phone", 2: "email" });
  });

  it("recunoaște fișierele cu punct-și-virgulă, cum le dă Excel-ul în română", async () => {
    const csv = ["Nume;Telefon;Email", "Ion Popescu;069391979;ion@x.md"].join("\n");
    const prev = await post("/api/crm/import/preview", { text: csv });
    expect(prev.body.delimiter).toBe(";");
    expect((prev.body.counts as Record<string, number>).valid).toBe(1);
  });

  it("maparea trimisă de om învinge propunerea automată", async () => {
    // Antet înșelător: coloana zisă „Telefon" conține de fapt emailuri.
    const csv = ["Nume,Telefon", "Ion Popescu,ion@x.md"].join("\n");
    const prev = await post("/api/crm/import/preview", {
      text: csv,
      mapping: { 0: "full_name", 1: "email" },
    });
    const rows = prev.body.rows as { draft: { email: string | null; phone: string | null } }[];
    expect(rows[0].draft.email).toBe("ion@x.md");
    expect(rows[0].draft.phone).toBeNull();
  });
});

// ─── Etape, surse, valori ────────────────────────────────────────────────────

describe("traducerea valorilor din fișier", () => {
  it("[blocant] o etapă necunoscută NU ascunde lead-ul din pâlnie", async () => {
    // Capcana: `stage` e text liber în bază. Un „Negociere" din fișier ar intra
    // ca atare, iar lead-ul n-ar apărea în nicio coloană a pâlniei — există în
    // bază, dar nu-l vede nimeni.
    const csv = ["Nume,Telefon,Etapa", "Ion Popescu,069391979,Negociere avansată"].join("\n");
    const res = await post("/api/crm/import/run", { text: csv });
    expect(res.body.created).toBe(1);

    const [row] = await testDb.select().from(leads).where(eq(leads.tenantId, tenantA));
    const stages = await testDb
      .select({ key: crmPipelineStages.key })
      .from(crmPipelineStages)
      .where(eq(crmPipelineStages.tenantId, tenantA));
    expect(stages.map((s) => s.key)).toContain(row.stage);
  });

  it("o etapă scrisă cu eticheta din pâlnie e recunoscută", async () => {
    const csv = ["Nume,Telefon,Etapa", "Ion Popescu,069391979,Contactat"].join("\n");
    await post("/api/crm/import/run", { text: csv });
    const [row] = await testDb.select().from(leads).where(eq(leads.tenantId, tenantA));
    expect(row.stage).toBe("contacted");
  });

  it("[blocant] o sursă necunoscută nu face importul să pice", async () => {
    // `source` e enum în Postgres: o valoare din afara listei ar arunca tot
    // INSERT-ul, deci tot fișierul, pe o singură coloană opțională.
    const csv = ["Nume,Telefon,Sursa", "Ion Popescu,069391979,Târg de firme Chișinău"].join("\n");
    const res = await post("/api/crm/import/run", { text: csv });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(1);
    const [row] = await testDb.select().from(leads);
    expect(row.source).toBe("other");
  });

  it("suma scrisă cu virgulă zecimală și separator de mii ajunge corect în cenți", async () => {
    const csv = ["Nume,Telefon,Valoare", 'Ion Popescu,069391979,"12.500,50"'].join("\n");
    await post("/api/crm/import/run", { text: csv });
    const [row] = await testDb.select().from(leads);
    expect(row.valueCents).toBe(1_250_050);
  });
});

// ─── Duplicate ───────────────────────────────────────────────────────────────

describe("duplicate", () => {
  it("[blocant] importul aceluiași fișier a doua oară nu dublează baza", async () => {
    await post("/api/crm/import/run", { text: CSV_SIMPLU });
    const second = await post("/api/crm/import/run", { text: CSV_SIMPLU });

    expect(second.body.created).toBe(0);
    expect(second.body.skipped).toBe(2);
    const rows = await testDb.select().from(leads).where(eq(leads.tenantId, tenantA));
    expect(rows).toHaveLength(2);
  });

  it("un lead existent în ALT workspace nu blochează importul în al meu", async () => {
    await testDb.insert(leads).values({
      tenantId: tenantB,
      fullName: "Ion Popescu",
      stage: "new",
      phone: "069391979",
      phoneNormalized: "69391979",
    });

    const res = await post("/api/crm/import/run", { text: CSV_SIMPLU });
    expect(res.body.created).toBe(2);
  });

  it("același om scris cu telefon internațional și local se importă o singură dată", async () => {
    const csv = ["Nume,Telefon", "Ion Popescu,+373 69 39 19 79", "Ion Popescu,069391979"].join("\n");
    const res = await post("/api/crm/import/run", { text: csv });
    expect(res.body.created).toBe(1);
  });

  it("cu `skipDuplicates: false` omul poate insista, dar decide explicit", async () => {
    await post("/api/crm/import/run", { text: CSV_SIMPLU });
    const again = await post("/api/crm/import/run", { text: CSV_SIMPLU, skipDuplicates: false });
    expect(again.body.created).toBe(2);
  });
});

// ─── Firme ───────────────────────────────────────────────────────────────────

describe("firmele din fișier", () => {
  it("firma devine fișă de firmă, iar lead-ul e legat de ea", async () => {
    const csv = ["Nume,Telefon,Companie", "Ion Popescu,069391979,Agro Nord SRL"].join("\n");
    await post("/api/crm/import/run", { text: csv });

    const [company] = await testDb.select().from(crmCompanies).where(eq(crmCompanies.tenantId, tenantA));
    expect(company?.name).toBe("Agro Nord SRL");
    const [lead] = await testDb.select().from(leads).where(eq(leads.tenantId, tenantA));
    expect(lead.companyId).toBe(company.id);
    // Textul rămâne și pe lead, ca afișare de rezervă — exact ca în sursă.
    expect(lead.company).toBe("Agro Nord SRL");
  });

  it("două lead-uri de la aceeași firmă nu creează două fișe", async () => {
    const csv = [
      "Nume,Telefon,Companie",
      "Ion Popescu,069391979,Agro Nord SRL",
      "Maria Ionescu,069222222,  agro nord srl ",
    ].join("\n");
    await post("/api/crm/import/run", { text: csv });

    const companies = await testDb.select().from(crmCompanies).where(eq(crmCompanies.tenantId, tenantA));
    expect(companies).toHaveLength(1);
    const rows = await testDb.select().from(leads).where(eq(leads.tenantId, tenantA));
    expect(new Set(rows.map((r) => r.companyId)).size).toBe(1);
  });

  it("firmografia din fișier ajunge pe fișa firmei, nu se pierde", async () => {
    // `leads` nu are coloane de industrie/regiune/consum — `crm_companies` are.
    const csv = [
      "Nume,Telefon,Companie,Industrie,Regiune,Consum anual",
      "Ion Popescu,069391979,Agro Nord SRL,Agricultură,Nord,145000",
    ].join("\n");
    await post("/api/crm/import/run", { text: csv });

    const [company] = await testDb.select().from(crmCompanies).where(eq(crmCompanies.tenantId, tenantA));
    expect(company.industry).toBe("Agricultură");
    expect(company.region).toBe("Nord");
    expect(Number(company.annualConsumptionKwh)).toBe(145000);
  });

  it("[blocant] un import nu rescrie o fișă de firmă completată de om", async () => {
    const [existing] = await testDb
      .insert(crmCompanies)
      .values({
        tenantId: tenantA,
        name: "Agro Nord SRL",
        nameNormalized: "agro nord srl",
        industry: "Agricultură ecologică",
      })
      .returning();

    const csv = ["Nume,Telefon,Companie,Industrie", "Ion Popescu,069391979,Agro Nord SRL,altceva"].join("\n");
    await post("/api/crm/import/run", { text: csv });

    const [after] = await testDb.select().from(crmCompanies).where(eq(crmCompanies.id, existing.id));
    expect(after.industry).toBe("Agricultură ecologică");
  });
});

// ─── Jurnal și mapări ────────────────────────────────────────────────────────

describe("jurnalul importurilor", () => {
  it("reține cine a importat, ce fișier și cu ce rezultat", async () => {
    const csv = ["Nume,Telefon", "Ion Popescu,069391979", ",069222222"].join("\n");
    await post("/api/crm/import/run", { text: csv, fileName: "clienti-septembrie.csv" });

    const [job] = await testDb.select().from(crmImportJobs).where(eq(crmImportJobs.tenantId, tenantA));
    expect(job.fileName).toBe("clienti-septembrie.csv");
    expect(job.createdCount).toBe(1);
    expect(job.errorCount).toBe(1);
    expect(job.createdBy).toBe(anaId);

    const res = await app.request("/api/crm/import/jobs");
    const body = (await res.json()) as { items: { fileName: string; createdByName: string }[] };
    expect(body.items[0].fileName).toBe("clienti-septembrie.csv");
    expect(body.items[0].createdByName).toBe("Ana Pop");
  });

  it("[blocant] istoricul unui workspace nu se vede din altul", async () => {
    await post("/api/crm/import/run", { text: CSV_SIMPLU, fileName: "secret-alfa.csv" });

    currentUser = { id: boId, tenantId: tenantB, role: "admin", email: "bo@beta.md" };
    const res = await app.request("/api/crm/import/jobs");
    expect(JSON.stringify(await res.json())).not.toContain("secret-alfa");
  });

  it("o mapare salvată de două ori cu același nume se actualizează, nu se dublează", async () => {
    await post("/api/crm/import/mappings", { name: "Export vechi", mapping: { 0: "full_name" } });
    await post("/api/crm/import/mappings", { name: "Export vechi", mapping: { 0: "full_name", 1: "phone" } });

    const rows = await testDb
      .select()
      .from(crmImportMappings)
      .where(and(eq(crmImportMappings.tenantId, tenantA), eq(crmImportMappings.name, "Export vechi")));
    expect(rows).toHaveLength(1);
    expect(rows[0].mapping).toMatchObject({ 0: "full_name", 1: "phone" });
  });
});

// ─── CC-1: orice coloană are unde ateriza ────────────────────────────────────

describe("CC-1 — coloane arbitrare: cod fiscal, etichete, câmpuri personalizate", () => {
  /** Creează o definiție de câmp personalizat direct în bază (ruta ei e testată separat). */
  async function makeField(label: string, key: string) {
    const [row] = await testDb
      .insert(customFields)
      .values({ tenantId: tenantA, key, label })
      .returning();
    return row;
  }

  beforeEach(async () => {
    await testDb.delete(leadFieldValues);
    await testDb.delete(leadTags);
    await testDb.delete(customFields);
  });

  it("[blocant] codul fiscal din fișier ajunge pe fișa firmei, normalizat", async () => {
    const csv = ["Denumire,IDNO,Telefon", "SRL Alfa,MD 1003-600-012345,069391979"].join("\n");
    const res = await post("/api/crm/import/run", { text: csv, mapping: { 0: "company", 1: "idno", 2: "phone" } });
    expect(res.body.created).toBe(1);

    const [firma] = await testDb.select().from(crmCompanies).where(eq(crmCompanies.tenantId, tenantA));
    // IDNO-ul moldovenesc are 13 cifre; prefixul „MD" nu face parte din cod (altfel „MD 100…" și „100…" erau două firme).
    expect(firma.idno).toBe("1003600012345");
  });

  it("[blocant] aceeași firmă cu ALT nume, dar același cod fiscal, nu se dublează", async () => {
    // Exact cazul care strică o bază de outreach: „SRL Alfa" azi, „Alfa S.R.L." în lista
    // cumpărată luna viitoare. Fără cod fiscal ar fi două firme și doi agenți care sună.
    await post("/api/crm/import/run", {
      text: ["Denumire,IDNO,Telefon", "SRL Alfa,1003600012345,069391979"].join("\n"),
      mapping: { 0: "company", 1: "idno", 2: "phone" },
    });
    await post("/api/crm/import/run", {
      text: ["Denumire,IDNO,Telefon", "Alfa S.R.L.,1003-600-012345,069111111"].join("\n"),
      mapping: { 0: "company", 1: "idno", 2: "phone" },
    });

    const firme = await testDb.select().from(crmCompanies).where(eq(crmCompanies.tenantId, tenantA));
    expect(firme).toHaveLength(1);
  });

  it("[blocant] un rând cu cod fiscal deja existent e raportat ca duplicat, nu importat tăcut", async () => {
    const csv = ["Denumire,IDNO,Telefon", "SRL Alfa,1003600012345,069391979"].join("\n");
    const mapping = { 0: "company", 1: "idno", 2: "phone" };
    await post("/api/crm/import/run", { text: csv, mapping });

    // Al doilea fișier: alt telefon, alt nume — dar aceeași firmă.
    const prev = await post("/api/crm/import/preview", {
      text: ["Denumire,IDNO,Telefon", "Alfa SRL,1003600012345,069555555"].join("\n"),
      mapping,
    });
    const rows = prev.body.rows as { status: string }[];
    expect(rows[0].status).toBe("duplicate_in_db");
  });

  it("[blocant] o coloană mapată pe „Etichetă\" devine etichete pe lead, una pentru fiecare valoare", async () => {
    const csv = ["Nume,Telefon,Segmente", "Ion Popescu,069391979,\"alimentar; retail\""].join("\n");
    await post("/api/crm/import/run", { text: csv, mapping: { 0: "full_name", 1: "phone", 2: "tag" } });

    const tags = await testDb.select().from(leadTags).where(eq(leadTags.tenantId, tenantA));
    expect(tags.map((t) => t.tag).sort()).toEqual(["alimentar", "retail"]);
  });

  it("[blocant] o coloană mapată pe un câmp personalizat se scrie ca valoare pe lead", async () => {
    const camp = await makeField("Cod CAEN", "cod_caen");
    const csv = ["Nume,Telefon,Cod CAEN", "Ion Popescu,069391979,4711"].join("\n");
    await post("/api/crm/import/run", {
      text: csv,
      mapping: { 0: "full_name", 1: "phone", 2: "cf:cod_caen" },
    });

    const values = await testDb.select().from(leadFieldValues).where(eq(leadFieldValues.tenantId, tenantA));
    expect(values).toHaveLength(1);
    expect(values[0].fieldId).toBe(camp.id);
    expect(values[0].value).toBe("4711");
  });

  it("propunerea de mapare recunoaște singură un câmp personalizat după eticheta lui", async () => {
    await makeField("Cod CAEN", "cod_caen");
    const prev = await post("/api/crm/import/preview", {
      text: ["Nume,Telefon,Cod CAEN", "Ion Popescu,069391979,4711"].join("\n"),
    });
    expect((prev.body.mapping as Record<number, string>)[2]).toBe("cf:cod_caen");
    expect(prev.body.customFields).toEqual([{ id: expect.any(String), key: "cod_caen", label: "Cod CAEN" }]);
  });

  it("[blocant] un câmp personalizat ȘTERS nu rupe importul — coloana lui se ignoră, cu avertisment", async () => {
    // Cazul real: o mapare salvată acum două luni, pe un câmp pe care cineva l-a șters între timp.
    const prev = await post("/api/crm/import/preview", {
      text: ["Nume,Telefon,Cod CAEN", "Ion Popescu,069391979,4711"].join("\n"),
      mapping: { 0: "full_name", 1: "phone", 2: "cf:camp_disparut" },
    });
    expect(prev.status).toBe(200);
    expect((prev.body.mapping as Record<number, string>)[2]).toBe("ignore");
    const rows = prev.body.rows as { warnings: string[] }[];
    expect(rows[0].warnings.join(" ")).toContain("camp_disparut");
  });

  it("[blocant] o țintă inventată e respinsă, nu salvată într-o mapare pe care nimeni n-o mai poate citi", async () => {
    const res = await post("/api/crm/import/preview", {
      text: ["Nume,Telefon", "Ion Popescu,069391979"].join("\n"),
      mapping: { 0: "full_name", 1: "inventat" },
    });
    expect(res.status).toBe(400);
  });

  it("„Circuit\" nu e citit drept cod fiscal fiindcă are „cui\" în el", async () => {
    // Potrivirea pe subșir ar fi pus coloana greșită pe fișa firmei — de aceea cuvintele scurte
    // se cer ca whole word.
    const prev = await post("/api/crm/import/preview", {
      text: ["Nume,Telefon,Circuit", "Ion Popescu,069391979,A12"].join("\n"),
    });
    expect((prev.body.mapping as Record<number, string>)[2]).not.toBe("idno");
  });

  it("etichetele și valorile personalizate ale unui workspace nu ajung în altul", async () => {
    await makeField("Cod CAEN", "cod_caen");
    currentUser = { id: boId, tenantId: tenantB, role: "admin", email: "bo@beta.md" };
    await post("/api/crm/import/run", {
      text: ["Nume,Telefon,Segmente", "Ion Popescu,069391979,alimentar"].join("\n"),
      mapping: { 0: "full_name", 1: "phone", 2: "tag" },
    });

    const inA = await testDb.select().from(leadTags).where(eq(leadTags.tenantId, tenantA));
    expect(inA).toHaveLength(0);
    const inB = await testDb.select().from(leadTags).where(eq(leadTags.tenantId, tenantB));
    expect(inB).toHaveLength(1);
  });
});
