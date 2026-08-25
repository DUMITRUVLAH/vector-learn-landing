/**
 * Unit tests for fieldSanity.ts — the cross-field "does this value actually look like what its
 * slot claims?" checks that sit between extraction (LLM or regex stub) and the API response.
 */

import { describe, it, expect } from "vitest";
import { looksLikeFiscalId, looksLikeIban, sanitizeRequisites } from "../fieldSanity";

describe("looksLikeFiscalId", () => {
  it("13 digits, spaces allowed", () => {
    expect(looksLikeFiscalId("1020600033229")).toBe(true);
    expect(looksLikeFiscalId("1 020 600 033 229")).toBe(true);
  });
  it("rejects non-13-digit / non-numeric", () => {
    expect(looksLikeFiscalId("12345")).toBe(false);
    expect(looksLikeFiscalId("BC Moldindconbank S.A.")).toBe(false);
  });
});

describe("looksLikeIban", () => {
  it("MD IBAN shape", () => {
    expect(looksLikeIban("MD50AG000000022516524419")).toBe(true);
    expect(looksLikeIban("md50 ag00 0000 0225 1652 4419")).toBe(true);
  });
  it("foreign IBAN shape", () => {
    expect(looksLikeIban("DE89370400440532013000")).toBe(true);
  });
  it("rejects a plain bank name", () => {
    expect(looksLikeIban("BC Moldindconbank S.A.")).toBe(false);
  });
});

describe("sanitizeRequisites — bank slot", () => {
  it("recovers a fiscal id misplaced in `bank`, drops it from bank", () => {
    const r = sanitizeRequisites({ bank: "1020600033229" });
    expect(r.bank).toBeNull();
    expect(r.recoveredIdno).toBe("1020600033229");
    expect(r.recoveredIban).toBeNull();
  });

  it("recovers an IBAN misplaced in `bank`, drops it from bank", () => {
    const r = sanitizeRequisites({ bank: "MD50AG000000022516524419" });
    expect(r.bank).toBeNull();
    expect(r.recoveredIban).toBe("MD50AG000000022516524419");
    expect(r.recoveredIdno).toBeNull();
  });

  it("drops an address-contaminated bank value", () => {
    const r = sanitizeRequisites({
      bank: '"NEWS MAKER" SRL, cu sediul in mun. Chisinau, sec. Botanica, str. Grenoble nr. 128',
    });
    expect(r.bank).toBeNull();
  });

  it("drops an implausibly long bank value", () => {
    const r = sanitizeRequisites({ bank: "x".repeat(150) });
    expect(r.bank).toBeNull();
  });

  it("keeps a genuine short bank name untouched", () => {
    expect(sanitizeRequisites({ bank: "BC Moldindconbank S.A." }).bank).toBe(
      "BC Moldindconbank S.A.",
    );
    expect(sanitizeRequisites({ bank: "Deutsche Bank AG" }).bank).toBe("Deutsche Bank AG");
    // A foreign bank with no recognizable "bank" keyword must still be trusted when it's
    // otherwise well-formed (short, no address/IBAN/fiscal-id contamination) — we don't require
    // it to match a hardcoded bank-name keyword list, only that it isn't obviously something else.
    expect(sanitizeRequisites({ bank: "BNP Paribas" }).bank).toBe("BNP Paribas");
  });
});

describe("sanitizeRequisites — legalAddress slot", () => {
  it("drops an IBAN/fiscal-id misplaced in legalAddress", () => {
    expect(sanitizeRequisites({ legalAddress: "MD50AG000000022516524419" }).legalAddress).toBeNull();
    expect(sanitizeRequisites({ legalAddress: "1020600033229" }).legalAddress).toBeNull();
  });
  it("keeps a genuine address", () => {
    expect(sanitizeRequisites({ legalAddress: "mun. Chișinău, str. Columna 170" }).legalAddress).toBe(
      "mun. Chișinău, str. Columna 170",
    );
  });
});

describe("sanitizeRequisites — administratorName slot", () => {
  it("drops a company-name-shaped value (legal form suffix)", () => {
    expect(sanitizeRequisites({ administratorName: "NEWS MAKER SRL" }).administratorName).toBeNull();
  });
  it("drops an IBAN/fiscal-id misplaced in administratorName", () => {
    expect(
      sanitizeRequisites({ administratorName: "MD50AG000000022516524419" }).administratorName,
    ).toBeNull();
  });
  it("keeps a genuine person name", () => {
    expect(sanitizeRequisites({ administratorName: "Vasile Cojocaru" }).administratorName).toBe(
      "Vasile Cojocaru",
    );
  });
});
