/**
 * STMT-005: statement line → e-Factura SFS — pure helpers (no db, no AI, no HTTP).
 *
 * This module is the SINGLE source of truth for:
 *   1. whether a statement line may become an e-Factura (validateLineForEfactura)
 *   2. how the SFS XML input is built from a line (buildSfsInvoiceInputFromLine)
 * Both the submit routes (finStatement.ts) and the unit tests import THESE functions —
 * never a local copy (lesson §3.5.1quater: a test that mocks a dead copy passes while
 * prod breaks).
 *
 * Why validation is strict: the real SFS PostInvoices rejects an invoice without a buyer
 * IDNO with the opaque ".NET Object reference not set to an instance" — we saw it live.
 * Better a clear 422 here than a cryptic SFS error after submission.
 */
import type { SfsInvoiceInput } from "../efacturaMoldova";

/** The subset of a fin_capture_lines row the helpers need. */
export interface LineForEfactura {
  amountCents: number;
  direction: string;
  linkedFinInvoiceId: string | null;
  counterpartyIdno: string | null;
  counterpartyIban: string | null;
  counterparty: string | null;
  description: string | null;
  txDate: string | null;
}

export type EfacturaLineError =
  | "amount_zero"
  | "already_exported"
  | "only_incoming"
  | "missing_buyer_idno";

const ERROR_MESSAGES: Record<EfacturaLineError, string> = {
  amount_zero: "Suma liniei este zero — nu se poate emite factură.",
  already_exported: "Linia are deja o e-Factura emisă.",
  only_incoming:
    "Doar încasările (IN) pot deveni e-Facturi emise de tine. Pentru plăți (OUT), factura o emite furnizorul.",
  missing_buyer_idno:
    "Lipsește IDNO-ul cumpărătorului. Completează-l pe linie (Editează → IDNO) înainte de a genera factura.",
};

export function efacturaErrorMessage(code: EfacturaLineError): string {
  return ERROR_MESSAGES[code];
}

/** Returns null when the line is valid, or the first blocking error code. */
export function validateLineForEfactura(line: LineForEfactura): EfacturaLineError | null {
  if (line.amountCents === 0) return "amount_zero";
  if (line.linkedFinInvoiceId) return "already_exported";
  if (line.direction !== "in") return "only_incoming";
  if (!line.counterpartyIdno || !/^\d{7,13}$/.test(line.counterpartyIdno)) return "missing_buyer_idno";
  return null;
}

export interface SupplierInfo {
  idno: string;
  bankAccount: string;
}

/**
 * Build the exact SfsInvoiceInput shape generateSfsInvoiceXml expects.
 * (The old call site passed a different shape — `deliveryDate` was undefined, so
 * `new Date(undefined).toISOString()` threw before anything reached SFS.)
 */
export function buildSfsInvoiceInputFromLine(
  line: LineForEfactura,
  supplier: SupplierInfo,
  internalId: string,
): SfsInvoiceInput {
  return {
    supplierIdno: supplier.idno,
    supplierBankAccount: supplier.bankAccount,
    buyerIdno: line.counterpartyIdno ?? "",
    buyerBankAccount: line.counterpartyIban ?? undefined,
    deliveryDate: line.txDate ? new Date(line.txDate) : new Date(),
    internalId,
    lines: [
      {
        code: "SRV",
        name: (line.description ?? "Servicii prestate").slice(0, 200),
        unitOfMeasure: "buc",
        quantity: 1,
        // Statement amounts are FINAL amounts received — export without adding VAT on top.
        unitPriceWithoutVat: line.amountCents / 100,
        vatRate: 0,
      },
    ],
  };
}
