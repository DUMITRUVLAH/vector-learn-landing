/**
 * VM1-05 — "salvat în registru ✓" indicator after payment auto-saves vendor
 *
 * T-VM1-05-1 [blocant] autoSaved = true when vendor was null before, set after payment
 * T-VM1-05-2 [blocant] autoSaved = false when PAR already had a vendorId
 * T-VM1-05-3 [normal]  autoSaved = false when payment status is reapproval_required
 * T-VM1-05-4 [normal]  autoSaved = false when result.par.vendorId is null (IBAN-less payee)
 */
import { describe, it, expect } from "vitest";

// Mirror the condition from PayModal.handlePay
function didAutoSave(params: {
  resultStatus: "paid" | "reapproval_required";
  originalVendorId: string | null;
  resultVendorId: string | null;
}): boolean {
  return (
    params.resultStatus === "paid" &&
    !params.originalVendorId &&
    !!params.resultVendorId
  );
}

describe("VM1-05 vendor auto-save indicator", () => {
  it("T-VM1-05-1 [blocant] autoSaved=true when vendorId was null → set after paid", () => {
    expect(
      didAutoSave({ resultStatus: "paid", originalVendorId: null, resultVendorId: "vendor-uuid" })
    ).toBe(true);
  });

  it("T-VM1-05-2 [blocant] autoSaved=false when PAR already had a vendorId", () => {
    expect(
      didAutoSave({ resultStatus: "paid", originalVendorId: "existing-vendor", resultVendorId: "existing-vendor" })
    ).toBe(false);
  });

  it("T-VM1-05-3 [normal] autoSaved=false when status is reapproval_required", () => {
    expect(
      didAutoSave({ resultStatus: "reapproval_required", originalVendorId: null, resultVendorId: "vendor-uuid" })
    ).toBe(false);
  });

  it("T-VM1-05-4 [normal] autoSaved=false when result vendorId is null (no IBAN, no auto-save)", () => {
    expect(
      didAutoSave({ resultStatus: "paid", originalVendorId: null, resultVendorId: null })
    ).toBe(false);
  });
});
