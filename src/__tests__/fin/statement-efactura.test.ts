/**
 * STMT-003: Statement e-Factura submission — unit tests
 *
 * T-STMT-003-1 [blocant]  Given zero amountCents, when submit-efactura, then 400 (no-zero amounts)
 * T-STMT-003-2 [blocant]  Given already-linked line, when submit-efactura, then 409 (no duplicate)
 * T-STMT-003-3 [blocant]  Given valid line, when submit-efactura, then creates finEinvoice record
 * T-STMT-003-4 [normal]   batchSubmit schema validates lineIds array bounds (min 1, max 50)
 * T-STMT-003-5 [blocant]  POST /api/fin/statement/:id/submit-efactura returns 200 with einvoiceId
 */
import { describe, it, expect } from "vitest";
import { z } from "zod";

// ─── Backend: batchSubmit schema validation (pure) ───────────────────────────

const batchSubmitSchema = z.object({
  lineIds: z.array(z.string().uuid()).min(1).max(50),
});

describe("STMT-003: batchSubmit schema (pure)", () => {
  it("T-STMT-003-4 [normal]: rejects empty lineIds", () => {
    const result = batchSubmitSchema.safeParse({ lineIds: [] });
    expect(result.success).toBe(false);
  });

  it("rejects lineIds exceeding 50", () => {
    const ids = Array.from({ length: 51 }, (_, i) =>
      `c0a80101-0000-4000-a000-${String(i).padStart(12, "0")}`
    );
    const result = batchSubmitSchema.safeParse({ lineIds: ids });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 1 uuid", () => {
    const result = batchSubmitSchema.safeParse({
      lineIds: ["c0a80101-0000-4000-a000-000000000001"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts exactly 50 uuids", () => {
    const ids = Array.from({ length: 50 }, (_, i) =>
      `c0a80101-0000-4000-a000-${String(i).padStart(12, "0")}`
    );
    const result = batchSubmitSchema.safeParse({ lineIds: ids });
    expect(result.success).toBe(true);
  });

  it("rejects non-uuid strings", () => {
    const result = batchSubmitSchema.safeParse({ lineIds: ["not-a-uuid"] });
    expect(result.success).toBe(false);
  });
});

// ─── Backend: line validation rules — the REAL module the routes use ─────────
// (STMT-005 replaced the local test-only copy: a test that exercises a dead copy
// passes while prod breaks — §3.5.1quater. These now import the exact functions
// finStatement.ts calls; the endpoints themselves are exercised for real in
// server/__tests__/statementEfactura.routes.test.ts against PGlite.)

import {
  validateLineForEfactura,
  type LineForEfactura,
} from "../../../server/lib/fin/statementEfactura";

const baseLine: LineForEfactura = {
  amountCents: 15000,
  direction: "in",
  linkedFinInvoiceId: null,
  counterpartyIdno: "1009600020033",
  counterpartyIban: "MD94AG000000022512036601",
  counterparty: "AMDARIS S.R.L.",
  description: "Plata pentru Servicii",
  txDate: "2026-05-07",
};

describe("STMT-003/005: submit validation rules (REAL module)", () => {
  it("T-STMT-003-1 [blocant]: rejects zero amount", () => {
    expect(validateLineForEfactura({ ...baseLine, amountCents: 0 })).toBe("amount_zero");
  });

  it("T-STMT-003-2 [blocant]: rejects already-linked line", () => {
    expect(validateLineForEfactura({ ...baseLine, linkedFinInvoiceId: "x" })).toBe("already_exported");
  });

  it("T-STMT-003-3 [blocant]: accepts valid unlinked incoming line", () => {
    expect(validateLineForEfactura(baseLine)).toBeNull();
  });

  it("T-STMT-005 [blocant]: rejects OUT lines (e-Factura only for incoming payments)", () => {
    expect(validateLineForEfactura({ ...baseLine, direction: "out" })).toBe("only_incoming");
  });

  it("T-STMT-005 [blocant]: rejects missing buyer IDNO", () => {
    expect(validateLineForEfactura({ ...baseLine, counterpartyIdno: null })).toBe("missing_buyer_idno");
  });

  it("accepts large amount", () => {
    expect(validateLineForEfactura({ ...baseLine, amountCents: 100_000_00 })).toBeNull();
  });
});
