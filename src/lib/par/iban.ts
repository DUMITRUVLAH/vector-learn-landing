/**
 * IBAN / BIC — validare internațională (ISO 13616 + ISO 9362).
 *
 * DE CE există acest fișier: PAR-ul a pornit ca aplicație pur moldovenească, așa că singura
 * validare era `^MD\d{2}[A-Z0-9]{20}$`. Dar plățile pot fi și internaționale (furnizor estonian,
 * german, românesc…), iar regula MD respingea un IBAN perfect valid — cu mesajul înșelător
 * „IBAN invalid — format MD + 2 cifre + 20 caractere". Aici validăm ORICE IBAN din registrul
 * ISO 13616: cod de țară cunoscut + lungime corectă pentru acea țară + checksum mod-97.
 *
 * Ce NU face: nu verifică structura BBAN per țară (câmpuri n/a/c din registru). Lungimea + mod-97
 * prind practic toate greșelile de tastare; structura BBAN ar cere ~90 de pattern-uri întreținute
 * manual, cu beneficiu marginal. Verificarea finală rămâne la bancă.
 *
 * Sursă: ISO 13616 IBAN Registry (SWIFT), release 2024.
 */

/** country code → lungimea totală a IBAN-ului (inclusiv cele 4 caractere de prefix). */
export const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BI: 27,
  BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DJ: 27, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FK: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23,
  GL: 18, GR: 27, GT: 28, HN: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26,
  IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21,
  LY: 25, MC: 27, MD: 24, ME: 22, MK: 19, MN: 20, MR: 27, MT: 31, MU: 30, NI: 28,
  NL: 18, NO: 15, OM: 23, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22,
  RU: 33, SA: 24, SC: 31, SD: 18, SE: 24, SI: 19, SK: 24, SM: 27, SO: 23, ST: 25,
  SV: 28, TL: 23, TN: 24, TR: 26, UA: 29, VA: 22, VG: 24, XK: 20, YE: 30,
  // Teritorii franceze — folosesc formatul FR (27), dar cu cod de țară propriu.
  BL: 27, GF: 27, GP: 27, MF: 27, MQ: 27, NC: 27, PF: 27, PM: 27, RE: 27, TF: 27,
  WF: 27, YT: 27,
};

/** Denumiri în română pentru mesaje („IBAN internațional — Estonia"). Fallback = codul. */
const COUNTRY_NAMES_RO: Readonly<Record<string, string>> = {
  AD: "Andorra", AE: "Emiratele Arabe Unite", AL: "Albania", AT: "Austria", AZ: "Azerbaidjan",
  BA: "Bosnia și Herțegovina", BE: "Belgia", BG: "Bulgaria", BH: "Bahrain", BR: "Brazilia",
  BY: "Belarus", CH: "Elveția", CY: "Cipru", CZ: "Cehia", DE: "Germania", DK: "Danemarca",
  EE: "Estonia", EG: "Egipt", ES: "Spania", FI: "Finlanda", FR: "Franța", GB: "Marea Britanie",
  GE: "Georgia", GI: "Gibraltar", GR: "Grecia", HR: "Croația", HU: "Ungaria", IE: "Irlanda",
  IL: "Israel", IS: "Islanda", IT: "Italia", JO: "Iordania", KW: "Kuweit", KZ: "Kazahstan",
  LB: "Liban", LI: "Liechtenstein", LT: "Lituania", LU: "Luxemburg", LV: "Letonia",
  MC: "Monaco", MD: "Moldova", ME: "Muntenegru", MK: "Macedonia de Nord", MT: "Malta",
  NL: "Țările de Jos", NO: "Norvegia", PL: "Polonia", PT: "Portugalia", QA: "Qatar",
  RO: "România", RS: "Serbia", RU: "Rusia", SA: "Arabia Saudită", SE: "Suedia",
  SI: "Slovenia", SK: "Slovacia", SM: "San Marino", TR: "Turcia", UA: "Ucraina",
  VA: "Vatican", XK: "Kosovo",
};

export type IbanErrorReason =
  | "empty"
  | "unknown_country"
  | "bad_chars"
  | "bad_length"
  | "bad_checksum";

export interface IbanValidation {
  /** true dacă IBAN-ul e valid ISO 13616 (orice țară). */
  ok: boolean;
  /** valoarea curățată (fără spații/liniuțe, uppercase). */
  normalized: string;
  /** codul de țară (primele 2 litere), dacă arată a cod. */
  country: string | null;
  /** denumirea țării în română, dacă e cunoscută. */
  countryName: string | null;
  /** true doar pentru IBAN MD valid — plată locală. */
  isMoldova: boolean;
  /** true pentru IBAN valid dintr-o altă țară — plata merge prin SWIFT/SEPA. */
  isForeign: boolean;
  /** lungimea așteptată pentru țara detectată (null dacă țara e necunoscută). */
  expectedLength: number | null;
  reason: IbanErrorReason | null;
  /** mesaj gata de afișat lângă câmp (română), null când e valid. */
  message: string | null;
}

/** Curăță un IBAN: fără spații, liniuțe sau puncte; uppercase. */
export function normalizeIban(value: string | null | undefined): string {
  return (value ?? "").replace(/[\s.\-_]/g, "").toUpperCase();
}

/** Codul de țară al unui IBAN (primele două litere), sau null. */
export function ibanCountry(value: string | null | undefined): string | null {
  const clean = normalizeIban(value);
  const cc = clean.slice(0, 2);
  return /^[A-Z]{2}$/.test(cc) ? cc : null;
}

/** Denumirea în română a unei țări ISO-3166 alpha-2 (fallback = codul). */
export function countryNameRo(code: string | null | undefined): string | null {
  if (!code) return null;
  return COUNTRY_NAMES_RO[code] ?? code;
}

/** Afișare grupată câte 4 caractere: „EE16 2200 2210 6865 3841". */
export function formatIban(value: string | null | undefined): string {
  const clean = normalizeIban(value);
  return clean.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Checksum ISO 7064 mod-97-10 pe un IBAN deja normalizat.
 * (Calcul pe bucăți — evită BigInt pentru IBAN-uri de până la 34 de caractere.)
 */
function mod97(clean: string): number {
  const rearranged = clean.slice(4) + clean.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const code = char.charCodeAt(0);
    // A–Z → 10–35, cifră → ea însăși.
    if (code >= 65 && code <= 90) {
      remainder = (remainder * 100 + (code - 55)) % 97;
    } else {
      remainder = (remainder * 10 + (code - 48)) % 97;
    }
  }
  return remainder;
}

/** Validare completă, cu motiv + mesaj în română. Sursa unică de adevăr pentru IBAN. */
export function validateIban(value: string | null | undefined): IbanValidation {
  const normalized = normalizeIban(value);
  const country = ibanCountry(normalized);
  const expectedLength = country ? (IBAN_LENGTHS[country] ?? null) : null;
  const countryName = countryNameRo(country);
  const base = {
    normalized,
    country,
    countryName,
    isMoldova: false,
    isForeign: false,
    expectedLength,
  };

  if (!normalized) {
    return { ...base, ok: false, reason: "empty", message: null };
  }
  if (!country || expectedLength === null) {
    return {
      ...base,
      ok: false,
      reason: "unknown_country",
      message: `IBAN-ul începe cu codul țării (2 litere). „${normalized.slice(0, 2)}" nu e un cod de țară cu IBAN.`,
    };
  }
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(normalized)) {
    return {
      ...base,
      ok: false,
      reason: "bad_chars",
      message: "IBAN-ul conține caractere nepermise — doar litere și cifre, după modelul XX00…",
    };
  }
  if (normalized.length !== expectedLength) {
    return {
      ...base,
      ok: false,
      reason: "bad_length",
      message: `IBAN ${country}${countryName && countryName !== country ? ` (${countryName})` : ""} are ${expectedLength} caractere, tu ai introdus ${normalized.length}.`,
    };
  }
  if (mod97(normalized) !== 1) {
    return {
      ...base,
      ok: false,
      reason: "bad_checksum",
      message: "IBAN invalid — cifrele de control nu se potrivesc. Verifică dacă l-ai copiat corect.",
    };
  }
  return {
    ...base,
    ok: true,
    isMoldova: country === "MD",
    isForeign: country !== "MD",
    reason: null,
    message: null,
  };
}

/** IBAN valid din ORICE țară (ISO 13616). Folosește-l ca gate implicit. */
export function isValidIBAN(value: string | null | undefined): boolean {
  return validateIban(value).ok;
}

/**
 * IBAN valid ȘI moldovenesc. Folosește-l DOAR unde MD e o cerință reală
 * (e-Factura, transfer intern MDL), nu ca validare generală de câmp.
 */
export function isValidMoldovaIBAN(value: string | null | undefined): boolean {
  const v = validateIban(value);
  return v.ok && v.isMoldova;
}

// ─── BIC / SWIFT (ISO 9362) ───────────────────────────────────────────────────

/** ISO 9362: 4 litere bancă + 2 litere țară + 2 alfanumerice locație + opțional 3 sucursală. */
export function isValidBic(value: string | null | undefined): boolean {
  const clean = (value ?? "").replace(/\s/g, "").toUpperCase();
  return /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(clean);
}

/** Codul de țară dintr-un BIC (caracterele 5–6), sau null. */
export function bicCountry(value: string | null | undefined): string | null {
  const clean = (value ?? "").replace(/\s/g, "").toUpperCase();
  return isValidBic(clean) ? clean.slice(4, 6) : null;
}

/**
 * Avertisment (NU eroare) când țara BIC-ului diferă de țara IBAN-ului.
 * Se întâmplă legitim (bancă corespondentă, sediu central în altă țară), deci doar semnalăm.
 */
export function bicMatchesIban(bic: string | null | undefined, iban: string | null | undefined): boolean {
  const b = bicCountry(bic);
  const i = ibanCountry(iban);
  if (!b || !i) return true;
  return b === i;
}

// ─── Cod fiscal / ID național ─────────────────────────────────────────────────

export interface FiscalIdValidation {
  /** false DOAR când valoarea e blocantă (gunoi). Un cod străin plauzibil e mereu ok. */
  ok: boolean;
  /** "ok" | "warning" (acceptăm, dar semnalăm) | "error" (blocăm). */
  level: "ok" | "warning" | "error";
  message: string | null;
}

/**
 * Validează codul fiscal al beneficiarului: IDNO/IDNP (Moldova) SAU orice identificator străin.
 *
 * Regula „exact 13 cifre" e MOLDOVENEASCĂ și nu se poate aplica universal: un furnizor estonian
 * are un cod personal de 11 cifre, unul german un VAT „DE123456789", unul românesc un CUI de 8.
 * De aceea nu blocăm niciodată pe format — dacă valoarea nu arată a IDNO moldovenesc, o ACCEPTĂM
 * și doar semnalăm („poate fi un cod străin, verifică"). Blocăm exclusiv gunoiul (caractere
 * imposibile într-un identificator fiscal), ca omul să nu rămână blocat pe un câmp informativ.
 */
export function validateFiscalId(
  value: string | null | undefined,
  opts: { country?: string | null } = {}
): FiscalIdValidation {
  const raw = (value ?? "").trim();
  if (!raw) return { ok: true, level: "ok", message: null };

  // Gunoi: singurul caz blocant. Un identificator fiscal e alfanumeric, eventual cu - / . și spații.
  if (!/^[A-Z0-9][A-Z0-9\-/. ]{2,48}$/i.test(raw)) {
    return {
      ok: false,
      level: "error",
      message: "Cod fiscal invalid — folosește litere, cifre și separatori (- / .).",
    };
  }

  const country = (opts.country ?? "MD").toUpperCase();
  if (country !== "MD") {
    // Beneficiar străin: orice identificator plauzibil e corect. Nu avem ce impune.
    return { ok: true, level: "ok", message: null };
  }
  if (/^\d{13}$/.test(raw)) return { ok: true, level: "ok", message: null };

  // Moldovean după toate aparențele, dar nu are 13 cifre → doar atenționăm.
  return {
    ok: true,
    level: "warning",
    message: "Nu arată a IDNO/IDNP moldovenesc (13 cifre). Dacă beneficiarul e din altă țară, e în regulă.",
  };
}

/** Regula MD strictă — păstrată pentru locurile care chiar cer IDNP moldovenesc (e-Factura). */
export function isValidIDNP(idnp: string | null | undefined): boolean {
  return /^\d{13}$/.test((idnp ?? "").trim());
}
