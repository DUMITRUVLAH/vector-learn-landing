/**
 * Parser determinist pentru actele PERSONALE ale beneficiarului: buletin, rechizite bancare,
 * patentă de întreprinzător.
 *
 * DE CE există separat de `stubPartyParser.ts`: acela caută PĂRȚI într-un act comercial (cine
 * plătește, cine încasează). Aici documentul are o singură persoană și un scop clar — „ia-mi
 * datele de identitate", „ia-mi rechizitele", „ia-mi termenul patentei". Regulile sunt altele,
 * iar amestecarea lor ar strica extragerea din facturi, care e deja calibrată.
 *
 * Modulul e PUR (text în, câmpuri afară) și este calea REALĂ în producție cât timp contul AI nu
 * are credit: LLM-ul e un plus, nu o dependență. De aceea e testat pe texte reale de act.
 */
import { isValidIBAN, isValidBic, normalizeIban } from "../../../src/lib/par/iban";
import { normalizePatentDate, normalizePatentSeries } from "../../../src/lib/par/patent";

export type PayeeDocKind = "buletin" | "rechizite" | "patenta" | "unknown";

export interface PayeeDocFields {
  /** Numele titularului, în ordinea „Nume Prenume". */
  name: string | null;
  /** IDNP (13 cifre) sau cod fiscal. */
  idnp: string | null;
  address: string | null;
  iban: string | null;
  bank: string | null;
  bic: string | null;
  patentSeries: string | null;
  /** ISO "YYYY-MM-DD". */
  patentValidUntil: string | null;
  /** Ce fel de act pare a fi — folosit doar ca etichetă în interfață. */
  kind: PayeeDocKind;
}

const EMPTY: PayeeDocFields = {
  name: null, idnp: null, address: null, iban: null, bank: null, bic: null,
  patentSeries: null, patentValidUntil: null, kind: "unknown",
};

/** Diacriticele lipsesc des în textul scanat — comparăm pe o formă fără ele. */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ĂÂÎȘȚăâîșț]/g, (c) => ({ Ă: "A", Â: "A", Î: "I", Ș: "S", Ț: "T", ă: "a", â: "a", î: "i", ș: "s", ț: "t" }[c] ?? c))
    .toLowerCase();
}

/** Ce fel de act e — după cuvintele care apar DOAR în el. */
export function detectPayeeDocKind(text: string): PayeeDocKind {
  const t = fold(text);
  if (/patent[ae]\s+de\s+intreprinzator|patenta de intreprinzator|\bpatenta\b/.test(t)) return "patenta";
  if (/buletin de identitate|carte de identitate|identity card|\bidnp\b.*\bcetatenia\b|republica moldova.*buletin/.test(t)) return "buletin";
  if (/rechizite|date bancare|extras de cont|certificat bancar|cont curent|\biban\b/.test(t)) return "rechizite";
  return "unknown";
}

/**
 * IDNP-ul moldovenesc are 13 cifre. Într-un buletin apar și alte numere lungi (seria actului,
 * numărul de înregistrare), deci preferăm cifrele care urmează DUPĂ eticheta „IDNP"; abia dacă
 * eticheta lipsește luăm primul număr de 13 cifre — un cod fiscal greșit e mai rău decât niciunul,
 * dar aici omul confirmă vizual câmpul înainte de trimitere.
 */
export function extractIdnp(text: string): string | null {
  const labelled = /\b(?:IDNP|IDNO|Cod\s*(?:fiscal|personal)|Codul\s*personal)\b[^0-9]{0,20}(\d{13})\b/i.exec(text);
  if (labelled) return labelled[1];
  const any = /\b(\d{13})\b/.exec(text.replace(/\s+/g, " "));
  return any ? any[1] : null;
}

/** Primul IBAN care trece mod-97 — un IBAN care nu se verifică nu se completează. */
export function extractIban(text: string): string | null {
  const compact = text.replace(/[ ]/g, " ");
  const candidates = compact.match(/\b[A-Z]{2}\d{2}[A-Z0-9 ]{10,34}\b/gi) ?? [];
  for (const raw of candidates) {
    const norm = normalizeIban(raw);
    if (isValidIBAN(norm)) return norm;
    // Un IBAN tipărit în grupuri de 4 poate „înghiți" cuvântul următor — tăiem la lungimea țării.
    for (let len = norm.length; len >= 15; len--) {
      const cut = norm.slice(0, len);
      if (isValidIBAN(cut)) return cut;
    }
  }
  return null;
}

/** BIC-ul MD se tipărește cu sufix de filială (AGRNMD2X885) — păstrăm forma din document. */
export function extractBic(text: string): string | null {
  const labelled = /\b(?:BIC|SWIFT|Cod\s*bancar)\b[^A-Z0-9]{0,15}([A-Z]{6}[A-Z0-9]{2,5})\b/i.exec(text);
  if (labelled && isValidBic(labelled[1].toUpperCase())) return labelled[1].toUpperCase();
  const any = text.match(/\b[A-Z]{4}MD2X[A-Z0-9]{0,3}\b/g);
  return any?.[0] ?? null;
}

/** Denumirea băncii, de pe rândul care o numește. */
export function extractBank(text: string): string | null {
  const m =
    /\b(?:Banca|Bank|Denumirea\s+b[ăa]ncii)\s*[:\-]?\s*([^\n\r;]{3,120})/i.exec(text) ??
    /((?:B\.?C\.?|BC)\s*[«"„][^»"”\n]{2,60}[»"”]\s*S\.?A\.?)/i.exec(text) ??
    /\b((?:BC|B\.C\.)\s+[A-ZĂÂÎȘȚ][\w\-’' ]{2,60}\s+S\.?A\.?)/.exec(text);
  if (!m) return null;
  return m[1].trim().replace(/\s{2,}/g, " ").replace(/[.,;]$/, "") || null;
}

/**
 * Numele titularului dintr-un buletin sau dintr-o patentă.
 *
 * Buletinul tipărește etichetat („Nume / Surname", „Prenume / Given names"), adesea cu numele cu
 * MAJUSCULE pe rândul următor. Patenta scrie „Titularul patentei" sau „Numele, prenumele".
 */
export function extractHolderName(text: string): string | null {
  const lines = text.split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean);

  // Buletinul are etichete BILINGVE pe același rând („Nume / Surname"), iar valoarea stă pe
  // rândul următor. Fără filtrul de mai jos, extragerea întorcea chiar traducerea etichetei
  // („Surname Given names") drept nume — o valoare care arată completată, dar e greșită.
  const isLabelOnly = (v: string) =>
    /^(nume|numele|prenume|prenumele|surname|given\s*names?|name|idnp|idno|sex|sexul|data|cetatenia|cetățenia|nationality|titular|titularul)$/i.test(v.trim());

  const valueAfterLabel = (labelRe: RegExp): string | null => {
    for (let i = 0; i < lines.length; i++) {
      const m = labelRe.exec(lines[i]);
      if (!m) continue;
      const clean = (v: string) =>
        v.replace(/^[\s:./-]+/, "").replace(/\s*\/.*$/, "").replace(/[^\p{L}\-' ]/gu, "").trim();
      // "Nume: POPESCU" pe același rând…
      const inline = clean(lines[i].slice(m.index + m[0].length));
      if (inline.length >= 2 && !isLabelOnly(inline)) return inline;
      // …sau pe rândul următor (layout-ul standard al buletinului).
      const next = lines[i + 1] ? clean(lines[i + 1]) : "";
      if (next.length >= 2 && !isLabelOnly(next)) return next;
    }
    return null;
  };

  const surname = valueAfterLabel(/\b(?:Nume(?:le)?(?:\s+de\s+familie)?|Surname)\b/i);
  const given = valueAfterLabel(/\b(?:Prenume(?:le)?|Given\s+names?)\b/i);
  if (surname && given) return `${surname} ${given}`;

  const holder = valueAfterLabel(/\b(?:Titular(?:ul)?(?:\s+patentei)?|Numele[, ]+prenumele|Eliberat[ăa]?\s+(?:lui|pe\s+numele))\b/i);
  if (holder) return holder;
  return surname ?? given ?? null;
}

/** „seria AA nr. 0123456" / „seria/nr. AA0123456" → forma tipărită. */
export function extractPatentSeries(text: string): string | null {
  const m =
    /\bseri[ai]\s*[:\-]?\s*([A-ZĂÎ]{1,3})\s*(?:nr\.?|№|nr)?\s*[:\-]?\s*(\d{4,10})/i.exec(text) ??
    /\bpatent[ae][^\n]{0,40}?\bnr\.?\s*([A-ZĂÎ]{0,3})\s*(\d{4,10})/i.exec(text);
  if (!m) return null;
  const serie = (m[1] ?? "").toUpperCase().trim();
  return normalizePatentSeries(serie ? `${serie} ${m[2]}` : m[2]);
}

/**
 * Termenul patentei. Un act de patentă tipărește „valabilă de la … până la …" — ne interesează
 * A DOUA dată, cea de sfârșit. O luăm doar dacă e etichetată; o dată oarecare de pe act (data
 * eliberării, data nașterii) pusă drept termen ar stinge exact avertismentul de expirare.
 */
export function extractPatentValidUntil(text: string): string | null {
  const flat = text.replace(/\s+/g, " ");
  const m =
    /(?:p[âa]n[ăa]\s+la|valabil[ăa]?\s+p[âa]n[ăa]\s+la|termenul\s+de\s+valabilitate[^0-9]{0,20}|expir[ăa][^0-9]{0,15})\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4}|\d{4}-\d{1,2}-\d{1,2})/i.exec(flat) ??
    /valabil[ăa]?\s+de\s+la\s+\d{1,2}[./-]\d{1,2}[./-]\d{4}\s*(?:-|—|p[âa]n[ăa] la)\s*(\d{1,2}[./-]\d{1,2}[./-]\d{4})/i.exec(flat);
  return m ? normalizePatentDate(m[1]) : null;
}

/**
 * Extragerea completă. `kindHint` vine din interfață (ce buton a apăsat omul); textul are ultimul
 * cuvânt doar când butonul spunea „orice act".
 */
export function parsePayeeDoc(text: string, kindHint?: PayeeDocKind | "auto"): PayeeDocFields {
  if (!text || !text.trim()) return { ...EMPTY };
  const detected = detectPayeeDocKind(text);
  const kind: PayeeDocKind = !kindHint || kindHint === "auto" ? detected : kindHint;

  const address =
    /\b(?:Domiciliu|Adresa|Adresă|Address|Domiciliul)\b\s*[:\-]?\s*([^\n\r]{5,160})/i.exec(text)?.[1]?.trim() ?? null;

  return {
    name: extractHolderName(text),
    idnp: extractIdnp(text),
    address,
    iban: extractIban(text),
    bank: extractBank(text),
    bic: extractBic(text),
    patentSeries: extractPatentSeries(text),
    patentValidUntil: extractPatentValidUntil(text),
    kind,
  };
}
