/**
 * Previzualizarea dinaintea trimiterii — ce deosebește ciorna de hârtia care se semnează.
 *
 * Iulian Lungu (ATIC, 17.09.2026): „ar fi comod, după ce completezi toate celulele, să fie posibil
 * să vezi documentul în formatul de PAR, înainte de a trimite spre semnare." Previzualizarea merge
 * pe ACEEAȘI cale ca descărcarea, deci ciorna iese arătând ca documentul final — iar asta e tocmai
 * riscul: un exemplar tipărit dintr-o ciornă abandonată ar circula ca act. Testele de aici apără
 * cele două semne care spun adevărul pe hârtie: filigranul și lipsa codului de verificare.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { buildParFormDefinition } from "../parFormPdf";
import { renderDosarPagesPdf } from "../dosarPdf";
import type { ParFormData } from "../parFormData";

beforeAll(() => {
  process.env.PAR_SIGN_SECRET = "secret-de-test";
  process.env.APP_URL = "https://www.finflow.best";
});

const PAR_ID = "44444444-4444-4444-4444-444444444444";
const TOKEN = "K7M29QD43F8BX2NV";

function fixture(status: string): ParFormData {
  return {
    parId: PAR_ID,
    requestNo: "PAR-2026-0058",
    status,
    submittedAt: status === "draft" ? null : "2026-09-15T08:00:00.000Z",
    approvedAt: null,
    dateOfRequest: "2026-09-17T08:00:00.000Z",
    requestedByName: "Iulian Lungu",
    requestorTitle: "Project Coordinator",
    requestorCode: null,
    departmentName: "Projects",
    dateNeeded: "2026-09-27T08:00:00.000Z",
    projectName: "LED 3/Youth Maker club",
    eventName: null,
    budgetCodeLabel: "4.2.8.1",
    purpose: "Executare plată",
    chargeTo: "project",
    chargeBillingCode: null,
    currency: "MDL",
    totalEstimatedCents: 700000,
    totalMdlCents: null,
    exchangeRate: null,
    endUse: null,
    payeeName: "Furnizor SRL",
    payeeIdnp: "1234567890123",
    payeeIban: "MD24AG000225100013104168",
    payeeBank: "OTP Bank S.A.",
    attachmentsPresent: true,
    attachmentsNote: null,
    lineItems: [
      { description: "Servicii de training", quantity: 1, unit: "buc", unitPriceCents: 700000, lineTotalCents: 700000 },
    ],
    signatures: [],
    payment: null,
  };
}

/** Toate șirurile din arborele pdfmake, ca un test să poată întreba „scrie asta pe hârtie?". */
function texts(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    out.push(node);
  } else if (Array.isArray(node)) {
    for (const child of node) texts(child, out);
  } else if (node && typeof node === "object") {
    for (const value of Object.values(node as Record<string, unknown>)) texts(value, out);
  }
  return out;
}

/** Nodurile QR native pdfmake (`{ qr, fit }`) din document. */
function qrNodes(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) {
    for (const child of node) qrNodes(child, out);
  } else if (node && typeof node === "object") {
    const rec = node as Record<string, unknown>;
    if (typeof rec.qr === "string") out.push(rec.qr);
    for (const value of Object.values(rec)) qrNodes(value, out);
  }
  return out;
}

/**
 * Câte pagini iese documentul, randat cu adevărat — nu presupus din arborele pdfmake.
 *
 * `new Uint8Array(...)`, nu `Buffer`-ul direct: fișierul rulează în mediul jsdom, unde `Buffer` vine
 * din alt realm, iar verificarea de tip a lui pdf-lib îl respinge („was actually of type NaN").
 */
async function pageCount(definition: unknown): Promise<number> {
  const { PDFDocument } = await import("pdf-lib");
  const bytes = await renderDosarPagesPdf(definition as Parameters<typeof renderDosarPagesPdf>[0]);
  return (await PDFDocument.load(new Uint8Array(bytes))).getPageCount();
}

describe("formularul PAR — ciorna previzualizată înainte de trimitere", () => {
  it("poartă filigran, ca un exemplar tipărit să nu treacă drept act", () => {
    const def = buildParFormDefinition(fixture("draft")) as { watermark?: { text?: string } };
    expect(def.watermark?.text).toBe("DRAFT");
  });

  it("spune în clar că n-a fost trimisă spre aprobare", () => {
    const printed = texts(buildParFormDefinition(fixture("draft"))).join("\n");
    expect(printed).toContain("DRAFT — not submitted for approval");
  });

  it("nu poartă cod de verificare nici dacă i s-a dat unul", () => {
    // Ruta nu emite token pe ciornă, dar regula trăiește în document: cele două nu au voie să se
    // contrazică, altfel un al doilea apelant (dosarul) ar putea tipări cod pe o ciornă.
    const def = buildParFormDefinition(fixture("draft"), { token: TOKEN });
    expect(qrNodes(def)).toHaveLength(0);
    expect(texts(def)).not.toContain("K7M2-9QD4-3F8B-X2NV");
  });

  it("ține locul benzii de verificare, nu îl adaugă", () => {
    const draft = texts(buildParFormDefinition(fixture("draft")));
    const sent = texts(buildParFormDefinition(fixture("submitted"), { token: TOKEN }));
    expect(draft).not.toContain("Verify this document");
    expect(sent).toContain("Verify this document");
  });

  it("iese pe o singură pagină, ca hârtia semnată", async () => {
    // Golul de sub semnătura solicitantului e calibrat la milimetru (vezi `verifyBlock`): un rând
    // în plus împinge formularul pe pagina a doua, iar previzualizarea ar arăta atunci altă
    // așezare decât documentul care se semnează — adică exact ce trebuia să verifice.
    expect(await pageCount(buildParFormDefinition(fixture("draft")))).toBe(1);
    expect(await pageCount(buildParFormDefinition(fixture("submitted"), { token: TOKEN }))).toBe(1);
  }, 30_000);
});

describe("formularul PAR — cererea depusă nu se schimbă", () => {
  it("nu poartă filigran după trimitere", () => {
    const def = buildParFormDefinition(fixture("submitted"), { token: TOKEN }) as { watermark?: unknown };
    expect(def.watermark).toBeUndefined();
  });

  it("păstrează QR-ul și tokenul tipărit cu litere", () => {
    const def = buildParFormDefinition(fixture("approved"), { token: TOKEN });
    expect(qrNodes(def)).toHaveLength(1);
    expect(texts(def)).toContain("K7M2-9QD4-3F8B-X2NV");
  });
});
