/**
 * PAR — separarea rechizitelor bancare dintr-un singur șir „tot pe o linie".
 *
 * De ce există: pe documentele moldovenești rechizitele beneficiarului se tipăresc pe UN rând,
 * de forma
 *
 *   BC'MAIB'S.A. sucursala Stefan cel Mare, AGRNMD2X885 c.f./ nr.TVA 1014600022332 / ф.
 *
 * Extractorul lua rândul întreg drept „numele băncii", așa că în registrul de beneficiari
 * coloana „Bancă" conținea banca + codul bancar + codul fiscal + nr. TVA amestecate. Contabila
 * (Violeta) nu putea filtra/copia niciun cod: „aici tre sa fie colonita separata pt cod idno si
 * cod tva, cod bancar — tot e intro linie la tine".
 *
 * Funcția e PURĂ (fără I/O, fără rețea): același text → același rezultat. E folosită în trei
 * locuri, ca regula să fie una singură:
 *   · stubPartyParser.cleanBankName — la extragerea din document (payee_bank rămâne curat);
 *   · routes/parVendors.ts — la orice salvare de beneficiar (inclusiv text lipit manual);
 *   · lib/par/vendorAutoSave.ts — la auto-salvarea beneficiarului dintr-o cerere trimisă.
 *
 * Principiul: „mai bine null decât greșit". Un cod se extrage doar dacă e etichetat
 * (c.f./IDNO/nr.TVA/cod bancar) sau are o formă neambiguă (BIC ISO 9362, IBAN ISO 13616).
 * Ce nu se recunoaște rămâne în numele băncii — nu se pierde nimic.
 */

export interface BankRequisites {
  /** Numele băncii, fără codurile care stăteau lipite după el. */
  bank: string | null;
  /** Cod bancar = BIC/SWIFT (ISO 9362), în MD tipărit cu sufixul de filială: AGRNMD2X885. */
  bankCode: string | null;
  /** Cod fiscal / IDNO / IDNP. */
  fiscalCode: string | null;
  /** Numărul de înregistrare ca plătitor de TVA. */
  vatCode: string | null;
  /** IBAN, dacă era înghesuit tot acolo. */
  iban: string | null;
}

const EMPTY: BankRequisites = {
  bank: null,
  bankCode: null,
  fiscalCode: null,
  vatCode: null,
  iban: null,
};

/** Lățimea coloanei `par_vendors.bank` / `par_requests.payee_bank`. */
const MAX_BANK_LEN = 300;

/**
 * Etichete de cod fiscal. `c/f`, `c.f.`, `c. f.` sunt formele scurte de pe facturile MD;
 * cerem punctul/slash-ul ca să nu confundăm un „c" oarecare dintr-un cuvânt.
 */
const FISCAL_LABEL = String.raw`cod(?:ul)?\s*fiscal|IDNO|IDNP|ИДНО|фискальн\w*\s*код|\bc\s*[./]\s*f\.?`;
/** Etichete de TVA. */
const VAT_LABEL = String.raw`(?:nr\.?\s*)?(?:cod(?:ul)?\s*)?(?:TVA|IVA)\b\.?|VAT\s*(?:no\.?|nr\.?|id)?|УНП|(?:код\s*)?НДС`;
/** Etichete de cod bancar. */
const BANK_CODE_LABEL = String.raw`cod(?:ul)?\s*banc\w*|код\s*банка|\bBIC\b|\bSWIFT\b|S\.W\.I\.F\.T\.?`;
/** Etichete de cont. */
const IBAN_LABEL = String.raw`\bIBAN\b|cont(?:ul)?\s*(?:curent|bancar|de\s*decontare)?|расч[её]тный\s*сч[её]т|\bр\s*/\s*с`;

/**
 * Valoarea unui cod numeric: eventual 2 litere de prefix (VAT intracomunitar „MD"/„DE"),
 * apoi cifre care pot fi rupte de spații/puncte de OCR. Se oprește la orice altceva
 * (`/`, `,`, litere) — de asta „1014600022332 / ф." nu înghite coada.
 */
const NUMERIC_VALUE = String.raw`([A-Z]{0,2}\s?\d[\d\s.]{2,24}\d|[A-Z]{0,2}\s?\d{4,25})`;
/** BIC ISO 9362: 4 litere bancă + 2 litere țară + 2 alfanumerice + opțional 3 de filială. */
const BIC_VALUE = String.raw`([A-Z]{6}[A-Z0-9]{2}(?:[A-Z0-9]{3})?)`;
/** IBAN ISO 13616: 2 litere țară + 2 cifre de control + până la 30 alfanumerice. */
const IBAN_VALUE = String.raw`([A-Z]{2}\s?\d{2}(?:[ ]?[A-Z0-9]){10,30})`;

/** Prefixele de etichetă pe care le tăiem din fața numelui băncii. */
const BANK_NAME_LABEL_RE =
  /^\s*(?:Banca(?:\s*(?:pl[ăa]titorului|beneficiarului|benef\.?))?|Банк|Bank|Beneficiary\s*bank|Banque)\s*[:-]?\s*/i;

/** Un interval din text deja atribuit unui cod (ca „nr.TVA" din „c.f./ nr.TVA" să nu fie citit de două ori). */
interface Claim {
  start: number;
  end: number;
}

interface Marker extends Claim {
  kind: "fiscal" | "vat" | "bankCode" | "iban";
  value: string;
}

function overlaps(claims: readonly Claim[], start: number, end: number): boolean {
  return claims.some((c) => start < c.end && end > c.start);
}

/** Curăță un cod numeric: fără spații/puncte, majuscule. Null dacă n-are măcar 4 cifre. */
function cleanNumericCode(raw: string): string | null {
  const s = raw.replace(/[\s.]/g, "").toUpperCase();
  const m = s.match(/^([A-Z]{0,2}\d{4,25})$/);
  if (!m) return null;
  return m[1];
}

/**
 * Rulează un tipar `etichetă + valoare` peste text și adaugă marcatorii găsiți.
 * Intervalele deja revendicate se sar — prima potrivire (cea mai specifică) câștigă.
 */
function scanLabelled(
  text: string,
  label: string,
  value: string,
  kind: Marker["kind"],
  claims: Claim[],
  out: Marker[],
  clean: (raw: string) => string | null
): void {
  const re = new RegExp(String.raw`(?:${label})\s*[:\-—]?\s*${value}`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (overlaps(claims, start, end)) continue;
    const cleaned = clean(m[1]);
    if (!cleaned) continue;
    claims.push({ start, end });
    out.push({ start, end, kind, value: cleaned });
  }
}

/**
 * Sparge un șir de rechizite bancare în componentele lui.
 *
 * Returnează `bank` = ce a rămas în față (numele real al băncii) și codurile recunoscute.
 * Dacă nu recunoaște niciun cod, `bank` e chiar textul primit, curățat de eticheta „Banca:".
 */
export function splitBankRequisites(raw: string | null | undefined): BankRequisites {
  const text = (raw ?? "").trim();
  if (!text) return { ...EMPTY };

  const claims: Claim[] = [];
  const markers: Marker[] = [];

  // 1. Eticheta compusă „c.f./ nr.TVA <număr>" — un singur număr pentru două etichete.
  //    Se scanează PRIMA ca să revendice intervalul; altfel „nr.TVA" ar fi citit separat.
  //    Dacă numărul are 13 cifre e IDNO-ul moldovenesc (cod fiscal), nu numărul de TVA;
  //    lăsăm atunci coloana TVA goală în loc s-o umplem greșit.
  {
    const re = new RegExp(
      String.raw`(?:${FISCAL_LABEL})\s*[/,]\s*(?:${VAT_LABEL})\s*[:\-]?\s*${NUMERIC_VALUE}`,
      "gi"
    );
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const cleaned = cleanNumericCode(m[1]);
      if (!cleaned) continue;
      const start = m.index;
      const end = start + m[0].length;
      claims.push({ start, end });
      markers.push({
        start,
        end,
        kind: /^\d{13}$/.test(cleaned) ? "fiscal" : "vat",
        value: cleaned,
      });
    }
  }

  // 2. Etichete simple. Ordinea contează doar prin revendicări, nu prin prioritate.
  scanLabelled(text, VAT_LABEL, NUMERIC_VALUE, "vat", claims, markers, cleanNumericCode);
  scanLabelled(text, FISCAL_LABEL, NUMERIC_VALUE, "fiscal", claims, markers, cleanNumericCode);
  scanLabelled(text, BANK_CODE_LABEL, BIC_VALUE, "bankCode", claims, markers, (v) =>
    v.toUpperCase()
  );
  scanLabelled(text, IBAN_LABEL, IBAN_VALUE, "iban", claims, markers, (v) =>
    v.replace(/\s+/g, "").toUpperCase()
  );

  // 3. Cod bancar NEetichetat („…Stefan cel Mare, AGRNMD2X885 c.f./…").
  //    Forma BIC singură nu ajunge: „EXIMBANK" are exact 8 majuscule. Cerem și o cifră —
  //    partea de localizare a unui BIC moldovenesc o are întotdeauna (MD2X885, MD2X322).
  {
    const re = new RegExp(String.raw`\b${BIC_VALUE}\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const token = m[1];
      if (!/\d/.test(token)) continue;
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(claims, start, end)) continue;
      claims.push({ start, end });
      markers.push({ start, end, kind: "bankCode", value: token.toUpperCase() });
    }
  }

  // 4. IBAN neetichetat.
  {
    const re = new RegExp(String.raw`\b${IBAN_VALUE}\b`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(claims, start, end)) continue;
      claims.push({ start, end });
      markers.push({ start, end, kind: "iban", value: m[1].replace(/\s+/g, "").toUpperCase() });
    }
  }

  // Primul marcator marchează sfârșitul numelui băncii: tot ce urmează sunt coduri.
  const firstStart = markers.reduce((min, mk) => Math.min(min, mk.start), text.length);

  let bank = text.slice(0, firstStart);
  bank = bank.replace(BANK_NAME_LABEL_RE, "");
  // Coada rămasă după tăiere e punctuație de separare („…Stefan cel Mare,").
  // Punctul NU se taie: e ultima literă a formei juridice („S.A.", „S.R.L.").
  bank = bank
    .replace(/[\s,;:\-–/]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();

  const pick = (kind: Marker["kind"]): string | null =>
    markers.find((mk) => mk.kind === kind)?.value ?? null;

  return {
    bank: bank ? bank.slice(0, MAX_BANK_LEN) : null,
    bankCode: pick("bankCode"),
    fiscalCode: pick("fiscal"),
    vatCode: pick("vat"),
    iban: pick("iban"),
  };
}

/**
 * True dacă șirul mai conține coduri lipite de numele băncii — adică rândul e „tot pe o linie"
 * și merită separat. Folosit ca să arătăm butonul de reparare doar când chiar e ceva de reparat.
 */
export function hasMergedBankRequisites(raw: string | null | undefined): boolean {
  const parts = splitBankRequisites(raw);
  return !!(parts.bankCode || parts.fiscalCode || parts.vatCode || parts.iban);
}
