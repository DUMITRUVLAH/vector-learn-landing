/**
 * Referința actului care justifică plata — seria/numărul și data, citite din textul documentului.
 *
 * De ce există (owner, 18.09.2026): „la destinația plății, prin bară, automat să se înscrie și
 * seria/nr la factura fiscală și data, sau nr contului și data." Omul de la finanțe copiază
 * „Destinația plății" din coadă direct în ordinul de plată din bancă, iar banca (și auditul) cer
 * ca plata să trimită la actul pe baza căruia se face: „… / factura fiscală seria/nr. EBC000579678
 * din 04.11.2025". Până acum destinația era doar descrierea scrisă de solicitant, iar referința se
 * căuta de mână, deschizând factura.
 *
 * De ce DETERMINIST și nu prin model: textul actului e deja citit la încărcare (`readUploadedDoc`),
 * iar numărul și data stau, în toate formularele din Moldova, lângă titlu. Un regex se testează pe
 * corpusul real de documente (`__tests__/fixtures/documents/*.txt`), rulează fără cheie de API și
 * nu poate inventa un număr de factură — exact garanția de care are nevoie un câmp care ajunge
 * într-un ordin de plată.
 *
 * Ce NU face: nu ghicește. Dacă documentul e un scan fără strat de text sau titlul nu se recunoaște,
 * întoarce `null` și destinația rămâne cea de azi (descrierea singură).
 */

/** Tipul actului, cât să știm cum se numește în destinația plății. */
export type ParsedDocKind =
  | "factura_fiscala"
  | "cont_de_plata"
  | "factura"
  | "invoice"
  | "chitanta"
  | "act"
  | "contract"
  | "proces_verbal";

export interface ParsedDocumentRef {
  kind: ParsedDocKind;
  /** Eticheta în română, așa cum intră în destinația plății („factura fiscală"). */
  label: string;
  /** Seria + numărul, ca pe document: „EBC000579678", „68339", „12/2026". */
  number: string | null;
  /** Data actului, ISO „YYYY-MM-DD" (formatul se alege la afișare). */
  date: string | null;
}

/**
 * Diacriticele și literele mari dispar înainte de orice potrivire — actele le scriu în toate
 * felurile („FACTURĂ FISCALĂ", „Factura fiscala", sedila vs virgulă). Înlocuirile sunt 1:1, deci
 * pozițiile din textul îndoit corespund cu cele din original.
 */
function fold(s: string): string {
  return s
    .replace(/[ăâ]/gi, "a")
    .replace(/[îï]/gi, "i")
    .replace(/[șş]/gi, "s")
    .replace(/[țţ]/gi, "t")
    .toLowerCase();
}

/**
 * Sfârșit de cuvânt care funcționează și pe chirilice. `\b` din JS se sprijină pe `\w` = ASCII,
 * deci `/^акт\b/` NU se potrivește cu „АКТ ВЫПОЛНЕННЫХ РАБОТ" — litera chirilică nu e „word char",
 * așa că după ea nu există graniță.
 */
const EOW = "(?![a-zа-я0-9])";

/** Titlurile de act, în ordinea în care se impun unul altuia (prima potrivire câștigă). */
const TITLES: Array<{ kind: ParsedDocKind; label: string; re: RegExp }> = [
  { kind: "factura_fiscala", label: "factura fiscală", re: new RegExp(`^(?:\\d+\\.\\s*)?(?:factura fiscala|налоговая накладная)${EOW}`) },
  { kind: "cont_de_plata", label: "cont de plată", re: new RegExp(`^(?:\\d+\\.\\s*)?cont de plata${EOW}`) },
  { kind: "invoice", label: "invoice", re: new RegExp(`^(?:\\d+\\.\\s*)?(?:tax |proforma )?invoice${EOW}`) },
  { kind: "factura", label: "factura", re: new RegExp(`^(?:\\d+\\.\\s*)?(?:factura|proforma)${EOW}`) },
  { kind: "chitanta", label: "chitanța", re: new RegExp(`^(?:\\d+\\.\\s*)?(?:chitanta|bon fiscal|receipt|квитанция)${EOW}`) },
  { kind: "act", label: "actul", re: new RegExp(`^(?:\\d+\\.\\s*)?(?:act de (?:primire|predare|receptie|indeplinire|executare)|акт)${EOW}`) },
  { kind: "contract", label: "contractul", re: new RegExp(`^(?:\\d+\\.\\s*)?(?:contract|договор)${EOW}`) },
  { kind: "proces_verbal", label: "procesul-verbal", re: new RegExp(`^(?:\\d+\\.\\s*)?proces[- ]verbal${EOW}`) },
];

/** Cuvintele după care, pe rândul de titlu, urmează numărul sau data actului. */
const REF_MARKER = new RegExp(`(?:^|[\\s(,;:/-])(?:nr|no|numar|№|din|data|date|seria|serie|series|от|la)${EOW}`);

/**
 * Rândul e un TITLU, nu o frază care întâmplător începe cu „Factura".
 *
 * Fără regula asta, „Factura este valabilă timp de 1 zile calendaristice" — nota de subsol a
 * oricărui cont de plată din Moldova — ar fi citită drept titlul actului. Un titlu real se termină
 * acolo: după el vin cel mult câteva cuvinte din denumire („CONTRACT DE PRESTĂRI SERVICII"), apoi
 * numărul sau data.
 */
function titleLineIsTitle(restFolded: string): boolean {
  const tail = restFolded.trim();
  if (!tail) return true;
  if (tail.length > 70) return false;
  const marker = tail.match(REF_MARKER);
  if (!marker) return false;
  // Denumirea dintre titlu și număr e scurtă („DE PRESTĂRI SERVICII nr. 88"), nu o propoziție.
  const before = tail.slice(0, marker.index ?? 0).trim();
  return before.split(/\s+/).filter(Boolean).length <= 4;
}

const MONTHS: Record<string, number> = {
  ian: 1, ianuarie: 1, jan: 1, january: 1, "янв": 1, "января": 1,
  feb: 2, februarie: 2, february: 2, "фев": 2, "февраля": 2,
  mar: 3, martie: 3, march: 3, "мар": 3, "марта": 3,
  apr: 4, aprilie: 4, april: 4, "апр": 4, "апреля": 4,
  mai: 5, may: 5, "май": 5, "мая": 5,
  iun: 6, iunie: 6, jun: 6, june: 6, "июн": 6, "июня": 6,
  iul: 7, iulie: 7, jul: 7, july: 7, "июл": 7, "июля": 7,
  aug: 8, august: 8, "авг": 8, "августа": 8,
  sep: 9, sept: 9, septembrie: 9, september: 9, "сен": 9, "сентября": 9,
  oct: 10, octombrie: 10, october: 10, "окт": 10, "октября": 10,
  noi: 11, noiembrie: 11, nov: 11, november: 11, "ноя": 11, "ноября": 11,
  dec: 12, decembrie: 12, december: 12, "дек": 12, "декабря": 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Un an în afara intervalului plauzibil e, de regulă, un cod citit greșit ca dată.
  if (y < 1990 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Prima dată dintr-un fragment: „04.11.2025", „2025-11-04", „25 Aug 2026", „03 марта 2026". */
export function findDate(fragment: string): string | null {
  const numeric = fragment.match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})\b/);
  if (numeric) {
    const hit = iso(Number(numeric[3]), Number(numeric[2]), Number(numeric[1]));
    if (hit) return hit;
  }
  const isoLike = fragment.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoLike) {
    const hit = iso(Number(isoLike[1]), Number(isoLike[2]), Number(isoLike[3]));
    if (hit) return hit;
  }
  const named = fragment.match(/(\d{1,2})\s+([A-Za-zА-Яа-яăâîșşțţ]{3,12})\.?,?\s+(\d{4})/);
  if (named) {
    const word = fold(named[2]);
    const month = MONTHS[word] ?? MONTHS[word.slice(0, 3)];
    if (month) {
      const hit = iso(Number(named[3]), month, Number(named[1]));
      if (hit) return hit;
    }
  }
  return null;
}

/** Un număr de act nu e o dată, o sumă cu zecimale sau un cod fiscal de 13 cifre. */
function plausibleNumber(raw: string): boolean {
  const v = raw.trim();
  if (!v || v.length > 30) return false;
  if (/^\d{13}$/.test(v)) return false;
  if (/^\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}$/.test(v)) return false;
  if (/^\d+[.,]\d{2}$/.test(v)) return false;
  return /[0-9]/.test(v);
}

/** Numărul dintr-un fragment: „nr. 251", „Nr: 0041", „№ 17", „Invoice No: INV-2026-0042". */
function findNumber(fragment: string): string | null {
  const labelled = fragment.match(
    /(?:^|[\s(,;:/-])(?:nr|no|numar|num[ăâ]r|№)\s*\.?\s*[:.]?\s*([A-Za-zА-Яа-я0-9][A-Za-zА-Яа-я0-9./\\-]{0,29})/i,
  );
  if (labelled) {
    const value = labelled[1].replace(/[.,;]+$/, "");
    if (plausibleNumber(value)) return value;
  }
  return null;
}

/**
 * Seria + numărul unei facturi fiscale tipizate: rândul „Серия, № EBC000579678" (Anexa 1 la
 * Ordinul MF 118) sau forma scrisă „seria AA nr. 0123456".
 */
function findFiscalSeries(text: string): string | null {
  const joined = text.match(
    /(?:seria|серия|series)[^\n]{0,24}?(?:nr|№|no)\s*\.?\s*[:.]?\s*([A-ZА-Я]{0,6}\s?\d{4,12})/i,
  );
  if (joined) {
    const value = joined[1].replace(/\s+/g, "");
    if (plausibleNumber(value)) return value;
  }
  const split = text.match(/seria\s+([A-Z]{1,6})\s*(?:nr|№|no)\s*\.?\s*[:.]?\s*(\d{4,12})/i);
  if (split) {
    const value = `${split[1]}${split[2]}`;
    if (plausibleNumber(value)) return value;
  }
  return null;
}

/**
 * Datele cu etichetă proprie, oriunde în act: „Data eliberării 04.11.2025", „Date: 12 August 2026",
 * „от 03 марта 2026". Se încearcă TOATE etichetele — „Date Bancare:" (antetul oricărui cont de
 * plată) e o potrivire fără dată după ea, iar oprirea la prima ar pierde data reală de mai jos.
 */
function findLabelledDate(foldedText: string, labels?: RegExp): string | null {
  const re = labels
    ? new RegExp(labels.source, "g")
    : new RegExp(`(?:^|[\\s(,;:/-])(?:data|date|дата|от|incheiat la)${EOW}[^\\n]{0,40}`, "g");
  for (const m of foldedText.matchAll(re)) {
    const hit = findDate(m[0]);
    if (hit) return hit;
  }
  return null;
}

/**
 * Referința actului din textul lui. `null` când documentul nu se recunoaște sau n-are nici număr,
 * nici dată — un „factura fiscală" fără nimic după el n-ajută pe nimeni în ordinul de plată.
 */
export function parseDocumentRef(rawText: string | null | undefined): ParsedDocumentRef | null {
  if (!rawText || !rawText.trim()) return null;
  // PDF-urile reale vin cu spații neîntrerupte și rânduri rupte aiurea; normalizăm o singură dată.
  const text = rawText.replace(/ /g, " ").replace(/[ \t]+/g, " ");
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const folded = fold(text);

  let found: { kind: ParsedDocKind; label: string; index: number; rest: string } | null = null;
  for (const title of TITLES) {
    for (let i = 0; i < lines.length && !found; i++) {
      if (!lines[i]) continue;
      const m = fold(lines[i]).match(title.re);
      if (!m) continue;
      const rest = lines[i].slice(m[0].length);
      if (!titleLineIsTitle(fold(rest))) continue;
      found = { kind: title.kind, label: title.label, index: i, rest };
    }
    if (found) break;
  }
  if (!found) return null;

  // Fereastra de căutare: rândul titlului plus următoarele două. Într-un PDF cu ordinea rândurilor
  // amestecată („CONT DE PLATĂ" / „nr. 68339 din 25 Aug 2026"), numărul stă pe rândul de dedesubt.
  const window = [found.rest, lines[found.index + 1] ?? "", lines[found.index + 2] ?? ""]
    .filter(Boolean)
    .join(" ");

  const number =
    (found.kind === "factura_fiscala" ? findFiscalSeries(text) : null) ??
    findNumber(window);

  const date = findDate(window) ?? findLabelledDate(folded);

  if (!number && !date) return null;
  return { kind: found.kind, label: found.label, number, date };
}

/** „04.11.2025" — data se scrie în ordinul de plată așa cum o citește contabilul, nu ISO. */
function roDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Referința ca text, exact cum intră în destinația plății:
 *   „factura fiscală seria/nr. EBC000579678 din 04.11.2025"
 *   „cont de plată nr. 68339 din 25.08.2026"
 */
export function formatDocumentRef(ref: ParsedDocumentRef | null): string | null {
  if (!ref) return null;
  const parts: string[] = [ref.label];
  if (ref.number) {
    // Factura fiscală tipizată poartă seria și numărul într-un singur cod (EBC000579678) — owner-ul
    // le-a cerut chiar așa, „seria/nr".
    parts.push(ref.kind === "factura_fiscala" ? `seria/nr. ${ref.number}` : `nr. ${ref.number}`);
  }
  if (ref.date) parts.push(`din ${roDate(ref.date)}`);
  return parts.join(" ");
}

/** Ordinea în care tipurile de act se impun când o cerere are mai multe documente. */
const KIND_PRIORITY: ParsedDocKind[] = [
  "factura_fiscala",
  "cont_de_plata",
  "factura",
  "invoice",
  "chitanta",
  "act",
  "contract",
  "proces_verbal",
];

/** Atașamentele din care are rost să citim referința — în ordinea în care sunt crezute. */
const ATTACHMENT_KIND_PRIORITY: Record<string, number> = {
  invoice: 0,
  quotation: 1,
  act_of_receipt: 2,
  contract: 3,
};

export interface DocumentRefCarrier {
  kind: string | null;
  /** JSON-ul analizei, așa cum stă în `par_attachments.analysis`. */
  analysis: string | null;
}

/** Referința scrisă în analiza unui atașament (`analysis.document`), dacă există. */
export function documentRefFromAnalysis(analysis: string | null): ParsedDocumentRef | null {
  if (!analysis) return null;
  try {
    const parsed = JSON.parse(analysis) as { document?: ParsedDocumentRef | null };
    const doc = parsed.document;
    if (!doc || typeof doc !== "object" || !doc.label) return null;
    return doc;
  } catch {
    return null;
  }
}

/**
 * Din toate documentele unei cereri, referința care merge în destinația plății.
 *
 * Ordinul de plată propriu (`payment_order`) e exclus dinadins: e actul pe care tocmai îl scriem,
 * nu cel pe baza căruia plătim. La fel formularul PAR.
 */
export function pickDocumentRef(attachments: DocumentRefCarrier[]): ParsedDocumentRef | null {
  const candidates = attachments
    .filter((a) => (a.kind ?? "other") !== "payment_order" && (a.kind ?? "other") !== "par_pdf")
    .map((a) => ({ att: a, ref: documentRefFromAnalysis(a.analysis) }))
    .filter((c): c is { att: DocumentRefCarrier; ref: ParsedDocumentRef } => !!c.ref);
  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    const byDoc = KIND_PRIORITY.indexOf(a.ref.kind) - KIND_PRIORITY.indexOf(b.ref.kind);
    if (byDoc !== 0) return byDoc;
    const aAtt = ATTACHMENT_KIND_PRIORITY[a.att.kind ?? "other"] ?? 9;
    const bAtt = ATTACHMENT_KIND_PRIORITY[b.att.kind ?? "other"] ?? 9;
    return aAtt - bAtt;
  });
  return candidates[0].ref;
}

/**
 * Destinația plății, gata de copiat în bancă: descrierea cererii, bară, referința actului.
 * Fără referință rămâne exact descrierea de azi.
 */
export function paymentDestination(
  endUse: string | null | undefined,
  ref: ParsedDocumentRef | null,
): string {
  const base = (endUse ?? "").trim();
  const tail = formatDocumentRef(ref);
  if (!tail) return base;
  // Actul e deja scris în descriere (solicitantul l-a trecut de mână) — nu-l repetăm.
  if (ref?.number && base.includes(ref.number)) return base;
  if (!base) return tail;
  return `${base} / ${tail}`;
}

// ─── Ordinul de plată (documentul care CONFIRMĂ plata) ───────────────────────

export interface ParsedPaymentOrderRef {
  /** Numărul ordinului, ca pe document: „2065", „OP-47". */
  number: string | null;
  /** Data lui, ISO „YYYY-MM-DD". */
  date: string | null;
}

/**
 * Titlul documentului de la bancă. Scopul e altul decât la `TITLES`: acolo se caută actul care
 * JUSTIFICĂ plata (factura, contul), fiindcă el intră în destinația plății; aici se caută actul
 * care o CONFIRMĂ. Se potrivește oriunde pe rând, nu doar la început — băncile pun titlul lângă
 * siglă, lângă numărul contului sau într-un tabel.
 */
const PAYMENT_ORDER_TITLE = new RegExp(
  `(?:ordin(?:ul)?\\s+de\\s+plata|dispozitie\\s+de\\s+plata|payment\\s+order|платежное\\s+поручение)${EOW}`,
);

/** Cum își scriu băncile numărul documentului când titlul nu-l poartă pe același rând. */
const DOC_NUMBER_LABELS: RegExp[] = [
  /(?:nr|no|numar(?:ul)?|№)\s*\.?\s*(?:documentului|document|ordinului(?:\s+de\s+plata)?|de plata)\s*[:.]?\s*([a-z0-9][a-z0-9./-]{0,29})/g,
  /(?:documentul|document)\s*(?:nr|no|№)\s*\.?\s*[:.]?\s*([a-z0-9][a-z0-9./-]{0,29})/g,
  /номер\s+документа\s*[:.]?\s*([a-zа-я0-9][a-zа-я0-9./-]{0,29})/g,
];

/** Datele cu etichetă proprie pe un document bancar, mai precise decât „Data" generic. */
const PAYMENT_DATE_LABELS = new RegExp(
  `(?:data\\s+(?:documentului|emiterii|executarii|platii|operatiunii|tranzactiei)` +
    `|дата\\s+(?:документа|операции|платежа))${EOW}[^\\n]{0,40}`,
  "g",
);

/**
 * Numărul documentului din etichetele de mai sus. `fold` păstrează pozițiile 1:1, deci valoarea se
 * taie din textul ORIGINAL — altfel un număr cu literă („OP-47") s-ar întoarce cu litere mici.
 *
 * Două etichete cu valori DIFERITE = un extras de cont cu mai multe operațiuni, nu confirmarea
 * unei plăți. Acolo nu avem cum ști care rând e al cererii noastre, deci nu ghicim.
 */
function findDocumentNumber(text: string, folded: string): string | null {
  const hits = new Set<string>();
  for (const re of DOC_NUMBER_LABELS) {
    for (const m of folded.matchAll(new RegExp(re.source, "g"))) {
      const at = (m.index ?? 0) + m[0].indexOf(m[1]);
      const value = text.slice(at, at + m[1].length).replace(/[.,;]+$/, "");
      if (plausibleNumber(value)) hits.add(value);
    }
  }
  return hits.size === 1 ? [...hits][0] : null;
}

/**
 * Numărul și data ordinului de plată, citite din documentul primit de la bancă.
 *
 * De ce există (owner, 18.09.2026): „numărul ordinului de plată eu după trebuie să-l iau din
 * bancă". La ora plății numărul încă nu există — extrasul ștampilat vine a doua zi, iar rubrica
 * „Referință plată" rămâne goală sau se completează de mână, cerere cu cerere. Din ea se compune
 * numele dosarului (`…_OP-2065_2026-09-18.pdf`) și coloana „Nr. ordin" din Dovezi de plată, deci
 * un număr netastat înseamnă un dosar care nu se poate căuta.
 *
 * Determinist, ca `parseDocumentRef`: numărul unui ordin de plată nu are voie să fie inventat de
 * un model. Dacă documentul e un scan fără strat de text sau nu se recunoaște, întoarce `null` și
 * rubrica rămâne cum era — de completat de om.
 *
 * Se cheamă DOAR pe atașamentele de tip `payment_order`, deci „ordin de plată" de aici e titlul
 * documentului, nu o vorbă dintr-un contract („se achită prin ordin de plată").
 */
export function parsePaymentOrderRef(rawText: string | null | undefined): ParsedPaymentOrderRef | null {
  if (!rawText || !rawText.trim()) return null;
  const text = rawText.replace(/ /g, " ").replace(/[ \t]+/g, " ");
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const folded = fold(text);

  // Fereastra de după titlu: „ORDIN DE PLATĂ nr. 2065 din 18.09.2026" stă pe un rând, dar într-un
  // PDF cu rândurile rupte numărul cade pe cel de dedesubt.
  let window: string | null = null;
  for (let i = 0; i < lines.length && !window; i++) {
    if (!lines[i]) continue;
    const m = fold(lines[i]).match(PAYMENT_ORDER_TITLE);
    if (!m) continue;
    window = [lines[i].slice((m.index ?? 0) + m[0].length), lines[i + 1] ?? "", lines[i + 2] ?? ""]
      .filter(Boolean)
      .join(" ");
  }

  const number = (window ? findNumber(window) : null) ?? findDocumentNumber(text, folded);
  const date =
    (window ? findDate(window) : null) ?? findLabelledDate(folded, PAYMENT_DATE_LABELS) ?? findLabelledDate(folded);

  if (!number && !date) return null;
  return { number, date };
}
