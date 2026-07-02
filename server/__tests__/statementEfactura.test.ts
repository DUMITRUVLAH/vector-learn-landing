/**
 * @vitest-environment node
 * STMT-005: statement line → e-Factura — pure helper tests.
 *
 * These import the REAL functions the routes use (server/lib/fin/statementEfactura.ts) —
 * never a local copy (§3.5.1quater: a test that exercises a dead copy passes while prod
 * breaks).
 *
 * Regression locked here: the old call site passed `{invoiceNumber, issueDate, buyerName}`
 * into generateSfsInvoiceXml (which expects `{deliveryDate, internalId, …}`), so
 * `new Date(undefined).toISOString()` THREW before anything reached SFS, and buyerIdno was
 * hardcoded "". The new builder must produce a valid XML with the buyer IDNO from the line.
 */
import { describe, it, expect } from "vitest";
import {
  validateLineForEfactura,
  buildSfsInvoiceInputFromLine,
  efacturaErrorMessage,
  type LineForEfactura,
} from "../lib/fin/statementEfactura";
import { generateSfsInvoiceXml } from "../lib/efacturaMoldova";

const validLine: LineForEfactura = {
  amountCents: 786_600,
  direction: "in",
  linkedFinInvoiceId: null,
  counterpartyIdno: "1009600020033",
  counterpartyIban: "MD94AG000000022512036601",
  counterparty: "AMDARIS S.R.L.",
  description: "Plata pentru Servicii instruire conform Factura Nr.224",
  txDate: "2026-05-07",
};

const SUPPLIER = { idno: "1024600035737", bankAccount: "MD87AG000000022516065719" };

describe("STMT-005: validateLineForEfactura (REAL module, used by the routes)", () => {
  it("[blocant] rejects zero amount", () => {
    expect(validateLineForEfactura({ ...validLine, amountCents: 0 })).toBe("amount_zero");
  });

  it("[blocant] rejects already-exported line", () => {
    expect(validateLineForEfactura({ ...validLine, linkedFinInvoiceId: "some-id" })).toBe("already_exported");
  });

  it("[blocant] rejects OUT lines — e-Factura is issued only for incoming payments", () => {
    expect(validateLineForEfactura({ ...validLine, direction: "out" })).toBe("only_incoming");
  });

  it("[blocant] rejects missing buyer IDNO — real SFS dies with an opaque .NET null-ref on it", () => {
    expect(validateLineForEfactura({ ...validLine, counterpartyIdno: null })).toBe("missing_buyer_idno");
    expect(validateLineForEfactura({ ...validLine, counterpartyIdno: "abc" })).toBe("missing_buyer_idno");
  });

  it("accepts a valid incoming line with IDNO", () => {
    expect(validateLineForEfactura(validLine)).toBeNull();
  });

  it("every error code has a human message", () => {
    for (const code of ["amount_zero", "already_exported", "only_incoming", "missing_buyer_idno"] as const) {
      expect(efacturaErrorMessage(code).length).toBeGreaterThan(10);
    }
  });
});

describe("STMT-005: buildSfsInvoiceInputFromLine → generateSfsInvoiceXml", () => {
  it("[blocant] produces valid XML with the buyer IDNO and bank account from the line", () => {
    const input = buildSfsInvoiceInputFromLine(validLine, SUPPLIER, "internal-id-123");
    const xml = generateSfsInvoiceXml(input);
    expect(xml).toContain('<Buyer IDNO="1009600020033">');
    expect(xml).toContain('<BankAccount Account="MD94AG000000022512036601" />');
    expect(xml).toContain(`<Supplier IDNO="${SUPPLIER.idno}">`);
    expect(xml).toContain("<CreationMotiv>1</CreationMotiv>"); // mandatory for real SFS
    expect(xml).toContain("<id>internal-id-123</id>");
    // Amount exported as final sum, no VAT added on top
    expect(xml).toContain('UnitPriceWithoutTVA="7866.00"');
    expect(xml).toContain('TotalPrice="7866.00"');
    expect(xml).toContain('TVA="0"');
  });

  it("[blocant] regression: does NOT throw on a line without txDate (old shape threw Invalid time value)", () => {
    const input = buildSfsInvoiceInputFromLine({ ...validLine, txDate: null }, SUPPLIER, "x");
    expect(() => generateSfsInvoiceXml(input)).not.toThrow();
  });

  it("[blocant] deliveryDate comes from the transaction date", () => {
    const input = buildSfsInvoiceInputFromLine(validLine, SUPPLIER, "x");
    const xml = generateSfsInvoiceXml(input);
    expect(xml).toContain("<DeliveryDate>2026-05-07");
  });

  it("escapes XML-hostile characters in descriptions", () => {
    const nasty = { ...validLine, description: 'Plata <servicii> & "training"' };
    const xml = generateSfsInvoiceXml(buildSfsInvoiceInputFromLine(nasty, SUPPLIER, "x"));
    expect(xml).not.toContain("<servicii>");
    expect(xml).toContain("&lt;servicii&gt;");
  });
});
