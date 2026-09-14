/**
 * PARVERIFY-001 — ce ajunge pe hârtie: codul din rubrica `Signature` și banda cu QR.
 *
 * Ana Chirița (ATIC, 14.09.2026), cu formularul tipărit în mână: „nu se văd aprobările pe el — la
 * signature trebuie să fie cod ceva". Testele de aici apără exact acel câmp: el a fost gol prin
 * construcție de la prima versiune a formularului, iar nimic nu semnala asta.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { buildParFormDefinition } from "../parFormPdf";
import { signatureCode } from "../verifyCodes";
import type { ParFormData } from "../parFormData";

beforeAll(() => {
  process.env.PAR_SIGN_SECRET = "secret-de-test";
  process.env.APP_URL = "https://www.finflow.best";
});

const PAR_ID = "11111111-1111-1111-1111-111111111111";
const APPROVED_ID = "22222222-2222-2222-2222-222222222222";
const PENDING_ID = "33333333-3333-3333-3333-333333333333";

function fixture(): ParFormData {
  return {
    parId: PAR_ID,
    requestNo: "PAR-2026-0142",
    status: "approved",
    submittedAt: "2026-09-10T08:00:00.000Z",
    approvedAt: "2026-09-11T09:24:00.000Z",
    dateOfRequest: "2026-09-10T08:00:00.000Z",
    requestedByName: "Vlah Dumitru",
    requestorTitle: "Trainer",
    requestorCode: null,
    departmentName: "Training",
    dateNeeded: null,
    projectName: null,
    eventName: null,
    budgetCodeLabel: null,
    purpose: "Servicii de training",
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
    signatures: [
      {
        id: APPROVED_ID,
        step: 1,
        name: "Ana Chirița",
        title: "Aprobator",
        decision: "approved",
        decidedAt: "2026-09-11T09:24:00.000Z",
        approverUserId: "aaaa1111-1111-1111-1111-111111111111",
        signatureName: "Ana Chirița",
      },
      {
        id: PENDING_ID,
        step: 2,
        name: "Irina Oriol",
        title: "Aprobator",
        decision: "pending",
        decidedAt: null,
        approverUserId: "bbbb1111-1111-1111-1111-111111111111",
        signatureName: null,
      },
    ],
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

describe("formularul PAR — codul din rubrica Signature", () => {
  it("tipărește codul aprobării, nu un câmp gol", () => {
    const printed = texts(buildParFormDefinition(fixture()));
    const expected = signatureCode({
      parId: PAR_ID,
      approvalId: APPROVED_ID,
      step: 1,
      decision: "approved",
      decidedAt: "2026-09-11T09:24:00.000Z",
    })!;
    expect(expected).toBeTruthy();
    expect(printed).toContain(expected);
  });

  it("lasă goală caseta aprobatorului care încă n-a semnat", () => {
    const printed = texts(buildParFormDefinition(fixture())).join("\n");
    const pendingCode = signatureCode({
      parId: PAR_ID,
      approvalId: PENDING_ID,
      step: 2,
      decision: "pending",
      decidedAt: null,
    });
    expect(pendingCode).toBeNull();
    // Numele lui apare (caseta există), dar niciun cod lângă el.
    expect(printed).toContain("Irina Oriol");
  });

  it("dă exact același cod la a doua tipărire a aceleiași cereri", () => {
    const first = texts(buildParFormDefinition(fixture()));
    const second = texts(buildParFormDefinition(fixture()));
    expect(first).toEqual(second);
  });
});

describe("formularul PAR — banda de verificare", () => {
  it("desenează QR-ul cu encoderul pdfmake, nu ca imagine", () => {
    const def = buildParFormDefinition(fixture(), { token: "K7M29QD43F8BX2NV" });
    const codes = qrNodes(def);
    expect(codes).toHaveLength(1);
    expect(codes[0]).toMatch(/^https:\/\/www\.finflow\.best\/#\/verificare\/par\/K7M29QD43F8BX2NV\/[0-9A-HJKMNP-TV-Z]{8}$/);
  });

  it("tipărește tokenul și cu litere — fotocopiatoarele mănâncă QR-uri", () => {
    const printed = texts(buildParFormDefinition(fixture(), { token: "K7M29QD43F8BX2NV" }));
    expect(printed).toContain("K7M2-9QD4-3F8B-X2NV");
  });

  it("schimbă amprenta din URL când se mai dă o aprobare", () => {
    const before = qrNodes(buildParFormDefinition(fixture(), { token: "K7M29QD43F8BX2NV" }))[0];
    const after = fixture();
    after.signatures[1] = {
      ...after.signatures[1],
      decision: "approved",
      decidedAt: "2026-09-12T08:00:00.000Z",
      signatureName: "Irina Oriol",
    };
    const url = qrNodes(buildParFormDefinition(after, { token: "K7M29QD43F8BX2NV" }))[0];
    expect(url).not.toBe(before);
  });

  it("fără token, formularul iese fără QR — o eroare de bază de date nu oprește tipărirea", () => {
    const def = buildParFormDefinition(fixture(), null);
    expect(qrNodes(def)).toHaveLength(0);
    expect(texts(def)).toContain("PAR No: PAR-2026-0142");
  });
});
