/**
 * @vitest-environment node
 * Verificarea documentului față de cerere — cazurile reale ATIC (rute reale, PGlite, migrări).
 *
 * Pe 24.09.2026 toate cele 94 de acte ATIC au fost rejucate prin `/reconcile`. Trei clase de
 * avertismente false au rămas după regulile v4, și fiecare e fixată aici:
 *  - factura împărțită pe mai multe cereri (EBL000060380: 4 030,10 + 6 564,63 = 10 594,73) era
 *    raportată „suma nu corespunde" pe fiecare parte — inclusiv pe două cereri care așteptau
 *    aprobarea chiar atunci;
 *  - plata cu cardul organizației („card ATIC", cu IDNO-ul ATIC) era acuzată de „beneficiarul e
 *    altul" fiindcă bonul numește comerciantul;
 *  - un IDNP greșit tipărit pe document (actul Bulbaș, rubrica de semnături) acuza o cerere corectă.
 * Și contraproba: un cod greșit în CERERE (Deea House, plătită cu IDNO-ul greșit) rămâne acuzat.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parRequests, parAttachments, parMembers, parPayerModules, parPayers } from "../db/schema/par";
import type { ParPartiesExtraction } from "../lib/par/parPartyTypes";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let payerId: string;
let app: Awaited<ReturnType<typeof buildApp>>;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "manager", email: "finance@atic.test" });
    await next();
  },
}));

vi.mock("../lib/ai/readUploadedDoc", () => ({
  readUploadedDoc: async () => ({ rawText: "", imageDataUrl: null, fileDataUrl: null }),
}));

/** Ce „citește" modelul din documentul următor — fiecare test își pune extracția. */
const extraction = vi.hoisted(() => ({ next: null as unknown }));
vi.mock("../lib/ai/parExtractor", () => ({
  extractParParties: async () => extraction.next,
}));

import { Hono } from "hono";

async function buildApp() {
  const { parAttachmentsRoutes } = await import("../routes/parAttachments");
  const a = new Hono();
  a.route("/api/par", parAttachmentsRoutes);
  return a;
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

const ATIC_IDNO = "1006600034927";
let seq = 200;

async function parWith(fields: Partial<typeof parRequests.$inferInsert>) {
  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      payerId,
      requestNo: `PAR-2026-0${seq++}`,
      requestedByUserId: userId,
      purpose: "execute_payment",
      chargeTo: "program",
      status: "pending_approval",
      currency: "MDL",
      totalEstimatedCents: 0,
      dateOfRequest: new Date("2026-09-24T00:00:00Z"),
      ...fields,
    })
    .returning();
  return par;
}

async function attach(parId: string, fileName: string, sizeBytes: number) {
  const [att] = await testDb
    .insert(parAttachments)
    .values({
      tenantId,
      parId,
      fileName,
      sizeBytes,
      mimeType: "application/pdf",
      fileUrl: `data:application/pdf;base64,${Buffer.from("%PDF-1.4 test").toString("base64")}`,
      kind: "invoice",
    })
    .returning();
  return att;
}

function doc(parties: ParPartiesExtraction["parties"], amountCents: number | null): ParPartiesExtraction {
  return {
    parties,
    amountCents,
    amountConfidence: 0.9,
    currency: "MDL",
    scope: null,
    documentClass: "invoice",
    lineItems: [],
    isStub: false,
  } as ParPartiesExtraction;
}

const party = (name: string, role: "provider" | "client", idno: string | null, iban: string | null = null) =>
  ({ name, role, idno, iban, ibans: iban ? [iban] : null, bank: null, bic: null, legalAddress: null, administratorName: null, vatCode: null });

const ATIC = party("Asociatia Nationala a Companiilor din Domeniul TIC", "client", ATIC_IDNO);

async function reconcile(parId: string, attId: string) {
  const res = await app.request(`/api/par/${parId}/attachments/${attId}/reconcile`, { method: "POST" });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { analysis: { checks: { field: string; matches: boolean | null; note?: string }[] } };
  return Object.fromEntries(body.analysis.checks.map((c) => [c.field, c]));
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });
  app = await buildApp();

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-reconcile" }).returning();
  tenantId = tenant.id;
  const [payer] = await testDb
    .insert(parPayers)
    .values({ tenantId, name: "ATIC", legalName: "Asociatia Nationala a Companiilor din Domeniul TIC", idno: ATIC_IDNO })
    .returning();
  payerId = payer.id;
  await testDb.insert(parPayerModules).values({ tenantId, payerId, moduleKey: "par", enabled: true });
  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "finance@atic.test", passwordHash: "x", name: "Violeta", role: "manager" })
    .returning();
  userId = u.id;
  await testDb.insert(parMembers).values({ tenantId, userId, role: "finance" });
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Factura împărțită pe mai multe cereri", () => {
  const DEEA = party("DEEA HOUSE S.R.L.", "provider", "1014600006741", "MD03MO2224ASV71447007100");
  const payee = { payeeName: "DEEA HOUSE SRL", payeeIdnp: "1014600006741", payeeIban: "MD03MO2224ASV71447007100" };

  it("[blocant] 4 030,10 + 6 564,63 pe aceeași factură de 10 594,73 → suma corespunde, cu explicație", async () => {
    const a = await parWith({ ...payee, totalEstimatedCents: 403010 });
    const b = await parWith({ ...payee, totalEstimatedCents: 656463 });
    const attA = await attach(a.id, "EBL000060380.pdf", 48213);
    await attach(b.id, "EBL000060380.pdf", 48213);
    extraction.next = doc([DEEA, ATIC], 1059473);
    const checks = await reconcile(a.id, attA.id);
    expect(checks["sumă"].matches).toBe(true);
    expect(checks["sumă"].note).toContain("2 cereri");
  });

  it("[blocant] contraproba: o factură întreagă pe o singură cerere cu o parte din sumă rămâne acuzată", async () => {
    const c = await parWith({ ...payee, totalEstimatedCents: 403010 });
    const att = await attach(c.id, "EBL000099999.pdf", 48213);
    extraction.next = doc([DEEA, ATIC], 1059473);
    expect((await reconcile(c.id, att.id))["sumă"].matches).toBe(false);
  });

  it("o cerere anulată nu intră în sumă", async () => {
    const live = await parWith({ ...payee, totalEstimatedCents: 403010 });
    const dead = await parWith({ ...payee, totalEstimatedCents: 656463, status: "cancelled" });
    const att = await attach(live.id, "EBL000077777.pdf", 777);
    await attach(dead.id, "EBL000077777.pdf", 777);
    extraction.next = doc([DEEA, ATIC], 1059473);
    expect((await reconcile(live.id, att.id))["sumă"].matches).toBe(false);
  });
});

describe("Plata cu cardul organizației", () => {
  it("[blocant] „card ATIC” (IDNO-ul ATIC) pe bonul METRO nu e „beneficiarul e altul”", async () => {
    const par = await parWith({
      payeeName: "card ATIC", payeeIdnp: ATIC_IDNO, payeeIban: "MD94ML0000002258A0919581", totalEstimatedCents: 107885,
    });
    const att = await attach(par.id, "Metro AAQ 1434172.pdf", 9001);
    extraction.next = doc([party("METRO CASH & CARRY MOLDOVA S.R.L.", "provider", "1003600050510", "MD96VI000002251621102MDL")], 107885);
    const checks = await reconcile(par.id, att.id);
    for (const field of ["beneficiar", "IDNO/IDNP", "IBAN"]) expect(checks[field].matches).not.toBe(false);
  });
});

describe("Cifra de control IDNO/IDNP", () => {
  it("[blocant] un IDNP greșit tipărit pe document nu acuză o cerere cu codul corect", async () => {
    const par = await parWith({ payeeName: "BULBAȘ GEORGETA", payeeIdnp: "2002500149379", totalEstimatedCents: 600000 });
    const att = await attach(par.id, "ACT BULBAS.pdf", 3001);
    extraction.next = doc([party("BULBAȘ GEORGETA", "provider", "2002500149479"), ATIC], 600000);
    expect((await reconcile(par.id, att.id))["IDNO/IDNP"].matches).toBeNull();
  });

  it("[blocant] un IDNO greșit în CERERE rămâne acuzat (Deea House)", async () => {
    const par = await parWith({
      payeeName: "Deea House SRL", payeeIdnp: "1014600000674", payeeIban: "MD03MO2224ASV71447007100", totalEstimatedCents: 340000,
    });
    const att = await attach(par.id, "EBL000116890.pdf", 4001);
    extraction.next = doc([party("DEEA HOUSE S.R.L.", "provider", "1014600006741", "MD03MO2224ASV71447007100"), ATIC], 340000);
    expect((await reconcile(par.id, att.id))["IDNO/IDNP"].matches).toBe(false);
  });
});
