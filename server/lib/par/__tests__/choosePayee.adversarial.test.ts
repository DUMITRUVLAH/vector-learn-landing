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

  // On the LLM path (isStub:false) the role labels are trusted: a "client" (buyer / Autoritatea
  // contractantă) is NEVER the payee. When the creator's own org is the seller, dropping it leaves
  // only the buyer → NO payee (not the buyer). Owner-reported: MIXBOOK (buyer) and BNS (client)
  // were wrongly prefilled when the tenant was Vector Academy (the seller).
  function llm(parties: ParPartiesExtraction["parties"]): ParPartiesExtraction {
    return { parties, amountCents: 78400, currency: "MDL", scope: "x", documentClass: "invoice", isStub: false };
  }
  it("tenant is the seller; only the buyer/client remains → NO payee (never the buyer)", () => {
    const ext = llm([
      { name: "Vector Academy SRL", role: "provider", idno: "1024600035737", iban: "MD87AG000000022516065719" },
      { name: "S.R.L. MIXBOOK", role: "client", idno: "1017600027590", isPayerHint: true },
    ]);
    const r = choosePayee(ext, "Vector Academy SRL");
    expect(r.payee).toBeNull(); // NOT MIXBOOK
  });
  it("same doc, different tenant → the seller (provider) is the payee", () => {
    const ext = llm([
      { name: "Vector Academy SRL", role: "provider", idno: "1024600035737", iban: "MD87AG000000022516065719" },
      { name: "S.R.L. MIXBOOK", role: "client", idno: "1017600027590", isPayerHint: true },
    ]);
    const r = choosePayee(ext, "ATIC Digital Safeguard");
    expect(r.payee?.name).toBe("Vector Academy SRL");
  });
  it("LLM path: a real supplier is still chosen even when the tenant is the buyer", () => {
    const ext = llm([
      { name: "LAURTOP CAPITAL SRL", role: "provider", iban: "RO78BTRLRONCRT0DD6485101" },
      { name: "Vector Academy SRL", role: "client", isPayerHint: true },
    ]);
    const r = choosePayee(ext, "Vector Academy SRL");
    expect(r.payee?.name).toBe("LAURTOP CAPITAL SRL");
  });

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

// PAR bug 2026-08-25: the "Bancă" field showed a payee's own quoted name + legal address instead
// of a bank name. The root fix bounds extraction (stubPartyParser.cleanBankName windowing); this
// suite locks the SECOND, format-agnostic layer — choosePayee's fieldSanity cross-check — so any
// future extraction path (a new LLM prompt, a new stub heuristic) that mis-slots a value still
// gets caught here, not just in the one parser that happened to cause the original report.
describe("choosePayee — field-sanity cross-check (bank/legalAddress/administratorName)", () => {
  it("an IDNO extracted into the `bank` slot is recovered as idno, not surfaced as a bank name", () => {
    const r = choosePayee(
      ext([{ name: "NEWS MAKER SRL", role: "provider", bank: "1020600033229" }]),
      null,
    );
    expect(r.payee?.name).toBe("NEWS MAKER SRL");
    expect(r.payee?.idno).toBe("1020600033229");
    expect(r.payee?.bank).toBeNull();
  });

  it("an IBAN extracted into the `bank` slot is recovered as iban, not surfaced as a bank name", () => {
    const r = choosePayee(
      ext([{ name: "NEWS MAKER SRL", role: "provider", bank: "MD50AG000000022516524419" }]),
      null,
    );
    expect(r.payee?.name).toBe("NEWS MAKER SRL");
    expect(r.payee?.iban).toBe("MD50AG000000022516524419");
    expect(r.payee?.bank).toBeNull();
  });

  it("a company's own name + address bled into `bank` is dropped, not surfaced", () => {
    const r = choosePayee(
      ext([
        {
          name: "NEWS MAKER SRL",
          role: "provider",
          idno: "1020600033229",
          iban: "MD50AG000000022516524419",
          bank: '"NEWS MAKER" SRL, cu sediul in mun. Chisinau, sec. Botanica, str. Grenoble nr. 128',
        },
      ]),
      null,
    );
    expect(r.payee?.name).toBe("NEWS MAKER SRL");
    expect(r.payee?.idno).toBe("1020600033229");
    expect(r.payee?.iban).toBe("MD50AG000000022516524419");
    expect(r.payee?.bank).toBeNull();
  });

  it("a company name (legal-form suffix) extracted into administratorName is dropped", () => {
    const r = choosePayee(
      ext([
        {
          name: "NEWS MAKER SRL",
          role: "provider",
          administratorName: "Some Other Company SRL",
        },
      ]),
      null,
    );
    expect(r.payee?.administratorName).toBeNull();
  });

  it("does not disturb a well-formed bank/address/administrator on an otherwise-clean document", () => {
    const r = choosePayee(
      ext([
        {
          name: "NEWS MAKER SRL",
          role: "provider",
          idno: "1020600033229",
          iban: "MD50AG000000022516524419",
          bank: "BC Moldindconbank S.A.",
          legalAddress: "mun. Chișinău, sec. Botanica, str. Grenoble 128",
          administratorName: "Ion Popescu",
        },
      ]),
      null,
    );
    expect(r.payee?.bank).toBe("BC Moldindconbank S.A.");
    expect(r.payee?.legalAddress).toBe("mun. Chișinău, sec. Botanica, str. Grenoble 128");
    expect(r.payee?.administratorName).toBe("Ion Popescu");
  });
});
