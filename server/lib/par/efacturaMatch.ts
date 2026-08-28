/**
 * PAR-EFP: potrivirea unei e-Facturi din SIA „e-Factura" (SFS) cu o cerere PAR plătită.
 *
 * Funcții PURE (fără DB, fără rețea) — tot ce ține de „a emis prestatorul factura pentru plata
 * asta?" se decide aici, ca să poată fi testat cu date reale de XML, nu doar cu mock-uri.
 *
 * Contextul: după ce PAR-ul e achitat, prestatorul persoană juridică e obligat să emită e-Factura.
 * Noi suntem CUMPĂRĂTORUL, deci factura apare în lista noastră de facturi primite. O potrivim după:
 *   1. codul fiscal al furnizorului = codul fiscal al beneficiarului din PAR  (obligatoriu)
 *   2. codul fiscal al cumpărătorului = IDNO-ul organizației plătitoare      (dacă îl știm)
 *   3. data facturii în fereastra din jurul plății                           (obligatoriu)
 *   4. suma                                                                  (departajare, nu filtru)
 *
 * De ce suma NU e filtru dur: prestatorii facturează des altfel decât s-a plătit (avans, mai multe
 * PAR-uri pe o factură, TVA rotunjit). O potrivire cu sumă diferită rămâne o potrivire, dar e
 * marcată cu `amountMatches: false` ca omul să vadă diferența în interfață și să decidă.
 */

/** Statusurile SFS care NU contează drept „factură emisă": ciornă, refuzată, anulată. */
const DEAD_INVOICE_STATUSES = new Set([0, 2, 5]);

/** Fereastra implicită: cu 30 de zile ÎNAINTE de plată (facturi emise la livrare, plătite ulterior). */
export const DEFAULT_DAYS_BEFORE_PAYMENT = 30;
/** …și 120 de zile după plată — prestatorii întârzie, iar coada trebuie să-i prindă. */
export const DEFAULT_DAYS_AFTER_PAYMENT = 120;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Normalizează un cod fiscal pentru comparație: fără spații, puncte, liniuțe; litere mari.
 * IDNO-ul moldovenesc e numeric (13 cifre), dar registrul ține și coduri străine alfanumerice.
 */
export function normalizeFiscalId(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

/** Două coduri fiscale sunt aceleași dacă normalizarea lor coincide (și nu sunt goale). */
export function sameFiscalId(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeFiscalId(a);
  const nb = normalizeFiscalId(b);
  return na.length > 0 && na === nb;
}

/** O factură din SFS, redusă la câmpurile după care se face potrivirea. */
export interface SfsInvoiceSummary {
  seria: string;
  number: string;
  invoiceStatus: number;
  invoiceStatusLabel: string;
  supplierIdno: string | null;
  /** Denumirea furnizorului, când XML-ul o expune (nu toate formularele o au). */
  supplierName?: string | null;
  buyerIdno: string | null;
  invoiceDate: Date | null;
  /** Totalul cu TVA, în unități minore (bani). Null dacă XML-ul nu l-a expus. */
  totalCents: number | null;
  /** Linkul către factura din portalul SFS (din textul QR), dacă îl avem. */
  portalUrl?: string | null;
}

/** Cheie stabilă a unei facturi — o factură nu poate acoperi două cereri diferite. */
export function invoiceKey(inv: { seria: string; number: string }): string {
  return `${inv.seria.trim().toUpperCase()}|${inv.number.trim()}`;
}

// ─── Parsarea XML-ului de factură SFS ─────────────────────────────────────────

function attr(xml: string, tag: string, name: string): string | null {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}\\b[^>]*?\\b${name}\\s*=\\s*"([^"]*)"`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

function element(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w]+:)?${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : null;
}

/** Suma în unități minore dintr-un text zecimal („1234.50" / „1 234,50" → 123450). */
export function moneyToCents(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/\s/g, "").replace(/,/g, ".");
  const m = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const value = Number(m[0]);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Extrage din XML-ul facturii SFS datele necesare potrivirii.
 *
 * Formatul SFS pune codurile fiscale ca ATRIBUTE (`<Supplier IDNO="…">`), iar totalul îl expune fie
 * ca element (`<TotalPrice>`), fie doar pe rânduri (`TotalPrice="…"` per `<Row>`), caz în care se
 * însumează. Parserul e tolerant intenționat: XML-ul real vine din mai multe versiuni de formular,
 * iar un câmp lipsă trebuie să însemne „nu știu", nu „a picat scanarea".
 */
export function parseSfsInvoiceXml(xml: string | null | undefined): {
  supplierIdno: string | null;
  supplierName: string | null;
  buyerIdno: string | null;
  invoiceDate: Date | null;
  totalCents: number | null;
} {
  if (!xml) {
    return { supplierIdno: null, supplierName: null, buyerIdno: null, invoiceDate: null, totalCents: null };
  }

  const supplierIdno =
    attr(xml, "Supplier", "IDNO") ?? element(xml, "SupplierIDNO") ?? element(xml, "SupplierIdno");
  const supplierName =
    attr(xml, "Supplier", "Name") ?? element(xml, "SupplierName") ?? element(xml, "SupplierNameString");
  const buyerIdno =
    attr(xml, "Buyer", "IDNO") ?? element(xml, "BuyerIDNO") ?? element(xml, "BuyerIdno");
  const invoiceDate = parseDate(
    element(xml, "DeliveryDate") ?? element(xml, "InvoiceDate") ?? element(xml, "DocumentDate")
  );

  let totalCents = moneyToCents(element(xml, "TotalPrice") ?? element(xml, "TotalSum"));
  if (totalCents === null) {
    // Fără total explicit: însumăm atributul TotalPrice de pe fiecare rând de marfă/serviciu.
    const rowTotals = [...xml.matchAll(/<(?:[\w]+:)?Row\b[^>]*?\bTotalPrice\s*=\s*"([^"]*)"/gi)]
      .map((m) => moneyToCents(m[1]))
      .filter((v): v is number => v !== null);
    if (rowTotals.length > 0) totalCents = rowTotals.reduce((a, b) => a + b, 0);
  }

  return {
    supplierIdno: supplierIdno?.trim() || null,
    supplierName: supplierName?.trim() || null,
    buyerIdno: buyerIdno?.trim() || null,
    invoiceDate,
    totalCents,
  };
}

/**
 * Textul QR al unei facturi SFS — singura sursă de furnizor/cumpărător/sumă pentru facturile
 * ARHIVATE (acolo `GetInvoicesBySeriaNumber` întoarce `<XML>` gol; verificat live 2026-08-28).
 *
 * Formatul, așa cum îl întoarce SFS-ul real:
 *   „EAW 000504087 Furn-1024600080726 Cump-1024600035737 Suma totala-16667.00lei Suma TVA- 0lei
 *    https://efactura.sfs.md:443/EFactura.aspx?id=2f6593e6-…"
 * Sumele apar și fără zecimale („1248lei"), iar TVA-ul poate avea spațiu după liniuță.
 */
export interface SfsQrInfo {
  supplierIdno: string | null;
  buyerIdno: string | null;
  totalCents: number | null;
  vatCents: number | null;
  /** Linkul către factura din portalul SFS, ca omul să o poată deschide. */
  portalUrl: string | null;
}

export function parseSfsQrText(text: string | null | undefined): SfsQrInfo {
  const empty: SfsQrInfo = { supplierIdno: null, buyerIdno: null, totalCents: null, vatCents: null, portalUrl: null };
  if (!text) return empty;
  const supplier = text.match(/Furn-\s*([0-9A-Za-z]+)/i);
  const buyer = text.match(/Cump-\s*([0-9A-Za-z]+)/i);
  const total = text.match(/Suma\s+totala-\s*([0-9.,\s]+?)\s*lei/i);
  const vat = text.match(/Suma\s+TVA-\s*([0-9.,\s]+?)\s*lei/i);
  const url = text.match(/https?:\/\/\S+/);
  return {
    supplierIdno: supplier?.[1] ?? null,
    buyerIdno: buyer?.[1] ?? null,
    totalCents: moneyToCents(total?.[1]),
    vatCents: moneyToCents(vat?.[1]),
    portalUrl: url?.[0] ?? null,
  };
}

/** Combină antetul listei SFS (serie/număr/status) cu datele din XML-ul facturii. */
export function summarizeSfsInvoice(item: {
  seria: string;
  number: string;
  invoiceStatus: number;
  invoiceStatusLabel?: string;
  xml?: string | null;
  /** Textul QR, folosit ca sursă de rezervă când XML-ul lipsește (facturi arhivate). */
  qrText?: string | null;
}): SfsInvoiceSummary {
  const parsed = parseSfsInvoiceXml(item.xml);
  const qr = parseSfsQrText(item.qrText);
  return {
    seria: item.seria,
    number: item.number,
    invoiceStatus: item.invoiceStatus,
    invoiceStatusLabel: item.invoiceStatusLabel ?? "",
    supplierIdno: parsed.supplierIdno ?? qr.supplierIdno,
    supplierName: parsed.supplierName,
    buyerIdno: parsed.buyerIdno ?? qr.buyerIdno,
    invoiceDate: parsed.invoiceDate,
    totalCents: parsed.totalCents ?? qr.totalCents,
    portalUrl: qr.portalUrl,
  };
}

// ─── Ce cereri așteaptă o e-Factura ───────────────────────────────────────────

export interface ParEfacturaCandidate {
  /** Statusul cererii — doar cele plătite așteaptă factură. */
  status: string;
  purpose: string;
  /** „juridic" / „fizic" / null (necunoscut, moștenit). */
  payeeType: string | null;
  /** Codul fiscal al beneficiarului (din cerere sau din registrul de prestatori). */
  payeeIdnp: string | null;
  /** „company" / „individual" — din registrul de prestatori, când cererea are vendor. */
  vendorKind?: string | null;
}

export interface ExpectationVerdict {
  expected: boolean;
  /** Motivul, în română, gata de afișat. */
  reason: string;
}

/**
 * Decide dacă pentru cererea asta AVEM DREPTUL să așteptăm o e-Factura.
 *
 * Persoana fizică nu emite e-Factura (nu e actor în SIA), deci a cere una ar fi un reminder greșit
 * trimis unui coleg. Când tipul beneficiarului nu e completat (cereri vechi), ne uităm la registrul
 * de prestatori; dacă nici acolo nu scrie nimic, prezența unui cod fiscal e semnalul cel mai bun.
 */
export function expectsEfactura(par: ParEfacturaCandidate): ExpectationVerdict {
  if (par.status !== "paid") {
    return { expected: false, reason: "Cererea nu e achitată încă." };
  }
  if (par.purpose !== "execute_payment") {
    return { expected: false, reason: "Cererea nu este de tip executare plată." };
  }

  const kind = (par.vendorKind ?? "").toLowerCase();
  const type = (par.payeeType ?? "").toLowerCase();

  if (type === "fizic" || kind === "individual") {
    return { expected: false, reason: "Beneficiarul e persoană fizică — nu emite e-Factura." };
  }
  if (!normalizeFiscalId(par.payeeIdnp)) {
    return {
      expected: false,
      reason: "Beneficiarul nu are cod fiscal completat — nu avem după ce căuta în SFS.",
    };
  }
  if (type !== "juridic" && kind !== "company") {
    // Cod fiscal completat, dar tipul nu e declarat: în MD un IDNO de 13 cifre care începe cu 1
    // aparține unei entități juridice; oricum, având cod fiscal, căutarea e legitimă.
    return { expected: true, reason: "Beneficiar cu cod fiscal — verificăm dacă a emis e-Factura." };
  }
  return { expected: true, reason: "Beneficiar persoană juridică — trebuie să emită e-Factura." };
}

// ─── Potrivirea propriu-zisă ──────────────────────────────────────────────────

export interface ParMatchTarget {
  /** Codul fiscal al prestatorului plătit. */
  supplierIdno: string | null;
  /** IDNO-ul organizației plătitoare (noi, cumpărătorul). Opțional. */
  buyerIdno?: string | null;
  /** Când s-a făcut plata (sau data cererii, dacă plata n-a fost datată). */
  paidAt: Date | null;
  /** Suma plătită efectiv, în unități minore. */
  amountCents: number | null;
}

export interface MatchOptions {
  daysBefore?: number;
  daysAfter?: number;
  /** Facturi deja alocate altor cereri în aceeași scanare — nu se refolosesc. */
  usedKeys?: Set<string>;
  /** „Acum" injectabil, ca testele să fie deterministe. */
  now?: Date;
  /** Toleranța de sumă: 1% sau minimum 100 bani (1 leu). */
  amountTolerancePct?: number;
}

export interface ParEfacturaMatch {
  invoice: SfsInvoiceSummary;
  /** True când suma facturii coincide cu suma plătită (în toleranță). */
  amountMatches: boolean;
  /** Explicație în română a potrivirii, pentru interfață și jurnal. */
  note: string;
}

/**
 * Alege factura care corespunde cel mai bine plății. Întoarce null dacă nu există niciun candidat.
 *
 * Ordinea de preferință: sumă potrivită > data mai apropiată de plată. Facturile refuzate, anulate
 * sau rămase ciornă nu contează — ele nu dovedesc nimic.
 */
export function matchInvoiceForPar(
  target: ParMatchTarget,
  invoices: SfsInvoiceSummary[],
  options: MatchOptions = {}
): ParEfacturaMatch | null {
  const supplier = normalizeFiscalId(target.supplierIdno);
  if (!supplier) return null;

  const now = options.now ?? new Date();
  const anchor = target.paidAt ?? now;
  const daysBefore = options.daysBefore ?? DEFAULT_DAYS_BEFORE_PAYMENT;
  const daysAfter = options.daysAfter ?? DEFAULT_DAYS_AFTER_PAYMENT;
  const from = anchor.getTime() - daysBefore * DAY_MS;
  const to = anchor.getTime() + daysAfter * DAY_MS;
  const used = options.usedKeys ?? new Set<string>();
  const tolerancePct = options.amountTolerancePct ?? 1;

  const candidates = invoices.filter((inv) => {
    if (used.has(invoiceKey(inv))) return false;
    if (DEAD_INVOICE_STATUSES.has(inv.invoiceStatus)) return false;
    if (!sameFiscalId(inv.supplierIdno, supplier)) return false;
    // Într-un workspace cu mai multe entități juridice, factura emisă pe ALTĂ entitate nu e a
    // acestei cereri. Dacă nu știm IDNO-ul cumpărătorului, nu filtrăm (nu inventăm restricții).
    const buyer = normalizeFiscalId(target.buyerIdno);
    if (buyer && inv.buyerIdno && !sameFiscalId(inv.buyerIdno, buyer)) return false;
    // Fără dată în XML nu putem exclude nimic — o păstrăm ca posibilă potrivire.
    if (inv.invoiceDate) {
      const t = inv.invoiceDate.getTime();
      if (t < from || t > to) return false;
    }
    return true;
  });

  if (candidates.length === 0) return null;

  const amountOk = (inv: SfsInvoiceSummary): boolean => {
    if (target.amountCents == null || inv.totalCents == null) return false;
    const tolerance = Math.max(100, Math.round((Math.abs(target.amountCents) * tolerancePct) / 100));
    return Math.abs(inv.totalCents - target.amountCents) <= tolerance;
  };

  const distance = (inv: SfsInvoiceSummary): number =>
    inv.invoiceDate ? Math.abs(inv.invoiceDate.getTime() - anchor.getTime()) : Number.MAX_SAFE_INTEGER;

  const best = [...candidates].sort((a, b) => {
    const byAmount = Number(amountOk(b)) - Number(amountOk(a));
    if (byAmount !== 0) return byAmount;
    return distance(a) - distance(b);
  })[0];

  const matches = amountOk(best);
  const parts = [`Furnizor ${best.supplierIdno ?? "?"}`];
  if (best.invoiceDate) parts.push(`emisă ${best.invoiceDate.toISOString().slice(0, 10)}`);
  if (best.totalCents != null && target.amountCents != null) {
    parts.push(
      matches
        ? "sumă identică cu plata"
        : `sumă diferită de plată (${(best.totalCents / 100).toFixed(2)} vs ${(target.amountCents / 100).toFixed(2)})`
    );
  }

  return { invoice: best, amountMatches: matches, note: parts.join(" · ") };
}
