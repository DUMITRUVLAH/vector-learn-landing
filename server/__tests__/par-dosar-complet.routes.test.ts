/**
 * @vitest-environment node
 * VM4-06/07 — dosarul complet: fișa cu diacritice și tabele, captura de ecran ca pagină,
 * formularul PAR generat pe server la final. INTEGRATION (rută reală, PGlite, toate migrările).
 *
 * Owner (10.09.2026, uitându-se la un dosar descărcat): „nu văd în dosar să fie captura, scrie să
 * descarc separat, chiar nu poate fi inserată? … la fel, să fie adăugat și PAR-ul … și parcă e
 * plain text aici, mai bine să fie un tabel."
 *
 * Se verifică pe PDF-ul CHIAR generat (nu pe o funcție pură): numărul de pagini crește cu pagina
 * imaginii, textul extras conține diacriticele corecte, iar formularul PAR e ultima secțiune.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "../db/schema/index";
import { tenants, users } from "../db/schema";
import { parRequests, parAttachments, parApprovals, parMembers, parPayerModules, parPayers, parPayments } from "../db/schema/par";

let pglite: PGlite;
let testDb: ReturnType<typeof drizzle<typeof schema>>;
let tenantId: string;
let userId: string;
let parId: string;

vi.mock("../db/client", () => ({
  get db() {
    return testDb;
  },
  closeDb: async () => {},
}));

/**
 * Bucket-ul `par-attachments`, simulat: cheia e chiar `storage_path`-ul din rând.
 *
 * De ce contează aici: din 2026-09-12 atașamentele NU mai stau ca data-URL în baza de date, iar
 * testele dosarului acopereau doar rândurile vechi. Așa a trecut nevăzută regresia în care fiecare
 * act urcat după acea dată ajungea în dosar ca notă „descărcați separat".
 */
const storageObjects = new Map<string, Buffer>();

vi.mock("../lib/storage/objectStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/storage/objectStore")>()),
  downloadObject: async (_bucket: string, objectPath: string) => {
    const bytes = storageObjects.get(objectPath);
    if (!bytes) throw new Error(`storage_object_missing:${objectPath}`);
    return bytes;
  },
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

/** PDF minimal valid, o pagină — octeții bruți (cum stau în Storage). */
function onePagePdfBytes(): Buffer {
  return Buffer.from(ONE_PAGE_PDF, "latin1");
}

/** PDF minimal valid, o pagină. */
function onePagePdf(): string {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj
xref
0 4
0000000000 65535 f
trailer<</Size 4/Root 1 0 R>>
startxref
0
%%EOF`;
  return `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`;
}

const ONE_PAGE_PDF = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj
xref
0 4
0000000000 65535 f
trailer<</Size 4/Root 1 0 R>>
startxref
0
%%EOF`;

/** PNG real 2×2 (pdf-lib chiar îl decodează — un PNG inventat ar pica la embed). */
const PNG_2x2 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAwMTAwMAAAA8AAaW6xkAAAAAASUVORK5CYII=",
  "base64",
);
const PNG_DATA_URL = `data:image/png;base64,${PNG_2x2.toString("base64")}`;

/** Numărul de pagini dintr-un PDF, citit cu pdf-lib. */
async function pageCount(bytes: Buffer): Promise<number> {
  const { PDFDocument } = await import("pdf-lib");
  return (await PDFDocument.load(bytes)).getPageCount();
}

/** Textul din PDF, ca să putem verifica diacriticele scrise chiar în document. */
async function pdfText(bytes: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(doc, { mergePages: true });
  return Array.isArray(text) ? text.join(" ") : text;
}

const dosar = async (): Promise<Buffer> => {
  const res = await app.request(`/api/par/${parId}/dosar`);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toContain("application/pdf");
  return Buffer.from(await res.arrayBuffer());
};

beforeAll(async () => {
  pglite = new PGlite();
  await applyMigrations(pglite);
  testDb = drizzle(pglite, { schema });

  const { parRoutes } = await import("../routes/par");
  app = new Hono();
  app.route("/api/par", parRoutes);

  const [tenant] = await testDb.insert(tenants).values({ name: "ATIC", slug: "atic-dosar" }).returning();
  tenantId = tenant.id;
  const [payer] = await testDb
    .insert(parPayers)
    .values({ tenantId, name: "ATIC", legalName: "Asociația Națională ATIC", idno: "1006600034927" })
    .returning();
  await testDb.insert(parPayerModules).values({ tenantId, payerId: payer.id, moduleKey: "par", enabled: true });

  const [u] = await testDb
    .insert(users)
    .values({ tenantId, email: "finance@vector.md", passwordHash: "x", name: "Violeta Ștefan", role: "manager" })
    .returning();
  userId = u.id;
  await testDb.insert(parMembers).values({ tenantId, userId, role: "finance" });

  const [par] = await testDb
    .insert(parRequests)
    .values({
      tenantId,
      requestNo: "PAR-2026-0023",
      requestedByUserId: userId,
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
      dateOfRequest: new Date("2026-09-08T00:00:00Z"),
      paidAt: new Date("2026-09-10T14:02:00Z"),
      approvedAt: new Date("2026-09-08T15:28:00Z"),
    })
    .returning();
  parId = par.id;

  await testDb.insert(parApprovals).values([
    { tenantId, parId, step: 0, approverUserId: userId, approverRoleLabel: "Solicitant", decision: "approved", decidedAt: new Date("2026-09-08T12:49:00Z") },
    { tenantId, parId, step: 1, approverUserId: userId, approverRoleLabel: "Aprobator", signatureName: "Ana Chiriță", decision: "approved", decidedAt: new Date("2026-09-08T12:53:00Z") },
  ]);
}, 240_000);

afterAll(async () => {
  await pglite?.close();
});

describe("Dosarul complet", () => {
  it("[blocant] fișa aprobărilor e scrisă cu diacritice, nu pliată pe ASCII", async () => {
    const text = await pdfText(await dosar());
    expect(text).toContain("FIȘA APROBĂRILOR");
    expect(text).toContain("Suma estimată");
    expect(text).toContain("Destinația plății");
    expect(text).toContain("Lanțul de aprobare");
    // Regresia veche: „FISA APROBARILOR" / „Suma estimata".
    expect(text).not.toContain("FISA APROBARILOR");
    expect(text).not.toContain("Suma estimata");
  }, 60_000);

  it("[blocant] datele plății apar ca perechi etichetă–valoare (tabel), nu ca frază", async () => {
    const text = await pdfText(await dosar());
    // Într-un tabel, eticheta stă separat de valoare; în fraza veche era „Beneficiar: NUME".
    expect(text).toContain("IBAN");
    expect(text).toContain("MD67ML0000002258A0919582");
    expect(text).not.toContain("Beneficiar: ASOCIA");
    expect(text).toContain("Echivalent MDL");
  }, 60_000);

  it("[blocant] captura de ecran intră ÎN dosar, ca pagină, nu ca trimitere la un fișier", async () => {
    const before = await pageCount(await dosar());

    const [att] = await testDb
      .insert(parAttachments)
      .values({ tenantId, parId, fileUrl: PNG_DATA_URL, fileName: "captura-ordin-plata.png", kind: "payment_order", uploadedBy: userId })
      .returning();

    const bytes = await dosar();
    // Dosarul crește (separator + pagina imaginii) ȘI chiar conține o imagine încorporată —
    // numărul de pagini singur nu ar dovedi că poza e înăuntru, nu doar anunțată.
    expect(await pageCount(bytes)).toBeGreaterThan(before);
    expect(bytes.toString("latin1")).toContain("/Subtype /Image");
    const text = await pdfText(bytes);
    expect(text).toContain("Ordin de plată");
    expect(text).not.toContain("nu poate fi inclus");

    await testDb.delete(parAttachments).where(eq(parAttachments.id, att.id));
  }, 60_000);

  it("[blocant] formularul PAR încheie dosarul, după celelalte documente", async () => {
    const [invoice] = await testDb
      .insert(parAttachments)
      .values({ tenantId, parId, fileUrl: onePagePdf(), fileName: "factura.pdf", kind: "invoice", uploadedBy: userId })
      .returning();
    const [form] = await testDb
      .insert(parAttachments)
      .values({ tenantId, parId, fileUrl: onePagePdf(), fileName: "PAR-2026-0023.pdf", kind: "par_pdf", uploadedBy: userId })
      .returning();

    const text = await pdfText(await dosar());
    expect(text).toContain("Formularul PAR");
    expect(text).toContain("Factură fiscală");
    // Ordinea în text urmează ordinea paginilor: factura ÎNAINTE de formular.
    expect(text.indexOf("Factură fiscală")).toBeLessThan(text.indexOf("Formularul PAR"));

    await testDb.delete(parAttachments).where(eq(parAttachments.id, invoice.id));
    await testDb.delete(parAttachments).where(eq(parAttachments.id, form.id));
  }, 60_000);

  it("[blocant] când formularul nu e atașat, dosarul îl GENEREAZĂ (nu doar îl anunță)", async () => {
    const text = await pdfText(await dosar());
    expect(text).toContain("Formularul PAR");
    // Formularul oficial e chiar înăuntru — vezi par-form-server.routes.test.ts pentru conținut.
    expect(text).toContain("Payment Action Request (PAR) Form");
    expect(text).not.toContain("nu a fost generat");
  }, 90_000);

  it("[blocant] actul .docx e CONVERTIT în dosar, nu înlocuit cu „descărcați-l separat\u201d", async () => {
    // Actele de primire-predare sosesc în Word. Până acum dosarul „complet" nu conținea tocmai
    // actul de recepție — doar o trimitere la un fișier pe care auditorul nu-l are.
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file(
      "word/document.xml",
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        "<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>ACT DE PRIMIRE PREDARE</w:t></w:r></w:p>" +
        "<w:p><w:r><w:t>Recepția serviciilor, suma achitată: 7000 MDL, IDNO 1006600034927</w:t></w:r></w:p>" +
        "</w:body></w:document>",
    );
    const docx = Buffer.from(await zip.generateAsync({ type: "nodebuffer" })).toString("base64");

    const [att] = await testDb
      .insert(parAttachments)
      .values({
        tenantId,
        parId,
        fileUrl: `data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,${docx}`,
        fileName: "ACT DE PRIMIRE PREDARE.docx",
        kind: "act_of_receipt",
        uploadedBy: userId,
      })
      .returning();

    const text = await pdfText(await dosar());
    expect(text).toContain("ACT DE PRIMIRE PREDARE");
    expect(text).toContain("7000 MDL");
    // Diacriticele rămân întregi: conversia folosește Tinos, ca restul dosarului.
    expect(text).toContain("Recepția serviciilor");
    // Testul negativ: nota veche NU mai apare pentru .docx.
    expect(text).not.toContain("nu poate fi inclus");

    await testDb.delete(parAttachments).where(eq(parAttachments.id, att.id));
  }, 60_000);

  it("un fișier care chiar nu poate fi inclus (XLSX) primește o notă cu numele lui", async () => {
    const [att] = await testDb
      .insert(parAttachments)
      .values({
        tenantId,
        parId,
        fileUrl: "data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,UEsDBA==",
        fileName: "deviz.xlsx",
        kind: "quotation",
        uploadedBy: userId,
      })
      .returning();

    const text = await pdfText(await dosar());
    expect(text).toContain("deviz.xlsx");
    expect(text).toContain("nu poate fi inclus");

    await testDb.delete(parAttachments).where(eq(parAttachments.id, att.id));
  }, 60_000);

  it("[blocant] un act ținut în Storage (file_url NULL) intră în dosar, nu ca notă „corupt”", async () => {
    // Regresia raportată pe 15.09.2026: „separat îl poate deschide ca document din platformă",
    // dar în dosar apărea „PDF corupt sau inaccesibil — Detaliu: Failed to parse URL from" —
    // adică un `fetch("")` pe `file_url`-ul gol al oricărui fișier urcat după mutarea în Storage.
    const objectPath = `${tenantId}/1757900000-abcdef-act.pdf`;
    storageObjects.set(objectPath, onePagePdfBytes());
    const [att] = await testDb
      .insert(parAttachments)
      .values({
        tenantId,
        parId,
        fileUrl: null,
        storagePath: objectPath,
        mimeType: "application/pdf",
        fileName: "Acte de predare-primire_ATIC_august 2026.pdf",
        kind: "act_of_receipt",
        uploadedBy: userId,
      })
      .returning();

    const text = await pdfText(await dosar());
    expect(text).toContain("Act de recepție");
    expect(text).not.toContain("PDF corupt sau inaccesibil");
    expect(text).not.toContain("Failed to parse URL");

    await testDb.delete(parAttachments).where(eq(parAttachments.id, att.id));
    storageObjects.delete(objectPath);
  }, 60_000);

  it("[blocant] dovada de plată din Storage intră ca IMAGINE, deși extensia stă în paranteză", async () => {
    // `ParPaymentProofCard` salvează captura sub numele „Confirmare plată — <nr> (fișier.png)".
    // Verificarea pe extensie se făcea cu `endsWith(".png")`, deci paranteza finală o rata și
    // dovada — exact documentul pentru care se deschide dosarul — ajungea doar ca notă.
    const before = await pageCount(await dosar());
    const objectPath = `${tenantId}/1757900001-abcdef-captura.png`;
    storageObjects.set(objectPath, PNG_2x2);
    const [att] = await testDb
      .insert(parAttachments)
      .values({
        tenantId,
        parId,
        fileUrl: null,
        storagePath: objectPath,
        mimeType: "image/png",
        fileName: "Confirmare plată — PAR-2026-0023 (captura-ordin-plata.png)",
        kind: "payment_order",
        uploadedBy: userId,
      })
      .returning();

    const bytes = await dosar();
    expect(await pageCount(bytes)).toBeGreaterThan(before);
    expect(bytes.toString("latin1")).toContain("/Subtype /Image");
    const text = await pdfText(bytes);
    expect(text).toContain("Ordin de plată");
    expect(text).not.toContain("nu poate fi inclus");

    await testDb.delete(parAttachments).where(eq(parAttachments.id, att.id));
    storageObjects.delete(objectPath);
  }, 60_000);
});

// ─── Numele fișierului (owner, 18.09.2026) ───────────────────────────────────

describe("Numele dosarului descărcat", () => {
  it("[blocant] spune cui s-a plătit, cu ce ordin de plată și când — nu doar numărul cererii", async () => {
    const [payment] = await testDb
      .insert(parPayments)
      .values({ tenantId, parId, paymentRef: "1247", paymentDate: new Date("2026-09-10T00:00:00Z") })
      .returning();
    try {
      const res = await app.request(`/api/par/${parId}/dosar`);
      expect(res.status).toBe(200);
      const disposition = res.headers.get("content-disposition") ?? "";

      expect(disposition).toContain("PAR-2026-0023");
      // Agentul economic, pliat pe ASCII: antetul HTTP nu poate purta diacritice (RFC 6266).
      expect(disposition).toContain("ASOCIATIA-NATIONALA");
      expect(disposition).toContain("OP-1247");
      expect(disposition).toContain("2026-09-10");
      expect(disposition).toContain(".pdf");
    } finally {
      await testDb.delete(parPayments).where(eq(parPayments.id, payment.id));
    }
  }, 90_000);
});
