/**
 * Attachment cross-check must compare the PAR against the party the PAR is actually about.
 *
 * Reported 2026-08-25: uploading the signed contract to a PAR whose beneficiary is CRJM reported
 * "Neverificate (nu apar în document): beneficiar, IDNO/IDNP, IBAN, bancă" — on a document that
 * prints all four. Cause: the check used `choosePayee()`'s recommendation, and a contract names
 * BOTH sides; when the tenant's own side is the recommended one, every requisite compared against
 * the wrong company. Live check on the pre-fix code produced 5 false mismatches; 1 real one after.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("../db/client", () => ({ db: {} }));

import { matchPartyToPar } from "../routes/parAttachments";
import type { ChoosePayeeResult } from "../lib/par/parPartyTypes";

const CRJM = {
  name: "Centrul de Resurse Juridice",
  idno: "1010620008129",
  iban: "MD80VI000002224217675MDL",
  bank: "VictoriaBank S.A. fil. Nr. 17",
  bic: "VICBMD2X457",
  legalAddress: null,
  administratorName: "Ilie CHIRTOACĂ",
  payeeType: "juridic" as const,
};
const VECTOR = {
  name: "Vector Academy S.R.L",
  idno: "1024600035737",
  iban: "MD87AG000000022516065719",
  bank: "BC „Moldova-Agroindbank” S.A.",
  bic: "AGRNMD2X",
  legalAddress: null,
  administratorName: "Dumitru VLAH",
  payeeType: "juridic" as const,
};

/** The extractor recommends Vector (the provider); the document names both. */
const choice = {
  needsClarification: false,
  candidates: [],
  payee: VECTOR,
  lowConfidence: {},
  amountCents: 800_000,
  currency: "MDL",
  scope: null,
  options: [
    { ...VECTOR, role: "provider" as const, recommended: true, isPayer: false },
    { ...CRJM, role: "client" as const, recommended: false, isPayer: true },
  ],
} as unknown as ChoosePayeeResult;

describe("matchPartyToPar", () => {
  it("matches on IDNO even when the extractor recommends the other party", () => {
    const p = matchPartyToPar(choice, { payeeName: null, payeeIdnp: "1010620008129", payeeIban: null });
    expect(p?.name).toBe("Centrul de Resurse Juridice");
    expect(p?.iban).toBe("MD80VI000002224217675MDL");
  });

  it("matches on IBAN when no fiscal id is recorded on the PAR", () => {
    const p = matchPartyToPar(choice, { payeeName: null, payeeIdnp: null, payeeIban: "MD80VI000002224217675MDL" });
    expect(p?.name).toBe("Centrul de Resurse Juridice");
  });

  it("matches on name (whitespace/case-insensitive) as the last resort", () => {
    const p = matchPartyToPar(choice, { payeeName: "centrul de  resurse juridice", payeeIdnp: null, payeeIban: null });
    expect(p?.name).toBe("Centrul de Resurse Juridice");
  });

  it("keeps the extractor's recommendation when the PAR names nobody in the document", () => {
    const p = matchPartyToPar(choice, { payeeName: "Altă Firmă SRL", payeeIdnp: "1111111111111", payeeIban: null });
    expect(p?.name).toBe("Vector Academy S.R.L"); // → the checks then report a real mismatch
  });

  it("still resolves the recommended payee when the document named only one party", () => {
    const single = { ...choice, options: [] } as unknown as ChoosePayeeResult;
    const p = matchPartyToPar(single, { payeeName: null, payeeIdnp: "1024600035737", payeeIban: null });
    expect(p?.name).toBe("Vector Academy S.R.L");
  });
});
