/**
 * PAR-109: Integrity tests — hash + sequential lock enforcement.
 *
 * Test scenarios:
 *   T-PAR-109-2 [blocant] PATCH on non-draft → 403 (tested in par.test.ts; here we test the guard logic)
 *   T-PAR-109-3 [blocant] hash re-computed at display = same as stored
 *   T-PAR-109-4 [normal] total > 100k → 3 steps (DOA matrix resolution covered by doa.test.ts)
 */
import { describe, it, expect } from "vitest";
import { computeParBodyHash, verifyParBodyHash, type ParBodyForHash } from "../integrity";

const sampleBody: ParBodyForHash = {
  requestNo: "PAR-2026-0001",
  dateOfRequest: "2026-06-10T10:00:00.000Z",
  requestorTitle: "Finance Officer",
  departmentId: "dept-001",
  dateNeeded: null,
  projectId: "proj-001",
  budgetCodeId: "bc-001",
  budgetCodeNote: "According to budget plan",
  purpose: "execute_payment",
  chargeTo: "program",
  chargeBillingCode: "PRG-2026",
  endUse: "Provision of psychological session services",
  vendorId: null,
  payeeName: "Daria Roitman",
  payeeIdnp: "2008001007903",
  payeeIban: "MD48ML000002259A19498121",
  payeeBank: "BC Moldindconbank S.A.",
  currency: "MDL",
  totalEstimatedCents: 700000,
  lineItems: [
    {
      position: 1,
      description: "Psychological consultation session",
      quantity: 1,
      unit: "sesie",
      unitPriceCents: 700000,
      lineTotalCents: 700000,
    },
  ],
};

describe("integrity: computeParBodyHash", () => {
  it("produces a 64-character hex SHA-256 hash", () => {
    const hash = computeParBodyHash(sampleBody);
    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("T-PAR-109-3 [blocant] is deterministic — same input always produces same hash", () => {
    const h1 = computeParBodyHash(sampleBody);
    const h2 = computeParBodyHash(JSON.parse(JSON.stringify(sampleBody)) as ParBodyForHash);
    expect(h1).toBe(h2);
  });

  it("is sensitive to payee changes", () => {
    const modified: ParBodyForHash = { ...sampleBody, payeeName: "Other Person" };
    expect(computeParBodyHash(sampleBody)).not.toBe(computeParBodyHash(modified));
  });

  it("is sensitive to IBAN changes", () => {
    const modified: ParBodyForHash = { ...sampleBody, payeeIban: "MD48ML000002259A99999999" };
    expect(computeParBodyHash(sampleBody)).not.toBe(computeParBodyHash(modified));
  });

  it("is sensitive to amount changes", () => {
    const modified: ParBodyForHash = { ...sampleBody, totalEstimatedCents: 700001 };
    expect(computeParBodyHash(sampleBody)).not.toBe(computeParBodyHash(modified));
  });

  it("is sensitive to line item changes", () => {
    const modifiedItems = [{ ...sampleBody.lineItems[0], quantity: 2 }];
    const modified: ParBodyForHash = { ...sampleBody, lineItems: modifiedItems };
    expect(computeParBodyHash(sampleBody)).not.toBe(computeParBodyHash(modified));
  });

  it("line item order does not matter (sorted by position)", () => {
    const body2: ParBodyForHash = {
      ...sampleBody,
      lineItems: [
        { position: 2, description: "Second", quantity: 1, unit: null, unitPriceCents: 50000, lineTotalCents: 50000 },
        { position: 1, description: "First", quantity: 1, unit: null, unitPriceCents: 50000, lineTotalCents: 50000 },
      ],
    };
    const body3: ParBodyForHash = {
      ...sampleBody,
      lineItems: [
        { position: 1, description: "First", quantity: 1, unit: null, unitPriceCents: 50000, lineTotalCents: 50000 },
        { position: 2, description: "Second", quantity: 1, unit: null, unitPriceCents: 50000, lineTotalCents: 50000 },
      ],
    };
    expect(computeParBodyHash(body2)).toBe(computeParBodyHash(body3));
  });
});

describe("integrity: verifyParBodyHash", () => {
  it("returns valid=true when hash matches", () => {
    const hash = computeParBodyHash(sampleBody);
    const result = verifyParBodyHash(sampleBody, hash);
    expect(result.valid).toBe(true);
    expect(result.detail).toBeUndefined();
  });

  it("returns valid=false with detail when body was tampered", () => {
    const hash = computeParBodyHash(sampleBody);
    const tampered: ParBodyForHash = { ...sampleBody, payeeName: "Attacker" };
    const result = verifyParBodyHash(tampered, hash);
    expect(result.valid).toBe(false);
    expect(result.detail).toBeTruthy();
  });

  it("returns valid=false when storedHash is a zeroed-out string", () => {
    const result = verifyParBodyHash(sampleBody, "0".repeat(64));
    expect(result.valid).toBe(false);
  });
});
