/**
 * VM1-05: auto-save payee into the vendor registry on payment — pure helper tests.
 *
 * Covers the non-trivial logic the route relies on:
 *   - normIban: spaces/case-insensitive normalization
 *   - findVendorByIban: dedup match (no duplicate vendors)
 *   - shouldAutoSaveVendor: only inline payees with an IBAN are remembered
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { normIban, findVendorByIban, shouldAutoSaveVendor } from "../vendorAutoSave";

describe("normIban", () => {
  it("strips spaces and uppercases", () => {
    expect(normIban("md24 ag00 0225 1000 1310 4168")).toBe("MD24AG000225100013104168");
    expect(normIban("  MD24AG000225100013104168  ")).toBe("MD24AG000225100013104168");
  });
  it("is idempotent", () => {
    const once = normIban("MD24 AG00 0225");
    expect(normIban(once)).toBe(once);
  });
});

describe("findVendorByIban — dedup match", () => {
  const vendors = [
    { id: "v1", iban: "MD24AG000225100013104168" },
    { id: "v2", iban: "md11 vi00 0000 0000 0000 0001" },
    { id: "v3", iban: null },
  ];

  it("matches ignoring spaces and case", () => {
    expect(findVendorByIban(vendors, "md24 ag00 0225 1000 1310 4168")?.id).toBe("v1");
    expect(findVendorByIban(vendors, "MD11VI000000000000000001")?.id).toBe("v2");
  });

  it("returns undefined when no vendor matches (→ a new vendor is created)", () => {
    expect(findVendorByIban(vendors, "MD99ZZ999999999999999999")).toBeUndefined();
  });

  it("ignores vendors without an IBAN and an empty query", () => {
    expect(findVendorByIban(vendors, "")).toBeUndefined();
    expect(findVendorByIban([{ id: "x", iban: null }], "MD24AG000225100013104168")).toBeUndefined();
  });
});

describe("shouldAutoSaveVendor", () => {
  it("saves an inline payee that has an IBAN", () => {
    expect(shouldAutoSaveVendor({ vendorId: null, payeeIban: "MD24AG000225100013104168" })).toBe(true);
  });

  it("does NOT save when already linked to a registry vendor", () => {
    expect(shouldAutoSaveVendor({ vendorId: "v1", payeeIban: "MD24AG000225100013104168" })).toBe(false);
  });

  it("does NOT save when there is no IBAN to remember", () => {
    expect(shouldAutoSaveVendor({ vendorId: null, payeeIban: null })).toBe(false);
    expect(shouldAutoSaveVendor({ vendorId: null, payeeIban: "   " })).toBe(false);
  });
});
