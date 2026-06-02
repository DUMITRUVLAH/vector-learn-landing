/**
 * PAY-003: EPC069-12 QR code generator for SEPA Credit Transfer
 * Standard: EPC069-12 (European Payments Council)
 * Compatible with: BT Pay, BCR George, Revolut, ING Home'Bank, etc.
 *
 * QR payload format:
 *   BCD        — Service Tag
 *   002        — Version (001 or 002)
 *   1          — Encoding (1 = UTF-8)
 *   SCT        — Identification (SEPA Credit Transfer)
 *   {BIC}      — Beneficiary BIC (optional in v002)
 *   {Name}     — Beneficiary Name (max 70 chars)
 *   {IBAN}     — Beneficiary IBAN
 *   EUR{amount} — Amount (optional, e.g. EUR150.00)
 *   {purpose}  — Purpose Code (empty for generic)
 *   {reference} — Remittance info structured (empty if unstructured)
 *   {message}  — Remittance info unstructured (invoice number as reference)
 */
import QRCode from "qrcode";

interface EpcQrParams {
  /** IBAN of the beneficiary (e.g. "RO49AAAA1B31007593840000") */
  iban: string;
  /** BIC of the beneficiary's bank (e.g. "BTRLRO22") — optional in EPC v002 */
  bic?: string | null;
  /** Beneficiary name (e.g. "Academia Muzicală SRL") */
  name: string;
  /** Amount in EUR (or local currency converted). Set to 0 to omit. */
  amountEur?: number;
  /** Reference text — appears in the message field (e.g. invoice number) */
  reference?: string;
}

/**
 * Generates an EPC069-12 QR code data URL.
 * Returns null if IBAN is missing or empty.
 * Uses QRCode v002 (BIC optional).
 */
export async function generateEpcQr(params: EpcQrParams): Promise<string | null> {
  const { iban, bic, name, amountEur, reference } = params;

  if (!iban || iban.trim() === "") return null;

  const cleanIban = iban.replace(/\s/g, "").toUpperCase();
  const cleanBic = bic?.trim() ?? "";
  const cleanName = (name ?? "").slice(0, 70);
  const amountStr = amountEur && amountEur > 0 ? `EUR${amountEur.toFixed(2)}` : "";
  const refStr = (reference ?? "").slice(0, 140);

  // EPC QR payload (lines separated by \n, no trailing whitespace)
  const payload = [
    "BCD",
    "002",       // version 002 (BIC optional)
    "1",         // UTF-8
    "SCT",
    cleanBic,    // empty is valid in v002
    cleanName,
    cleanIban,
    amountStr,
    "",          // Purpose code (empty = generic payment)
    "",          // Structured remittance (empty — using unstructured below)
    refStr,      // Unstructured remittance / message
  ].join("\n");

  try {
    const dataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      width: 200,
      margin: 1,
    });
    return dataUrl;
  } catch {
    return null;
  }
}

/**
 * Synchronous version using QRCode.toDataURL callback API.
 * Returns a Promise to keep the interface consistent.
 */
export function generateEpcQrSync(params: EpcQrParams): Promise<string | null> {
  return generateEpcQr(params);
}
