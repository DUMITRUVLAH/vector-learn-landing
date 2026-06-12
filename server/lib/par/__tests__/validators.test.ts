/**
 * @vitest-environment node
 * PAR-003: IBAN + IDNP validator tests
 * Tests: T-PAR-003-5
 */
import { describe, it, expect } from "vitest";
import { isValidIBAN, isValidMoldovaIBAN, isValidIDNP } from "../validators";

describe("T-PAR-003-5 [blocant]: IBAN validation", () => {
  it("isValidMoldovaIBAN: valid MD IBAN from sample → true", () => {
    // Sample from PAR-CORE §0.12
    expect(isValidMoldovaIBAN("MD48ML000002259A19498121")).toBe(true);
  });

  it("isValidMoldovaIBAN: wrong check digits → false", () => {
    expect(isValidMoldovaIBAN("MD00ML000002259A19498121")).toBe(false);
  });

  it("isValidMoldovaIBAN: wrong format (too short) → false", () => {
    expect(isValidMoldovaIBAN("MD48ML0002")).toBe(false);
  });

  it("isValidMoldovaIBAN: non-MD IBAN → false", () => {
    // Romanian IBAN with correct checksum — should fail Moldova-specific check
    expect(isValidMoldovaIBAN("RO49AAAA1B31007593840000")).toBe(false);
  });

  it("isValidIBAN: known valid DE IBAN → true", () => {
    // DE89370400440532013000 is a well-known test IBAN
    expect(isValidIBAN("DE89370400440532013000")).toBe(true);
  });

  it("isValidIBAN: corrupted checksum → false", () => {
    expect(isValidIBAN("DE00370400440532013000")).toBe(false);
  });

  it("isValidIBAN: empty string → false", () => {
    expect(isValidIBAN("")).toBe(false);
  });
});

describe("T-PAR-003-5 [blocant]: IDNP validation", () => {
  it("isValidIDNP: valid 13-digit IDNP from sample → true", () => {
    expect(isValidIDNP("2008001007903")).toBe(true);
  });

  it("isValidIDNP: 12 digits → false", () => {
    expect(isValidIDNP("200800100790")).toBe(false);
  });

  it("isValidIDNP: 14 digits → false", () => {
    expect(isValidIDNP("20080010079034")).toBe(false);
  });

  it("isValidIDNP: contains letters → false", () => {
    expect(isValidIDNP("200800100790A")).toBe(false);
  });

  it("isValidIDNP: empty → false", () => {
    expect(isValidIDNP("")).toBe(false);
  });
});
