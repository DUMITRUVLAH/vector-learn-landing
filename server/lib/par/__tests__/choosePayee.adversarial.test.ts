/**
 * Regression tests for the two adversarial bugs found during the PAR AI-extraction overhaul
 * (workflow par-ai-extraction-overhaul, 2026-06-28). Both must stay fixed.
 */
import { describe, it, expect } from "vitest";
import { choosePayee } from "../choosePayee";
import type { ParPartiesExtraction } from "../parPartyTypes";

function ext(parties: ParPartiesExtraction["parties"]): ParPartiesExtraction {
  return { parties, amountCents: 500000, currency: "MDL", scope: "test", documentClass: "contract", isStub: true };
}

describe("choosePayee — adversarial regressions", () => {
  // BUG #2: a document that names ONLY the payer (the creator's own org / an explicit CLIENT)
  // must NOT silently prefill that payer as the payee — even when the tenant org is unknown.
  it("payer-only doc (explicit payer-hint) → no payee, even with tenantOrgName=null", () => {
    const r = choosePayee(
      ext([{ name: "Vector Academy SRL", role: "client", idno: "1024600035737", iban: "MD87AG000000022516065719", bank: "BC MAIB S.A.", isPayerHint: true }]),
      null,
    );
    expect(r.payee).toBeNull();
    expect(r.needsClarification).toBe(false);
  });

  it("payer-only doc where the only party matches tenantOrgName → no payee", () => {
    const r = choosePayee(
      ext([{ name: "Vector Academy SRL", role: "client", iban: "MD87AG000000022516065719" }]),
      "Vector Academy SRL",
    );
    expect(r.payee).toBeNull();
  });

  // BUG #1: a bank must never be selected as the payee, including brands not prefixed with BC/Banca.
  it.each(["MAIB S.A.", "EuroCreditBank S.A.", "Victoriabank", "Moldova-Agroindbank", "OTP Bank S.A."])(
    "bank-only doc (%s) → no payee (bank excluded)",
    (bankName) => {
      const r = choosePayee(ext([{ name: bankName, role: "unknown", iban: "MD50AG000000022516524419" }]), null);
      expect(r.payee).toBeNull();
    },
  );

  // Sanity: a genuine single counterparty supplier (not the tenant, not a bank, not payer-hinted)
  // IS still chosen as the payee — the fixes must not over-suppress.
  it("single legitimate supplier → chosen as payee", () => {
    const r = choosePayee(
      ext([{ name: "Lumina Print SRL", role: "client", idno: "1003600012345", iban: "MD24AG000225100013104168", isPayerHint: false }]),
      "Vector Academy SRL",
    );
    expect(r.payee?.name).toBe("Lumina Print SRL");
    expect(r.payee?.iban).toBe("MD24AG000225100013104168");
  });
});
