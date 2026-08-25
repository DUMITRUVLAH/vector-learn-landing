/**
 * Compatibilitate: punctul de intrare istoric pentru validarea IBAN în frontend.
 *
 * Logica reală (orice țară, ISO 13616) trăiește acum în `src/lib/par/iban.ts` — vezi comentariul
 * de acolo pentru „de ce": PAR-ul acceptă și plăți internaționale, nu doar IBAN-uri MD.
 * Fișierul acesta rămâne doar ca re-export ca să nu rupem importurile existente.
 */
export {
  isValidMoldovaIBAN,
  isValidIBAN,
  validateIban,
  normalizeIban,
  formatIban,
  ibanCountry,
  countryNameRo,
  isValidBic,
  bicMatchesIban,
  validateFiscalId,
  type IbanValidation,
} from "./iban";
