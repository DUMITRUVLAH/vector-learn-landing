/**
 * @vitest-environment node
 * Copia patentei beneficiarului — INTEGRATION (rute reale, PGlite, toate migrările).
 *
 * Owner, 23.09.2026: „La atașarea patentei trebuie bifă sau confirmare că s-a încărcat — acum
 * pui, dar nu e clar dacă s-a pus sau nu. […] Dacă e încărcată pentru o persoană, patenta să fie
 * salvată în sistem până la data X când e valabilă și s-o poți deschide direct când faci PAR."
 *
 * Cauza: „Încarcă patenta" trimitea actul doar la citirea AI; fișierul se arunca. Ce blochează
 * testul, în ordinea riscului:
 *  - copia chiar se păstrează pe cerere și se poate DESCHIDE (acțiunea, nu butonul — §3.5.1quater);
 *  - la trimitere, copia trece pe beneficiarul salvat, iar următoarea cerere o preia din registru;
 *  - o copie mai veche nu dă afară din registru patenta prelungită;
 *  - termenul nou tastat pe o cerere cu beneficiar salvat NU mai e rescris de registru la salvare
 *    (bugul găsit pe drum: aprobatorul primea „patenta a EXPIRAT" pe o patentă prelungită);
 *  - patenta e act personal: cine nu vede IDNP-ul beneficiarului nu vede nici copia.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parRequests, parMembers, parPayerModules, parPayers, parVendors } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let otherTenantId: string;
let payerId: string;
let authorId: string;
let financeId: string;
let colleagueId: string;
/** Cine „e logat" la cererea curentă — testele schimbă utilizatorul între pași. */
let currentUser: { id: string; role: string };

const storage = new Map<string, Buffer>();
const removed: string[] = [];

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: currentUser.id, tenantId, role: currentUser.role, email: "x@ong.md" });
    await next();
  },
}));

vi.mock("../lib/storage/objectStore", () => ({
  signUploads: async (_bucket: string, tid: string, files: { fileName: string }[]) =>
    files.map((f, i) => ({
      fileName: f.fileName,
      path: `${tid}/17000000${storage.size}${i}-abcdef-${f.fileName.replace(/[^\w.\- ]+/g, "_")}`,
      signedUrl: `https://storage.test/upload/${tid}`,
    })),
  downloadObject: async (_bucket: string, p: string) => {
    const b = storage.get(p);
    if (!b) throw new Error("download_failed_404");
    return b;
  },
  removeObjects: async (_bucket: string, paths: string[]) => {
    for (const p of paths) {
      removed.push(p);
      storage.delete(p);
    }
  },
  uploadObject: async (_bucket: string, p: string, bytes: Buffer) => {
    storage.set(p, bytes);
  },
  buildObjectPath: (tid: string, name: string) => `${tid}/1700000000-abcdef-${name}`,
  isStorageConfigured: () => true,
}));

vi.mock("../lib/ai/readUploadedDoc", () => ({
  readUploadedDoc: async () => ({ rawText: "", imageDataUrl: null, fileDataUrl: null }),
}));

import { Hono } from "hono";
let app: Hono;

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

const PDF = (label: string) => Buffer.from(`%PDF-1.7\n% patenta ${label}\n`);
const json = (method: string, url: string, body?: unknown) =>
  app.request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

let seq = 0;
async function newDraft(overrides: Partial<typeof parRequests.$inferInsert> = {}): Promise<string> {
  seq += 1;
  const [row] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      requestNo: `PAR-2026-77${String(seq).padStart(2, "0")}`,
      requestedByUserId: authorId,
      purpose: "execute_payment",
      chargeTo: "program",
      status: "draft",
      payerId,
      endUse: "Servicii de traducere",
      currency: "MDL",
      totalEstimatedCents: 150000,
      dateOfRequest: new Date("2026-09-23T00:00:00Z"),
      payeeName: "Boghean Natalia",
      payeeType: "fizic",
      payeeIdnp: "2005036037383",
      payeeIban: "MD49MO2259ASV55555555555",
      ...overrides,
    })
    .returning();
  return row.id;
}

/** Tot drumul din browser: semnare → PUT în Storage → finalizare. Întoarce răspunsul finalize. */
async function uploadPatent(parId: string, bytes: Buffer, fileName = "patenta.pdf", mime = "application/pdf") {
  const signRes = await json("POST", `/api/par/${parId}/payee-patent/sign`, {
    file_name: fileName,
    mime,
    size_bytes: bytes.byteLength,
  });
  expect(signRes.status).toBe(200);
  const { path: objectPath } = (await signRes.json()) as { path: string };
  storage.set(objectPath, bytes);
  const res = await json("POST", `/api/par/${parId}/payee-patent/finalize`, { path: objectPath, file_name: fileName, mime });
  return { res, objectPath };
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const [{ parRoutes }, { parVendorsRoutes }, { parPayeePatentRoutes }] = await Promise.all([
    import("../routes/par"),
    import("../routes/parVendors"),
    import("../routes/parPayeePatent"),
  ]);
  app = new Hono();
  app.route("/api/par/vendors", parVendorsRoutes);
  app.route("/api/par", parRoutes);
  app.route("/api/par", parPayeePatentRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ONG", slug: "ong-patenta" }).returning();
  tenantId = tenant.id;
  const [other] = await testDb.insert(tenants).values({ name: "Alt ONG", slug: "alt-ong-patenta" }).returning();
  otherTenantId = other.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ONG" }).returning();
  payerId = payer.id;
  await testDb.insert(parPayerModules).values({ tenantId, payerId, moduleKey: "par", enabled: true });

  const mk = async (email: string, role: string, parRole: string) => {
    const [u] = await testDb
      .insert(users)
      .values({ tenantId, email, passwordHash: "x", name: email, role: role as typeof users.$inferInsert.role })
      .returning();
    await testDb.insert(parMembers).values({ tenantId, userId: u.id, role: parRole as "requestor" });
    return u.id;
  };
  authorId = await mk("autor@ong.md", "manager", "requestor");
  financeId = await mk("finante@ong.md", "admin", "finance");
  // Rol de tenant obișnuit: „manager"/„admin" primesc implicit par_admin și văd oricum beneficiarul.
  colleagueId = await mk("coleg@ong.md", "teacher", "requestor");
  currentUser = { id: authorId, role: "manager" };
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Copia patentei pe cerere", () => {
  it("[blocant] patenta încărcată se păstrează pe cerere și confirmă numele + mărimea", async () => {
    currentUser = { id: authorId, role: "manager" };
    const parId = await newDraft();
    const bytes = PDF("AP2022613060671");
    const { res, objectPath } = await uploadPatent(parId, bytes, "patenta Boghean.pdf");

    expect(res.status).toBe(201);
    const body = (await res.json()) as { payeePatentFileName: string; payeePatentFileSize: number; payeePatentFileUploadedAt: string };
    expect(body.payeePatentFileName).toBe("patenta Boghean.pdf");
    expect(body.payeePatentFileSize).toBe(bytes.byteLength);
    expect(body.payeePatentFileUploadedAt).toBeTruthy();

    const [row] = await testDb.select().from(parRequests).where(eq(parRequests.id, parId));
    expect(row.payeePatentFilePath).toBe(objectPath);
    expect(row.payeeIsPatentHolder).toBe(true);

    // Fișa cererii (ce citește formularul la redeschidere) poartă copia.
    const detail = (await (await json("GET", `/api/par/${parId}`)).json()) as { payeePatentFileName?: string };
    expect(detail.payeePatentFileName).toBe("patenta Boghean.pdf");
  });

  it("[blocant] copia se DESCHIDE — ruta servește exact octeții urcați, inline", async () => {
    currentUser = { id: authorId, role: "manager" };
    const parId = await newDraft();
    const bytes = PDF("deschide");
    await uploadPatent(parId, bytes, "patenta.pdf");

    const res = await app.request(`/api/par/${parId}/payee-patent`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toMatch(/^inline;/);
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
  });

  it("[blocant] un „PDF” care nu e PDF e refuzat și șters din Storage", async () => {
    currentUser = { id: authorId, role: "manager" };
    const parId = await newDraft();
    const { res, objectPath } = await uploadPatent(parId, Buffer.from("MZ not a pdf at all"), "patenta.pdf");
    expect(res.status).toBe(400);
    expect(removed).toContain(objectPath);
    const [row] = await testDb.select().from(parRequests).where(eq(parRequests.id, parId));
    expect(row.payeePatentFilePath).toBeNull();
  });

  it("refuză un Word ca patentă — copia trebuie să se poată deschide pe loc", async () => {
    currentUser = { id: authorId, role: "manager" };
    const parId = await newDraft();
    const res = await json("POST", `/api/par/${parId}/payee-patent/sign`, {
      file_name: "patenta.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      size_bytes: 1000,
    });
    expect(res.status).toBe(400);
  });

  it("refuză o cale din alt tenant la finalizare", async () => {
    currentUser = { id: authorId, role: "manager" };
    const parId = await newDraft();
    const foreign = `${otherTenantId}/1700000000-abcdef-patenta.pdf`;
    storage.set(foreign, PDF("străin"));
    const res = await json("POST", `/api/par/${parId}/payee-patent/finalize`, {
      path: foreign,
      file_name: "patenta.pdf",
      mime: "application/pdf",
    });
    expect(res.status).toBe(400);
  });

  it("doar autorul, și doar cât cererea e editabilă, încarcă patenta", async () => {
    currentUser = { id: colleagueId, role: "teacher" };
    const parId = await newDraft();
    const asColleague = await json("POST", `/api/par/${parId}/payee-patent/sign`, {
      file_name: "p.pdf", mime: "application/pdf", size_bytes: 10,
    });
    expect(asColleague.status).toBe(404);

    currentUser = { id: authorId, role: "manager" };
    const submitted = await newDraft({ status: "pending_approval" });
    const late = await json("POST", `/api/par/${submitted}/payee-patent/sign`, {
      file_name: "p.pdf", mime: "application/pdf", size_bytes: 10,
    });
    expect(late.status).toBe(403);
  });

  it("[blocant] GDPR: finanțele deschid copia, un coleg fără rol elevat nu", async () => {
    currentUser = { id: authorId, role: "manager" };
    const parId = await newDraft();
    await uploadPatent(parId, PDF("gdpr"));
    await testDb.update(parRequests).set({ status: "pending_approval" }).where(eq(parRequests.id, parId));

    currentUser = { id: financeId, role: "admin" };
    expect((await app.request(`/api/par/${parId}/payee-patent`)).status).toBe(200);

    currentUser = { id: colleagueId, role: "teacher" };
    expect((await app.request(`/api/par/${parId}/payee-patent`)).status).toBe(404);
  });
});

describe("Patenta salvată pe beneficiar", () => {
  it("[blocant] la trimitere copia trece în registru, iar următoarea cerere o preia și o deschide", async () => {
    currentUser = { id: authorId, role: "manager" };
    const first = await newDraft({
      payeeIsPatentHolder: true,
      payeePatentSeries: "AP 2022613060671",
      payeePatentValidUntil: "2027-01-01",
    });
    const bytes = PDF("registru");
    const { objectPath } = await uploadPatent(first, bytes, "patenta Natalia.pdf");

    const { autosaveVendorFromPar } = await import("../lib/par/vendorAutoSave");
    const saved = await autosaveVendorFromPar(first, tenantId);
    expect(saved.vendorId).toBeTruthy();
    const [vendor] = await testDb.select().from(parVendors).where(eq(parVendors.id, saved.vendorId!));
    expect(vendor.patentFilePath).toBe(objectPath);
    expect(vendor.patentFileName).toBe("patenta Natalia.pdf");
    expect(vendor.patentValidUntil).toBe("2027-01-01");

    // Lista de beneficiari (din care alege formularul) spune că există copie.
    const list = (await (await json("GET", "/api/par/vendors")).json()) as { vendors: { id: string; patentFileName?: string }[] };
    expect(list.vendors.find((v) => v.id === vendor.id)?.patentFileName).toBe("patenta Natalia.pdf");

    // Copia se deschide din registru — înainte ca noua cerere s-o fi preluat.
    const fromRegistry = await app.request(`/api/par/vendors/${vendor.id}/patent`);
    expect(fromRegistry.status).toBe(200);
    expect(Buffer.from(await fromRegistry.arrayBuffer()).equals(bytes)).toBe(true);

    // Cererea nouă alege beneficiarul salvat → preia copia fără s-o mai ceară.
    const second = await newDraft({ payeeName: null, payeeIban: null, payeeIdnp: null });
    const patched = await json("PATCH", `/api/par/${second}`, {
      vendor_id: vendor.id,
      payee_patent_file: { from_vendor: vendor.id },
    });
    expect(patched.status).toBe(200);
    const opened = await app.request(`/api/par/${second}/payee-patent`);
    expect(opened.status).toBe(200);
    expect(Buffer.from(await opened.arrayBuffer()).equals(bytes)).toBe(true);

    // „Scoate copia" (sau alt beneficiar) lasă cererea fără — registrul rămâne neatins.
    await json("PATCH", `/api/par/${second}`, { payee_patent_file: "none" });
    expect((await app.request(`/api/par/${second}/payee-patent`)).status).toBe(404);
    const [still] = await testDb.select().from(parVendors).where(eq(parVendors.id, vendor.id));
    expect(still.patentFilePath).toBe(objectPath);
  });

  it("[blocant] o copie mai VECHE nu dă afară din registru patenta prelungită", async () => {
    currentUser = { id: authorId, role: "manager" };
    const [vendor] = await testDb
      .insert(parVendors)
      .values({
        tenantId,
        name: "Ion Prelungit",
        kind: "individual",
        isPatentHolder: true,
        patentSeries: "AA 0000001",
        patentValidUntil: "2026-12-31",
        patentFilePath: `${tenantId}/1700000000-abcdef-noua.pdf`,
        patentFileName: "noua.pdf",
        patentFileMime: "application/pdf",
        patentFileSize: 10,
      })
      .returning();
    const old = await newDraft({
      vendorId: vendor.id,
      payeeName: "Ion Prelungit",
      payeeIsPatentHolder: true,
      payeePatentSeries: "AA 0000001",
      payeePatentValidUntil: "2026-06-30",
    });
    await uploadPatent(old, PDF("veche"), "veche.pdf");

    const { autosaveVendorFromPar } = await import("../lib/par/vendorAutoSave");
    await autosaveVendorFromPar(old, tenantId);
    const [after] = await testDb.select().from(parVendors).where(eq(parVendors.id, vendor.id));
    expect(after.patentFileName).toBe("noua.pdf");
    expect(after.patentValidUntil).toBe("2026-12-31");
  });

  it("[blocant] termenul nou tastat pe o cerere cu beneficiar salvat nu e rescris de registru", async () => {
    currentUser = { id: authorId, role: "manager" };
    const [vendor] = await testDb
      .insert(parVendors)
      .values({
        tenantId,
        name: "Maria Expirată",
        kind: "individual",
        isPatentHolder: true,
        patentSeries: "AB 1111111",
        patentValidUntil: "2026-08-31",
      })
      .returning();
    const parId = await newDraft();
    // Formularul trimite vendor_id la FIECARE salvare, împreună cu ce se vede în câmpuri.
    const res = await json("PATCH", `/api/par/${parId}`, {
      vendor_id: vendor.id,
      payee_is_patent_holder: true,
      payee_patent_series: "AB 2222222",
      payee_patent_valid_until: "2027-02-28",
    });
    expect(res.status).toBe(200);
    const [row] = await testDb.select().from(parRequests).where(eq(parRequests.id, parId));
    expect(row.payeePatentValidUntil).toBe("2027-02-28");
    expect(row.payeePatentSeries).toBe("AB 2222222");

    // Fără câmpurile patentei în corp, registrul completează în continuare (alți clienți ai API-ului).
    const bare = await newDraft();
    await json("PATCH", `/api/par/${bare}`, { vendor_id: vendor.id });
    const [snap] = await testDb.select().from(parRequests).where(eq(parRequests.id, bare));
    expect(snap.payeePatentValidUntil).toBe("2026-08-31");
  });
});

/**
 * Găsit la verificarea în browser a patentei (23.09.2026): după „Salvează ciornă", ciorna
 * redeschisă nu mai avea beneficiar. Formularul face un `PATCH {}` după antet, iar `.transform()`
 * de pe `payee_name`/`payee_bank` transforma câmpul LIPSĂ în `null` — deci îl ștergea.
 */
describe("PATCH parțial nu șterge beneficiarul", () => {
  it("[blocant] un PATCH fără payee_name / payee_bank lasă numele și banca neatinse", async () => {
    currentUser = { id: authorId, role: "manager" };
    const parId = await newDraft({ payeeName: null, payeeBank: null });
    await json("PATCH", `/api/par/${parId}`, {
      vendor_id: null,
      payee_name: "Boghean Natalia",
      payee_bank: "BC Moldindconbank SA",
    });
    expect((await json("PATCH", `/api/par/${parId}`, {})).status).toBe(200);
    const [row] = await testDb.select().from(parRequests).where(eq(parRequests.id, parId));
    expect(row.payeeName).toBe("Boghean Natalia");
    expect(row.payeeBank).toBe("BC Moldindconbank SA");

    // Ștergerea explicită rămâne posibilă.
    await json("PATCH", `/api/par/${parId}`, { vendor_id: null, payee_name: null });
    const [cleared] = await testDb.select().from(parRequests).where(eq(parRequests.id, parId));
    expect(cleared.payeeName).toBeNull();
  });
});
