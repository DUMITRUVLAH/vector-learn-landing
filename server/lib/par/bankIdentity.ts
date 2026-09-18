/**
 * CARE bancă e scrisă, de fapt — și când două nume înseamnă două bănci diferite.
 *
 * De ce există (producție, 18.09.2026): pe un contract unde documentul scria „BC Moldova-
 * Agroindbank S.A.", iar cererea „BC «Moldindconbank» S.A." cu IBAN-ul MD67**ML**…, verificarea
 * afișa cele două nume unul lângă altul, în gri, fără niciun avertisment. Nu sunt două scrieri
 * ale aceleiași bănci — sunt două bănci, iar contul din document nu fusese citit deloc, deci
 * nicio altă verificare nu avea cum să prindă diferența.
 *
 * Regula v3 („banca nu produce avertisment, niciodată") a fost scrisă pe date bune: din cele 7
 * „nepotriviri de bancă" măsurate pe 06–16.09.2026, toate 7 erau aceeași bancă scrisă altfel
 * („BC «MOLDINDCONBANK» S.A" / „MOLDINDCONBANK") sau redenumită („Mobiasbanca-OTP Group" →
 * „OTP Bank"). Modulul ăsta repară cauza, nu simptomul: numele se reduce mai întâi la o
 * IDENTITATE de bancă, iar avertismentul apare doar când AMÂNDOUĂ părțile se reduc la identități
 * cunoscute și diferite. Toate cele 7 cazuri de mai sus se reduc la aceeași identitate, deci tac
 * mai departe.
 *
 * Aceeași regulă de proiectare ca în `sameParty`: mai bine tacem decât să mințim. Un nume pe care
 * nu-l recunoaștem nu e „altă bancă", e „nu se poate ști" → `null`.
 *
 * Funcțiile sunt PURE (fără I/O, fără rețea): același text → același rezultat.
 */

/** O bancă, cu toate formele sub care apare pe acte. `id` e doar o cheie internă de comparație. */
interface KnownBank {
  id: string;
  /** Numele, în formele în care se tipărește (inclusiv redenumirile — aceeași bancă, același id). */
  name: RegExp;
  /** Codul băncii din IBAN-ul moldovenesc: MD + 2 cifre de control + ACESTE 2 litere. */
  ibanCode?: string;
  /** Primele 4 litere din BIC (ISO 9362): AGRNMD2X885 → „AGRN". */
  bicPrefix?: string;
}

/**
 * Băncile pe care le recunoaștem. Lista NU trebuie să fie completă ca regula să fie corectă —
 * ce nu e aici întoarce „nu se poate ști", adică exact comportamentul de dinainte.
 *
 * Codurile IBAN sunt cele văzute pe documente reale din dosare (AG · MAIB, ML · Moldindconbank,
 * VI · Victoriabank); pentru restul băncilor se compară numele și BIC-ul, care sunt neambigue.
 * Un cod IBAN ghicit ar fi mai rău decât unul lipsă: din el ar ieși o acuzație falsă.
 */
const KNOWN_BANKS: readonly KnownBank[] = [
  { id: "maib", name: /moldova[\s'"«»„”-]*agroindbank|\bagroindbank\b|\bmaib\b/i, ibanCode: "AG", bicPrefix: "AGRN" },
  { id: "micb", name: /moldindconbank|\bmicb\b/i, ibanCode: "ML", bicPrefix: "MOLD" },
  { id: "victoriabank", name: /victoria\s*bank/i, ibanCode: "VI", bicPrefix: "VICB" },
  // Aceeași bancă, două nume: redenumirea din 2021. Identitatea e una, deci nu produce diferență.
  { id: "otp-md", name: /\botp\s*bank\b|mobiasban[căc]a?/i, bicPrefix: "MOBB" },
  { id: "energbank", name: /energbank/i, bicPrefix: "ENEG" },
  { id: "fincombank", name: /fincombank/i, bicPrefix: "FTMD" },
  { id: "eximbank", name: /eximbank/i, bicPrefix: "EXMM" },
  { id: "procredit", name: /procredit\s*bank/i, bicPrefix: "PRCB" },
  { id: "comertbank", name: /comer[țt]bank/i, bicPrefix: "COMR" },
  { id: "eurocreditbank", name: /euro\s*credit\s*bank|eurocreditbank/i, bicPrefix: "EUCB" },
  // România — entitatea RO a organizației plătește și încasează prin ele.
  { id: "bt-ro", name: /banca\s*transilvania/i, bicPrefix: "BTRL" },
  { id: "brd-ro", name: /\bbrd\b/i, bicPrefix: "BRDE" },
  { id: "bcr-ro", name: /\bbcr\b|banca\s*comercial[ăa]\s*rom[âa]n[ăa]/i, bicPrefix: "RNCB" },
  { id: "ing-ro", name: /\bing\s*bank\b/i, bicPrefix: "INGB" },
  { id: "raiffeisen-ro", name: /raiffeisen/i, bicPrefix: "RZBR" },
  { id: "unicredit-ro", name: /unicredit/i, bicPrefix: "BACX" },
  { id: "cec-ro", name: /\bcec\s*bank\b/i, bicPrefix: "CECE" },
];

/** Textul, fără spațiile și semnele pe care OCR-ul le mută („MD 67 ML…", „BC'MAIB'S.A."). */
const compact = (raw: string | null | undefined) => (raw ?? "").replace(/[\s'"«»„”.,-]/g, "").toUpperCase();

/** Banca din numele scris pe act. Dacă textul numește DOUĂ bănci, nu se poate ști care e a părții. */
function bankFromName(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const hits = KNOWN_BANKS.filter((b) => b.name.test(text));
  return hits.length === 1 ? hits[0].id : null;
}

/**
 * Banca din IBAN. În Moldova (ISO 13616 + regula BNM) codul băncii sunt cele două litere de după
 * cifrele de control: MD67**ML**0000002258A0919582 → Moldindconbank. Pentru IBAN-urile din alte
 * țări codul băncii nu e pe aceleași poziții, deci nu se deduce nimic din ele.
 */
export function bankFromIban(raw: string | null | undefined): string | null {
  const iban = compact(raw);
  if (!/^MD\d{2}[A-Z]{2}/.test(iban)) return null;
  const code = iban.slice(4, 6);
  return KNOWN_BANKS.find((b) => b.ibanCode === code)?.id ?? null;
}

/** Banca din BIC/SWIFT: primele 4 litere identifică instituția (AGRNMD2X885 → MAIB). */
function bankFromBic(raw: string | null | undefined): string | null {
  const bic = compact(raw);
  if (!/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic)) return null;
  return KNOWN_BANKS.find((b) => b.bicPrefix === bic.slice(0, 4))?.id ?? null;
}

/** Ce știm despre banca unei părți, pe un document sau pe cerere. */
export interface BankSource {
  name?: string | null;
  iban?: string | null;
  /** Toate conturile tipărite pentru parte, când documentul listează mai multe. */
  ibans?: readonly (string | null | undefined)[] | null;
  bic?: string | null;
}

/**
 * Identitatea băncii unei părți, sau `null` dacă nu se poate ști.
 *
 * Contul are prioritate în fața numelui: acolo chiar pleacă banii. Dacă cineva a scris în cerere
 * „Moldindconbank" peste un IBAN de MAIB, banca cererii e MAIB — greșeala de completare nu are
 * voie să ascundă banca reală a contului.
 *
 * Mai multe conturi la bănci diferite (documentul listează și contul MDL, și cel EUR, la instituții
 * diferite) → ambiguu, deci `null`: nu putem ști pe care îl compară cererea.
 */
export function bankIdentity(source: BankSource | null | undefined): string | null {
  if (!source) return null;
  const accounts = [source.iban, ...(source.ibans ?? [])]
    .map(bankFromIban)
    .filter((id): id is string => !!id);
  const distinct = new Set(accounts);
  if (distinct.size > 1) return null;
  return accounts[0] ?? bankFromBic(source.bic) ?? bankFromName(source.name);
}

/**
 * Documentul trimite banii la ALTĂ bancă decât cererea?
 *
 * `true` doar când amândouă părțile se reduc la o bancă cunoscută, iar băncile diferă. Altfel
 * `null` — „nu se poate ști" — niciodată `false` pe baza numelor: două nume care se reduc la
 * aceeași identitate înseamnă că banca se potrivește, dar restul rechizitelor (contul, codul
 * fiscal) au propriile lor verificări, cu identificatori tari.
 *
 * Fără un nume de bancă pe document verificarea tace chiar dacă IBAN-ul documentului ar da o
 * identitate: un rând „bancă: document nedetectat" marcat ca nepotrivire nu se poate citi, iar
 * diferența de cont o spune deja verificarea IBAN-ului.
 */
export function bankMismatch(expected: BankSource, found: BankSource): boolean | null {
  if (!(found.name ?? "").trim()) return null;
  const a = bankIdentity(expected);
  const b = bankIdentity(found);
  if (!a || !b) return null;
  return a !== b;
}
