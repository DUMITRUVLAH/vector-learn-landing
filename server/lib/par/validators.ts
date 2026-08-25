/**
 * PAR-003: validatori IBAN + cod fiscal (reutilizați în tot modulul PAR)
 * CORE: backlog/par/PAR-CORE.md §0.12, §9
 *
 * Implementarea e partajată cu frontendul (`src/lib/par/iban.ts`) — un singur tabel de lungimi
 * ISO 13616 și un singur mod-97, ca serverul și formularul să nu poată diverge. Vezi acolo de ce
 * validăm ORICE țară, nu doar MD (plăți internaționale).
 */
export {
  /** IBAN valid din orice țară (ISO 13616) — gate-ul implicit pentru câmpurile de IBAN. */
  isValidIBAN,
  /** IBAN valid ȘI moldovenesc — doar unde MD e o cerință reală (e-Factura, transfer intern). */
  isValidMoldovaIBAN,
  /** IDNO/IDNP moldovenesc: exact 13 cifre. */
  isValidIDNP,
  validateIban,
  validateFiscalId,
  normalizeIban,
  ibanCountry,
  countryNameRo,
  isValidBic,
  bicMatchesIban,
  type IbanValidation,
  type FiscalIdValidation,
} from "../../../src/lib/par/iban";

export { isValidIBAN as isValidIBANAnyCountry } from "../../../src/lib/par/iban";
