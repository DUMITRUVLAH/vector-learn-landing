/**
 * @vitest-environment node
 * Formularul PAR scris pe server — INTEGRATION (rută reală, PGlite, toate migrările).
 *
 * Owner (10.09.2026, alegând ce se construiește mai departe): formularul oficial se genera DOAR în
 * browser, ca fotografie a paginii (html2canvas), și ajungea în dosar doar dacă cineva apăsa
 * „Download PDF". Acum se scrie pe server, ca text, deci există întotdeauna.
 *
 * Se verifică pe PDF-ul chiar produs: textul e selectabil (extras cu unpdf), secțiunile oficiale
 * sunt acolo, diacriticele nu sunt pliate, iar dosarul îl conține chiar dacă nimeni nu l-a atașat.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import {
  parRequests,
  parLineItems,
  parApprovals,
  parAttachments,
  parPayments,
  parMembers,
  parPayerModules,
  parPayers,
} from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let approverId: string;
let parId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

vi.mock("../middleware/requireAuth", () => ({
  requireAuth: async (c: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
    c.set("user", { id: userId, tenantId, role: "manager", email: "finance@vector.md" });
    await next();
  },
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

async function pdfText(bytes: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(doc, { mergePages: true });
  return Array.isArray(text) ? text.join(" ") : text;
}

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parRoutes } = await import("../routes/par");
  app = new Hono();
  app.route("/api/par", parRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-form" }).returning();
  tenantId = tenant.id;
  const [payer] = await testDb.insert(parPayers).values({ tenantId, name: "ATIC" }).returning();
  await testDb.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true });

  const mk = async (email: string, name: string) => {
    const [u] = await testDb.insert(users).values({ tenantId, email, passwordHash: "x", name, role: "manager" }).returning();
    return u.id;
  };
  userId = await mk("dorina@vector.md", "Dorina Harghel");
  approverId = await mk("ana@vector.md", "Ana Chiriță");
  await testDb.insert(parMembers).values([
    { tenantId, userId, role: "finance" },
    { tenantId, userId: approverId, role: "approver" },
  ]);

  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      requestNo: "PAR-2026-0023",
      requestedByUserId: userId,
      requestorTitle: "Specialist achiziții",
      purpose: "execute_payment",
      chargeTo: "program",
      status: "paid",
      payerId: payer.id,
      endUse: "Procurare abonament anual spațiu de stocare pentru proiectul Tekwill în Fiecare Școală",
      payeeName: "ASOCIAȚIA NAȚIONALĂ A COMPANIILOR DIN DOMENIUL TIC",
      payeeIdnp: "1006600034927",
      payeeIban: "MD67ML0000002258A0919582",
      payeeBank: 'BC "Moldindconbank" S.A.',
      currency: "USD",
      totalEstimatedCents: 9999,
      totalMdlCents: 172248,
      attachmentsPresent: true,
      attachmentsNote: "Factură fiscală",
      dateOfRequest: new Date("2026-09-08T00:00:00Z"),
      dateNeeded: new Date("2026-09-18T00:00:00Z"),
    })
    .returning();
  parId = par.id;

  await testDb.insert(parLineItems).values({
    tenantId,
    parId,
    position: 1,
    description: "Abonament Google Drive 2 TB — 12 luni",
    quantity: 1,
    unit: "bucăți",
    unitPriceCents: 9999,
    lineTotalCents: 9999,
  });

  await testDb.insert(parApprovals).values([
    { tenantId, parId, step: 0, approverUserId: userId, approverRoleLabel: "Solicitant", decision: "approved", decidedAt: new Date("2026-09-08T12:49:00Z") },
    { tenantId, parId, step: 1, approverUserId: approverId, approverRoleLabel: "Aprobator", signatureName: "Ana Chiriță", signatureTitle: "Director financiar", decision: "approved", decidedAt: new Date("2026-09-08T12:53:00Z") },
  ]);

  await testDb.insert(parPayments).values({
    tenantId,
    parId,
    parBl: "OPS-2026-09",
    receivedAt: new Date("2026-09-09T09:00:00Z"),
    receivedByUserId: userId,
    actualAmountCents: 9999,
    paymentDate: new Date("2026-09-10T00:00:00Z"),
    paymentRef: "OP-2026-0047",
  });
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("GET /api/par/:id/form.pdf", () => {
  it("[blocant] întoarce un PDF cu TEXT, nu o fotografie a paginii", async () => {
    const res = await app.request(`/api/par/${parId}/form.pdf`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("PAR_Form_PAR-2026-0023.pdf");

    const text = await pdfText(Buffer.from(await res.arrayBuffer()));
    // Fotografia veche nu avea NICIUN text extractibil; asta e diferența verificabilă.
    expect(text).toContain("Payment Action Request (PAR) Form");
    expect(text).toContain("Items/Services Requested");
    expect(text).toContain("Payment Internal Use Only");
  }, 60_000);

  it("[blocant] tipărește datele cererii, cu diacritice și în moneda ei", async () => {
    const res = await app.request(`/api/par/${parId}/form.pdf`);
    const text = await pdfText(Buffer.from(await res.arrayBuffer()));

    expect(text).toContain("PAR-2026-0023");
    expect(text).toContain("Dorina Harghel");
    expect(text).toContain("Abonament Google Drive 2 TB");
    expect(text).toContain("Tekwill în Fiecare Școală");
    expect(text).toContain("ASOCIAȚIA NAȚIONALĂ");
    expect(text).toContain("MD67ML0000002258A0919582");
    // Moneda cererii, nu „MDL" tipărit din start (regresia PAR-2026-0027).
    expect(text).toContain("USD");
    expect(text).toContain("MDL equivalent");
  }, 60_000);

  it("[blocant] semnăturile poartă numele și funcția, cu data aprobării", async () => {
    const res = await app.request(`/api/par/${parId}/form.pdf`);
    const text = await pdfText(Buffer.from(await res.arrayBuffer()));

    expect(text).toContain("Requestor Signature");
    expect(text).toContain("Approver Signature");
    expect(text).toContain("Ana Chiriță");
    expect(text).toContain("Director financiar");
    expect(text).toContain("08-Sep-26");
  }, 60_000);

  it("secțiunea 16 conține datele plății înregistrate", async () => {
    const res = await app.request(`/api/par/${parId}/form.pdf`);
    const text = await pdfText(Buffer.from(await res.arrayBuffer()));
    expect(text).toContain("OPS-2026-09");
    expect(text).toContain("OP-2026-0047");
  }, 60_000);

  it("un id inexistent → 404, nu 500", async () => {
    const res = await app.request(`/api/par/00000000-0000-0000-0000-000000000000/form.pdf`);
    expect(res.status).toBe(404);
  });
});

describe("Dosarul conține formularul chiar dacă nimeni nu l-a atașat", () => {
  it("[blocant] formularul e generat live și încheie dosarul", async () => {
    const res = await app.request(`/api/par/${parId}/dosar`);
    expect(res.status).toBe(200);
    const text = await pdfText(Buffer.from(await res.arrayBuffer()));

    expect(text).toContain("FIȘA APROBĂRILOR");
    expect(text).toContain("Formularul PAR");
    // Formularul CHIAR e acolo, nu doar anunțat.
    expect(text).toContain("Payment Action Request (PAR) Form");
    expect(text).not.toContain("nu a fost generat");
    // …și vine după fișa aprobărilor.
    expect(text.indexOf("FIȘA APROBĂRILOR")).toBeLessThan(text.indexOf("Payment Action Request (PAR) Form"));
  }, 90_000);

  it("dacă formularul semnat e deja atașat, se folosește el (fără dublură)", async () => {
    const onePagePdf = `data:application/pdf;base64,${Buffer.from(`%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj
trailer<</Size 4/Root 1 0 R>>
%%EOF`).toString("base64")}`;
    const [att] = await testDb
      .insert(parAttachments)
      .values({ tenantId, parId, fileUrl: onePagePdf, fileName: "PAR semnat.pdf", kind: "par_pdf", uploadedBy: userId })
      .returning();

    const res = await app.request(`/api/par/${parId}/dosar`);
    const text = await pdfText(Buffer.from(await res.arrayBuffer()));
    // Formularul generat NU se mai adaugă peste cel atașat.
    expect(text.split("Payment Action Request (PAR) Form").length - 1).toBe(0);
    expect(text).toContain("Formularul PAR");

    await testDb.delete(parAttachments).where(eq(parAttachments.id, att.id));
  }, 90_000);
});
