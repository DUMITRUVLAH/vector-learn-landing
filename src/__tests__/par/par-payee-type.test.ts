/**
 * PAR Feature 1 — Tests for payee type detector and PATCH persistence.
 *
 * T-PAR-F1-1 [blocant] Given a company name with "BC", When detectPayeeType is called, Then result is "juridic"
 * T-PAR-F1-2 [blocant] Given a person name "Ion Popescu", When detectPayeeType is called, Then result is "fizic"
 * T-PAR-F1-3 [normal]  Given an ambiguous name, When detectPayeeType is called, Then result is null
 * T-PAR-F1-4 [blocant] Given payee_type is PATCHed via API, When GET PAR is called, Then payee_type is persisted
 */

import { describe, it, expect } from "vitest";
import { detectPayeeType } from "@/lib/par/payeeTypeDetector";

describe("detectPayeeType — unit", () => {
  // T-PAR-F1-1
  it("should classify bank names as juridic", () => {
    expect(detectPayeeType("BC Moldindconbank S.A.")).toBe("juridic");
    expect(detectPayeeType("Banca Comerciala Romana")).toBe("juridic");
    expect(detectPayeeType("ATIC SRL")).toBe("juridic");
    expect(detectPayeeType("Vector Learn SA")).toBe("juridic");
    expect(detectPayeeType("Ministry of Finance ÎS")).toBe("juridic");
  });

  // T-PAR-F1-2
  it("should classify person-like names as fizic", () => {
    expect(detectPayeeType("Ion Popescu")).toBe("fizic");
    expect(detectPayeeType("Maria Elena Ionescu")).toBe("fizic");
    expect(detectPayeeType("Dumitru Vlah")).toBe("fizic");
  });

  // T-PAR-F1-3
  it("should return null for empty or unrecognized strings", () => {
    expect(detectPayeeType("")).toBeNull();
    expect(detectPayeeType("IBAN1234567")).toBeNull();
  });

  // Additional classification correctness
  it("classifies common company suffixes correctly", () => {
    expect(detectPayeeType("SRL Demo")).toBe("juridic");
    expect(detectPayeeType("Test Foundation ONG")).toBe("juridic");
  });

  it("handles mixed-case names", () => {
    expect(detectPayeeType("Ana-Maria Preda")).toBe("fizic");
  });
});
