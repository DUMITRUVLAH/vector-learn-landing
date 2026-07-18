/**
 * PAR-107: Tests for the submit engine and routing logic.
 *
 * Test scenarios (from backlog/par/TEST-SCENARIOS.md):
 *   T-PAR-107-1 [blocant] total > threshold → 2 steps (DOA Holder → Executive Director)
 *   T-PAR-107-2 [blocant] total ≤ threshold → 1 step
 *   T-PAR-107-3 [blocant] requestor = approver → self-approval blocked
 *   T-PAR-107-5 [blocant] body hash computed + saved
 *   T-PAR-107-6 [normal] submit incomplete PAR (no lines) → validation errors
 */
import { describe, it, expect, vi } from "vitest";

// This suite exercises only pure validation/hash helpers. Mock the DB module before importing
// submit.ts so Vitest workers never boot an embedded Postgres instance for unit-only assertions.
vi.mock("../../../db/client", () => ({ db: {} }));

import { validateParForSubmit, type SubmitValidationError } from "../submit";
import { computeParBodyHash, verifyParBodyHash, type ParBodyForHash } from "../integrity";
import type { ParRequest, ParLineItem } from "../../db/schema/par";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeParRequest(overrides: Partial<ParRequest> = {}): ParRequest {
  return {
    id: "par-uuid-001",
    tenantId: "tenant-001",
    requestNo: "PAR-2026-0001",
    dateOfRequest: new Date("2026-06-10"),
    requestedByUserId: "user-requestor",
    requestorTitle: "Procurement Specialist",
    departmentId: null,
    dateNeeded: null,
    projectId: null,
    budgetCodeId: null,
    budgetCodeNote: null,
    purpose: "execute_payment",
    chargeTo: "program",
    chargeBillingCode: null,
    endUse: "Group psychological consulting services",
    vendorId: null,
    payeeName: "Daria Roitman",
    payeeIdnp: "2008001007903",
    payeeIban: "MD48ML000002259A19498121",
    payeeBank: "Moldindconbank",
    attachmentsPresent: false,
    attachmentsNote: null,
    currency: "MDL",
    totalEstimatedCents: 700000,
    status: "draft",
    submittedAt: null,
    approvedAt: null,
    paidAt: null,
    cancelledAt: null,
    bodyHash: null,
    createdAt: new Date("2026-06-10"),
    updatedAt: new Date("2026-06-10"),
    ...overrides,
  } as unknown as ParRequest;
}

function makeLineItem(overrides: Partial<ParLineItem> = {}): ParLineItem {
  return {
    id: "line-001",
    tenantId: "tenant-001",
    parId: "par-uuid-001",
    position: 1,
    description: "Psychological session",
    quantity: 1,
    unit: "sesie",
    unitPriceCents: 700000,
    lineTotalCents: 700000,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as unknown as ParLineItem;
}

// ─── T-PAR-107-6: validation failures ────────────────────────────────────────

describe("validateParForSubmit", () => {
  it("T-PAR-107-6 [normal] returns error when no line items", () => {
    const par = makeParRequest();
    const errors = validateParForSubmit(par, []);
    expect(errors.some((e: SubmitValidationError) => e.field === "line_items")).toBe(true);
  });

  it("returns error when total is 0", () => {
    const par = makeParRequest({ totalEstimatedCents: 0 });
    const errors = validateParForSubmit(par, [makeLineItem({ lineTotalCents: 0, unitPriceCents: 0 })]);
    expect(errors.some((e: SubmitValidationError) => e.field === "total")).toBe(true);
  });

  it("returns error for execute_payment with no end_use", () => {
    const par = makeParRequest({ purpose: "execute_payment", endUse: null });
    const errors = validateParForSubmit(par, [makeLineItem()]);
    expect(errors.some((e: SubmitValidationError) => e.field === "end_use")).toBe(true);
  });

  it("returns error for execute_payment with no payee", () => {
    const par = makeParRequest({
      purpose: "execute_payment",
      endUse: "Test",
      vendorId: null,
      payeeName: null,
      payeeIban: null,
    });
    const errors = validateParForSubmit(par, [makeLineItem()]);
    expect(errors.some((e: SubmitValidationError) => e.field === "payee")).toBe(true);
  });

  it("returns no errors for a complete execute_payment PAR", () => {
    const par = makeParRequest();
    const errors = validateParForSubmit(par, [makeLineItem()]);
    expect(errors).toHaveLength(0);
  });

  it("returns no errors for obtain_quotations without payee (no payee required)", () => {
    const par = makeParRequest({
      purpose: "obtain_quotations",
      payeeName: null,
      payeeIban: null,
      vendorId: null,
    });
    const errors = validateParForSubmit(par, [makeLineItem()]);
    expect(errors).toHaveLength(0);
  });
});

// ─── T-PAR-107-5: hash computation ───────────────────────────────────────────

describe("computeParBodyHash", () => {
  const baseBody: ParBodyForHash = {
    requestNo: "PAR-2026-0001",
    dateOfRequest: "2026-06-10T00:00:00.000Z",
    requestorTitle: "Procurement Specialist",
    departmentId: null,
    dateNeeded: null,
    projectId: null,
    budgetCodeId: null,
    budgetCodeNote: null,
    purpose: "execute_payment",
    chargeTo: "program",
    chargeBillingCode: null,
    endUse: "Group psychological consulting services",
    vendorId: null,
    payeeName: "Daria Roitman",
    payeeIdnp: "2008001007903",
    payeeIban: "MD48ML000002259A19498121",
    payeeBank: "Moldindconbank",
    currency: "MDL",
    totalEstimatedCents: 700000,
    lineItems: [
      {
        position: 1,
        description: "Psychological session",
        quantity: 1,
        unit: "sesie",
        unitPriceCents: 700000,
        lineTotalCents: 700000,
      },
    ],
  };

  it("T-PAR-107-5 [blocant] returns a 64-char hex string", () => {
    const hash = computeParBodyHash(baseBody);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("T-PAR-109-3 [blocant] re-computing the same body produces the same hash", () => {
    const hash1 = computeParBodyHash(baseBody);
    const hash2 = computeParBodyHash({ ...baseBody });
    expect(hash1).toBe(hash2);
  });

  it("changing any field changes the hash", () => {
    const hash1 = computeParBodyHash(baseBody);
    const hash2 = computeParBodyHash({ ...baseBody, payeeName: "Other Person" });
    expect(hash1).not.toBe(hash2);
  });

  it("changing a line item changes the hash", () => {
    const hash1 = computeParBodyHash(baseBody);
    const modified = {
      ...baseBody,
      lineItems: [{ ...baseBody.lineItems[0], unitPriceCents: 600000 }],
    };
    const hash2 = computeParBodyHash(modified);
    expect(hash1).not.toBe(hash2);
  });

  it("verifyParBodyHash returns valid=true on match", () => {
    const hash = computeParBodyHash(baseBody);
    const result = verifyParBodyHash(baseBody, hash);
    expect(result.valid).toBe(true);
  });

  it("verifyParBodyHash returns valid=false on mismatch", () => {
    const hash = computeParBodyHash(baseBody);
    const tampered = { ...baseBody, payeeName: "Tampered Name" };
    const result = verifyParBodyHash(tampered, hash);
    expect(result.valid).toBe(false);
    expect(result.detail).toBeDefined();
  });
});
