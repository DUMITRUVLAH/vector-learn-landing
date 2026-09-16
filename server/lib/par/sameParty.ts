/**
 * Când două nume desemnează ACEEAȘI parte — fără alarme false.
 *
 * De ce există (măsurat pe producție, 16.09.2026): din 40 de analize făcute cu regulile v2,
 * 31 purtau cel puțin o „neconcordanță" — 78% din documente. Comparatorul de atunci era
 * egalitate strictă pe textul fără spații, minusculizat, deci raporta drept nepotrivire:
 *
 *   - diacritica:      „BARBAROS OXANA"   vs „Barbaroş Oxana"    (același act, aceeași persoană)
 *   - ordinea numelui: „BORDEI VIORICA"   vs „Viorica Bordei"
 *   - forma juridică:  „Deea House SRL"   vs „DEEA HOUSE S.R.L."
 *   - banca:           „BC \"MOLDINDCONBANK\" S.A" vs „MOLDINDCONBANK"
 *   - acronimul:       „ATIC" vs „Asociația Națională a Companiilor din Domeniul TIC"
 *
 * Toate sunt potriviri. Un avertisment care sare pe trei sferturi din cereri nu mai e citit de
 * nimeni — mai ales de când aprobarea unei cereri cu nepotriviri cere o confirmare (VM5-05).
 *
 * Regula de proiectare, în ordinea priorității: **mai bine tacem decât să mințim**. Un câmp
 * necomparabil întoarce `null` („neverificat"), nu `false`. Doar o diferență pe care un om ar
 * numi-o diferență întoarce `false`.
 */

/**
 * Textul, adus la forma pe care o compari: fără diacritice, fără punctuație, minuscule.
 * `ș ț ă â î ş ţ ö ü` și chirilicele accentuate se pliază pe litera de bază, așa că
 * „Barbaroş" și „BARBAROS" devin același șir.
 */
export function foldName(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // Cedila și virgula dedesubt nu sunt toate diacritice combinabile în NFD (ş/ș, ţ/ț).
    .replace(/[şș]/gi, "s")
    .replace(/[ţț]/gi, "t")
    .replace(/[ʼ'`´]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9а-яё ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Cuvintele care NU identifică pe nimeni: forme juridice, prefixe bancare, cuvinte de legătură.
 *
 * `societatea|cu|raspundere|limitata` stau aici cu un motiv concret: `fuzzyOrgMatch` le număra ca
 * potrivire, deci „Societatea cu Răspundere Limitată NEW TRADE" trecea drept „…VECTOR ACADEMY".
 */
const LEGAL_NOISE = new Set([
  "srl", "sa", "ao", "ii", "sc", "spa", "plc", "ooo", "oao", "zao", "gmbh", "llc", "ltd", "inc",
  "firma", "societatea", "societate", "cu", "raspundere", "limitata", "intreprinderea",
  "individuala", "asociatia", "asociatie", "obsteasca", "nationala", "fundatia", "fundatie",
  "organizatia", "obshchestvennaya", "bc", "bcr", "banca", "bank", "banka", "filiala", "fil",
  "suc", "sucursala", "reprezentanta", "group", "grup", "holding", "company", "de", "din", "la",
  "si", "the", "of", "and", "pentru", "prin", "sub",
]);

/** Cuvintele care chiar identifică partea (≥3 litere, fără zgomotul juridic). */
export function identityTokens(raw: string | null | undefined): string[] {
  return foldName(raw)
    .split(" ")
    .filter((t) => t.length >= 3 && !LEGAL_NOISE.has(t));
}

/** Distanță de editare ≤1 — o literă pierdută la scanare („DEA HOUSE" pentru „Deea House"). */
function within1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/**
 * E `short` acronimul lui `long`?
 *
 * Două forme, fiindcă acronimele reale nu sunt curate: acronimul scris chiar pe document
 * („…DOMENIUL TIC (ATIC)") și inițialele cuvintelor cu greutate („CRJ" ← „Centrul de Resurse
 * Juridice").
 *
 * Ce NU se deduce, și n-are cum: „ATIC" vine din „Tehnologiei Informației și Comunicațiilor",
 * nu din inițialele cuvintelor în ordine — nicio regulă de șiruri nu-l scoate fără să accepte și
 * potriviri false. De aceea organizația are un câmp de aliasuri (`par_payers.aliases`), unde
 * administratorul scrie o dată denumirile sub care apare pe acte — vezi `partyAliases`.
 */
export function isAcronymOf(short: string | null | undefined, long: string | null | undefined): boolean {
  const s = foldName(short).replace(/ /g, "");
  if (s.length < 2 || s.length > 8) return false;
  const words = foldName(long).split(" ").filter(Boolean);
  if (words.length < 2) return false;
  // Acronimul scris chiar pe document — „…DOMENIUL TIC (ATIC)". Cel mai sigur caz.
  if (words.some((w) => w === s)) return true;
  // Inițialele cuvintelor cu greutate: „de", „a", „din" nu intră în acronim
  // („CRJ" din „Centrul de Resurse Juridice"), altfel nu s-ar potrivi niciodată.
  const initials = words.filter((w) => w.length >= 3).map((w) => w[0]).join("");
  return initials.length >= 2 && initials.includes(s);
}

/**
 * Aceeași parte?
 *
 * `true` potrivire · `false` nepotrivire · `null` nu se poate ști (unul dintre nume nu conține
 * niciun cuvânt identificator — „card ATIC", „—", un șir gol).
 *
 * Cere ca TOATE cuvintele identificatoare ale numelui mai scurt să se regăsească în celălalt,
 * ignorând ordinea. Așa „Viorica Bordei" = „BORDEI VIORICA", dar „NEW TRADE" ≠ „VECTOR ACADEMY".
 */
export function sameParty(
  a: string | null | undefined,
  b: string | null | undefined,
  options: { aliases?: readonly string[] } = {}
): boolean | null {
  const ta = identityTokens(a);
  const tb = identityTokens(b);
  if (!ta.length || !tb.length) return null;

  if (matchTokens(ta, tb)) return true;
  if (isAcronymOf(a, b) || isAcronymOf(b, a)) return true;

  // Aliasurile declarate pe organizație formează o CLASĂ DE ECHIVALENȚĂ: toate denumirile din
  // listă numesc aceeași entitate. Deci e destul ca fiecare nume să se regăsească în listă —
  // nu neapărat în același alias. Așa „ATIC" (denumirea scurtă) și „Asociația Obștească
  // Asociația Națională a Companiilor…" (cum apare pe acte) ajung împreună, deși niciun acronim
  // nu se deduce din a doua.
  const inClass = (name: string | null | undefined, tokens: readonly string[]) =>
    (options.aliases ?? []).some((alias) => {
      const tAlias = identityTokens(alias);
      return tAlias.length > 0 && (matchTokens(tokens, tAlias) || isAcronymOf(name, alias));
    });
  if (inClass(a, ta) && inClass(b, tb)) return true;
  return false;
}

/**
 * Toate cuvintele celui mai scurt se regăsesc în celălalt, ignorând ordinea.
 *
 * Două toleranțe, amândouă ținute în frâu fiindcă pe cuvinte scurte „aproape la fel" înseamnă de
 * obicei „altceva":
 *
 *  - **prefixul** (de la 4 litere în sus) prinde numele tăiate de extractor — „Asociatia Nationala
 *    a Companiilor din Domeniul Tehnologiilor" pentru denumirea întreagă. Sub 4 litere ar face din
 *    „Ana" un prefix al lui „Anastasia".
 *  - **o literă lipsă** („DEA HOUSE" scanat pentru „Deea House") se acceptă DOAR ca reparație pe un
 *    nume care se potrivește deja altundeva exact. Fără condiția asta, „atic" trecea drept „tic"
 *    din „…DOMENIUL TIC" și declara ATIC drept plătitor pe orice act al altcuiva.
 */
function matchTokens(ta: readonly string[], tb: readonly string[]): boolean {
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const exact = (t: string) =>
    long.some((l) => l === t || (t.length >= 4 && l.startsWith(t)) || (l.length >= 4 && t.startsWith(l)));
  const hasAnchor = short.some(exact);
  return short.every((t) => exact(t) || (hasAnchor && long.some((l) => within1(t, l))));
}

/**
 * Aliasurile unei organizații, gata de dat lui `sameParty`: denumirea scurtă, cea juridică și
 * ce a scris administratorul în câmpul de aliasuri.
 */
export function partyAliases(
  org: { name?: string | null; legalName?: string | null; aliases?: string | null } | null | undefined
): string[] {
  if (!org) return [];
  const extra = (org.aliases ?? "")
    .split(/[,;\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
  return [org.name, org.legalName, ...extra].filter((v): v is string => !!v && v.trim().length > 0);
}
