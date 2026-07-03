/**
 * PAR-F3: AI Beneficiary vs Bank extraction quality tests.
 *
 * Tests the pure classifier functions and the mapping logic used in parAiPrefill.ts.
 * All tests are deterministic and need no API key (pure functions + stub data).
 */
import { describe, it, expect } from "vitest";
import { isPayeeBank, extractBeneficiaryFromVendorName } from "../../../server/lib/par/payeeBankClassifier";

// ─── isPayeeBank ─────────────────────────────────────────────────────────────

describe("isPayeeBank", () => {
  it("detects BC Moldindconbank S.A. as a bank", () => {
    expect(isPayeeBank("BC Moldindconbank S.A.")).toBe(true);
  });

  it("detects Maib as a bank", () => {
    expect(isPayeeBank("Maib")).toBe(true);
  });

  it("detects Victoriabank as a bank", () => {
    expect(isPayeeBank("Victoriabank")).toBe(true);
  });

  it("detects Banca Transilvania as a bank", () => {
    expect(isPayeeBank("Banca Transilvania")).toBe(true);
  });

  it("does NOT flag Ion Popescu as a bank", () => {
    expect(isPayeeBank("Ion Popescu")).toBe(false);
  });

  it("does NOT flag Demo Furnizor SRL as a bank", () => {
    expect(isPayeeBank("Demo Furnizor SRL")).toBe(false);
  });

  it("does NOT flag Association Culturala Armonii as a bank", () => {
    expect(isPayeeBank("Asociatia Culturala Armonii")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isPayeeBank("")).toBe(false);
  });
});

// ─── extractBeneficiaryFromVendorName ────────────────────────────────────────

describe("extractBeneficiaryFromVendorName", () => {
  it("extracts beneficiary from embedded 'Beneficiar: <name>' text", () => {
    expect(
      extractBeneficiaryFromVendorName("Beneficiar: Ion Popescu, Banca: Maib")
    ).toBe("Ion Popescu");
  });

  it("extracts beneficiary from English 'Beneficiary: <name>' label", () => {
    expect(
      extractBeneficiaryFromVendorName("Beneficiary: Asociatia Sport")
    ).toBe("Asociatia Sport");
  });

  it("returns null for a plain bank name with no embedded beneficiary", () => {
    expect(
      extractBeneficiaryFromVendorName("BC Moldindconbank S.A.")
    ).toBeNull();
  });

  it("returns null for null input", () => {
    expect(extractBeneficiaryFromVendorName(null)).toBeNull();
  });
});

// ─── Mapping logic (mirrors parAiPrefill.ts post-processing) ─────────────────

/**
 * Simulate the mapping logic from parAiPrefill.ts to assert bank → payeeBank
 * and actual beneficiary → payeeName.
 */
function simulatePrefillMapping(extracted: {
  vendor_name: string | null;
  beneficiary_name: string | null;
  bank_name: string | null;
}): { payeeName: string | null; payeeBank: string | null } {
  const vendorValue = extracted.vendor_name;
  const beneficiaryValue = extracted.beneficiary_name;
  const bankValue = extracted.bank_name;

  const vendorIsBank = vendorValue ? isPayeeBank(vendorValue) : false;

  let payeeName: string | null;
  if (beneficiaryValue) {
    payeeName = beneficiaryValue;
  } else if (vendorIsBank) {
    payeeName = null;
  } else {
    payeeName = vendorValue;
  }

  const payeeBank = bankValue ?? (vendorIsBank ? vendorValue : null);
  return { payeeName, payeeBank };
}

describe("PAR prefill bank/beneficiary mapping logic", () => {
  it("routes bank vendor_name to payeeBank, leaves payeeName null when no beneficiary_name", () => {
    const result = simulatePrefillMapping({
      vendor_name: "BC Moldindconbank S.A.",
      beneficiary_name: null,
      bank_name: null,
    });
    expect(result.payeeBank).toBe("BC Moldindconbank S.A.");
    expect(result.payeeName).toBeNull();
  });

  it("routes explicit bank_name to payeeBank, beneficiary_name to payeeName", () => {
    const result = simulatePrefillMapping({
      vendor_name: "BC Moldindconbank S.A.",
      beneficiary_name: "Ion Popescu",
      bank_name: "BC Moldindconbank S.A.",
    });
    expect(result.payeeName).toBe("Ion Popescu");
    expect(result.payeeBank).toBe("BC Moldindconbank S.A.");
  });

  it("non-bank vendor_name stays as payeeName, payeeBank is null", () => {
    const result = simulatePrefillMapping({
      vendor_name: "Demo Furnizor SRL",
      beneficiary_name: null,
      bank_name: null,
    });
    expect(result.payeeName).toBe("Demo Furnizor SRL");
    expect(result.payeeBank).toBeNull();
  });

  it("bank_name takes precedence over vendor_name for payeeBank even when vendor is not detected as bank", () => {
    const result = simulatePrefillMapping({
      vendor_name: "Demo Furnizor SRL",
      beneficiary_name: null,
      bank_name: "Victoriabank",
    });
    expect(result.payeeBank).toBe("Victoriabank");
    expect(result.payeeName).toBe("Demo Furnizor SRL");
  });

  it("all null inputs produce null payeeName and null payeeBank", () => {
    const result = simulatePrefillMapping({
      vendor_name: null,
      beneficiary_name: null,
      bank_name: null,
    });
    expect(result.payeeName).toBeNull();
    expect(result.payeeBank).toBeNull();
  });
});
