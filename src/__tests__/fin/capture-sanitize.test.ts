/**
 * INVOICE-REPORTING — sanitizePgText (the http_500 upload fix).
 *
 * PDF text layers frequently contain a NUL (0x00). A Postgres `text` column rejects it with
 * "invalid byte sequence for encoding UTF8: 0x00", so the capture insert 500'd and the file
 * showed "Eroare". sanitizePgText strips NUL + C0 control chars (keeping \n and \t) so every
 * uploaded document is stored and analyzed.
 *
 * @vitest-environment node
 */
import { describe, it, expect } from "vitest";
import { sanitizePgText } from "../../../server/lib/fin/money";

const NUL = String.fromCharCode(0);
const BELL = String.fromCharCode(7); // C0 control
const VTAB = String.fromCharCode(11);

describe("sanitizePgText", () => {
  it("strips NUL bytes (the 0x00 that 500'd the insert)", () => {
    const out = sanitizePgText(`Invoice Acme${NUL} total 100 MDL${NUL}`);
    expect(out.includes(NUL)).toBe(false);
    expect(out).toContain("Invoice Acme");
    expect(out).toContain("100 MDL");
  });

  it("keeps newlines and tabs (needed by the statement parser)", () => {
    const out = sanitizePgText("line1\nline2\tcol");
    expect(out).toBe("line1\nline2\tcol");
  });

  it("replaces other C0 control chars with a space", () => {
    const out = sanitizePgText(`a${BELL}b${VTAB}c`);
    expect(out.includes(BELL)).toBe(false);
    expect(out.includes(VTAB)).toBe(false);
    expect(out).toBe("a b c");
  });

  it("leaves clean text untouched", () => {
    expect(sanitizePgText("FACEBK *5KBSL2RWA2 250.35 EUR")).toBe("FACEBK *5KBSL2RWA2 250.35 EUR");
  });
});
