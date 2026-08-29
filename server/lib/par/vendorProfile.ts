/**
 * PAR-VENDOR360 — logica fișei de furnizor, pură și testabilă.
 *
 * Rutele fac interogările; aici stau regulile: cum se normalizează un domeniu, cum se rezumă
 * evaluările, ce înseamnă „a lucrat bine cu noi" în cifre și — cel mai important — ce semnale de
 * risc scoatem în față. Un semnal greșit costă mai mult decât unul lipsă: dacă marcăm „IBAN
 * schimbat" pe un furnizor care doar și-a completat rechizitele, oamenii vor învăța să ignore
 * avertismentele. De aceea fiecare flag de mai jos are o condiție strictă și un mesaj care spune
 * exact ce s-a văzut.
 */

/** Normalizează un nume de domeniu la o cheie stabilă: „Servicii Juridice" → „servicii-juridice". */
export function slugifyCategory(name: string): string {
  return name
    .replace(/[ĂÂÎȘȚăâîșț]/g, (c) => ({ "Ă": "a", "Â": "a", "Î": "i", "Ș": "s", "Ț": "t", "ă": "a", "â": "a", "î": "i", "ș": "s", "ț": "t" })[c] ?? c)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

/**
 * Domeniile cu care pornește o organizație nouă. Nu sunt o listă închisă — sunt punctul de la care
 * cineva editează, ca să nu se uite la un ecran gol în ziua întâi.
 */
export const DEFAULT_VENDOR_CATEGORIES = [
  "Alimentație / catering",
  "Birotică și consumabile",
  "Servicii juridice",
  "Contabilitate și audit",
  "Transport și logistică",
  "IT și echipamente",
  "Tipar și publicitate",
  "Chirie și utilități",
  "Construcții și reparații",
  "Traduceri",
  "Instruire și consultanță",
  "Servicii medicale",
] as const;

export type RatingRow = {
  stars: number;
  qualityStars?: number | null;
  timelinessStars?: number | null;
  priceStars?: number | null;
  communicationStars?: number | null;
  wouldUseAgain?: boolean | null;
};

export type RatingSummary = {
  count: number;
  avg: number | null;
  quality: number | null;
  timeliness: number | null;
  price: number | null;
  communication: number | null;
  /** Procentul celor care ar mai lucra cu furnizorul, dintre cei care au răspuns la întrebare. */
  wouldUseAgainPct: number | null;
  /** Câte stele de fiecare fel — histograma din fișă. */
  distribution: Record<1 | 2 | 3 | 4 | 5, number>;
};

function average(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

export function summarizeRatings(rows: RatingRow[]): RatingSummary {
  const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of rows) {
    const s = Math.min(5, Math.max(1, Math.round(r.stars))) as 1 | 2 | 3 | 4 | 5;
    distribution[s] += 1;
  }
  const answered = rows.filter((r) => r.wouldUseAgain != null);
  return {
    count: rows.length,
    avg: average(rows.map((r) => r.stars)),
    quality: average(rows.filter((r) => r.qualityStars != null).map((r) => r.qualityStars as number)),
    timeliness: average(rows.filter((r) => r.timelinessStars != null).map((r) => r.timelinessStars as number)),
    price: average(rows.filter((r) => r.priceStars != null).map((r) => r.priceStars as number)),
    communication: average(
      rows.filter((r) => r.communicationStars != null).map((r) => r.communicationStars as number)
    ),
    wouldUseAgainPct: answered.length
      ? Math.round((answered.filter((r) => r.wouldUseAgain).length / answered.length) * 100)
      : null,
    distribution,
  };
}

export type VendorRequestRow = {
  id: string;
  status: string;
  currency: string;
  totalEstimatedCents: number;
  totalMdlCents?: number | null;
  actualAmountCents?: number | null;
  payeeIban?: string | null;
  submittedAt?: Date | string | null;
  approvedAt?: Date | string | null;
  paidAt?: Date | string | null;
};

export type VendorKpis = {
  requestCount: number;
  paidCount: number;
  /** Total plătit efectiv, în bani MDL (unități minore). */
  paidCents: number;
  /** Angajat = trimis/aprobat/în finanțe, adică bani promiși dar neieșiți încă. */
  committedCents: number;
  avgRequestCents: number | null;
  firstRequestAt: string | null;
  lastPaidAt: string | null;
  /** Zile medii de la aprobare până la plată — cât de repede ne ținem noi de cuvânt. */
  avgDaysApprovalToPayment: number | null;
  /** Zile medii de la trimitere până la plată — cât durează în total, capăt la capăt. */
  avgDaysSubmitToPayment: number | null;
};

const COMMITTED_STATUSES = new Set([
  "pending_approval",
  "approved",
  "in_finance",
  "reapproval_required",
  "changes_requested",
]);

function toDate(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(from: Date, to: Date): number {
  return (to.getTime() - from.getTime()) / 86_400_000;
}

/** Suma în MDL a unei cereri: plata efectivă dacă există, altfel echivalentul MDL, altfel nativul. */
export function requestMdlCents(r: VendorRequestRow): number {
  if (r.status === "paid" && r.currency === "MDL" && r.actualAmountCents != null) return r.actualAmountCents;
  return r.totalMdlCents ?? r.totalEstimatedCents ?? 0;
}

export function computeVendorKpis(rows: VendorRequestRow[]): VendorKpis {
  const paid = rows.filter((r) => r.status === "paid");
  const paidCents = paid.reduce((sum, r) => sum + requestMdlCents(r), 0);
  const committedCents = rows
    .filter((r) => COMMITTED_STATUSES.has(r.status))
    .reduce((sum, r) => sum + requestMdlCents(r), 0);

  const submitted = rows
    .map((r) => toDate(r.submittedAt) ?? toDate(r.approvedAt))
    .filter((d): d is Date => d != null)
    .sort((a, b) => a.getTime() - b.getTime());

  const paidDates = paid.map((r) => toDate(r.paidAt)).filter((d): d is Date => d != null);

  const approvalToPayment = paid
    .map((r) => {
      const a = toDate(r.approvedAt);
      const p = toDate(r.paidAt);
      return a && p && p >= a ? daysBetween(a, p) : null;
    })
    .filter((d): d is number => d != null);

  const submitToPayment = paid
    .map((r) => {
      const s = toDate(r.submittedAt);
      const p = toDate(r.paidAt);
      return s && p && p >= s ? daysBetween(s, p) : null;
    })
    .filter((d): d is number => d != null);

  const counted = rows.filter((r) => r.status !== "draft" && r.status !== "cancelled");

  return {
    requestCount: rows.length,
    paidCount: paid.length,
    paidCents,
    committedCents,
    avgRequestCents: counted.length
      ? Math.round(counted.reduce((sum, r) => sum + requestMdlCents(r), 0) / counted.length)
      : null,
    firstRequestAt: submitted[0]?.toISOString() ?? null,
    lastPaidAt: paidDates.length
      ? new Date(Math.max(...paidDates.map((d) => d.getTime()))).toISOString()
      : null,
    avgDaysApprovalToPayment: approvalToPayment.length ? Math.round(average(approvalToPayment)! * 10) / 10 : null,
    avgDaysSubmitToPayment: submitToPayment.length ? Math.round(average(submitToPayment)! * 10) / 10 : null,
  };
}

export type RiskFlag = {
  code:
    | "blocked"
    | "iban_changed"
    | "registry_inactive"
    | "missing_fiscal_id"
    | "low_rating"
    | "document_expiring"
    | "document_expired"
    | "patent_expired"
    | "never_rated";
  severity: "critical" | "warning" | "info";
  message: string;
};

export type VendorForFlags = {
  relationship?: string | null;
  blockedReason?: string | null;
  idnp?: string | null;
  kind?: string | null;
  companyStatus?: string | null;
  isPatentHolder?: boolean | null;
  patentValidUntil?: string | null;
};

export type VendorDocumentForFlags = {
  title: string;
  kind: string;
  validUntil?: Date | string | null;
};

/**
 * Semnalele care merită scoase în fața omului care alege un furnizor.
 *
 * `iban_changed` e cel mai valoros: schimbarea contului bancar al unui furnizor cunoscut e tiparul
 * clasic de fraudă prin email („v-am schimbat IBAN-ul, plătiți aici"). Îl ridicăm doar când chiar
 * există două IBAN-uri DIFERITE pe cereri, nu când unul lipsea și s-a completat ulterior.
 */
export function detectRiskFlags(input: {
  vendor: VendorForFlags;
  requests: VendorRequestRow[];
  ratings: RatingSummary;
  documents?: VendorDocumentForFlags[];
  now?: Date;
}): RiskFlag[] {
  const { vendor, requests, ratings } = input;
  const now = input.now ?? new Date();
  const flags: RiskFlag[] = [];

  if (vendor.relationship === "blocked") {
    flags.push({
      code: "blocked",
      severity: "critical",
      message: vendor.blockedReason
        ? `Furnizor blocat: ${vendor.blockedReason}`
        : "Furnizor blocat pentru colaborări noi.",
    });
  }

  const ibans = Array.from(
    new Set(
      requests
        .map((r) => r.payeeIban?.replace(/\s/g, "").toUpperCase())
        .filter((v): v is string => !!v)
    )
  );
  if (ibans.length > 1) {
    flags.push({
      code: "iban_changed",
      severity: "critical",
      message: `Cereri plătite pe ${ibans.length} conturi diferite (${ibans
        .map((i) => `…${i.slice(-4)}`)
        .join(", ")}). Confirmă contul prin telefon înainte de plată.`,
    });
  }

  if (vendor.kind === "company" && vendor.companyStatus && !/activ/i.test(vendor.companyStatus)) {
    flags.push({
      code: "registry_inactive",
      severity: "warning",
      message: `În registrul de stat compania apare ca „${vendor.companyStatus}".`,
    });
  }

  if (!vendor.idnp) {
    flags.push({
      code: "missing_fiscal_id",
      severity: "warning",
      message: "Lipsește codul fiscal — actul de plată nu se poate întocmi complet.",
    });
  }

  if (vendor.isPatentHolder && vendor.patentValidUntil) {
    const until = toDate(vendor.patentValidUntil);
    if (until && until < now) {
      flags.push({
        code: "patent_expired",
        severity: "critical",
        message: `Patenta a expirat pe ${until.toISOString().slice(0, 10)}.`,
      });
    }
  }

  if (ratings.count >= 2 && ratings.avg != null && ratings.avg < 3) {
    flags.push({
      code: "low_rating",
      severity: "warning",
      message: `Notă medie ${ratings.avg.toFixed(1)} din ${ratings.count} evaluări.`,
    });
  }

  if (ratings.count === 0 && requests.some((r) => r.status === "paid")) {
    flags.push({
      code: "never_rated",
      severity: "info",
      message: "Am plătit acestui furnizor, dar nimeni nu i-a evaluat prestația.",
    });
  }

  for (const doc of input.documents ?? []) {
    const until = toDate(doc.validUntil);
    if (!until) continue;
    const days = daysBetween(now, until);
    if (days < 0) {
      flags.push({
        code: "document_expired",
        severity: "warning",
        message: `„${doc.title}" a expirat pe ${until.toISOString().slice(0, 10)}.`,
      });
    } else if (days <= 30) {
      flags.push({
        code: "document_expiring",
        severity: "info",
        message: `„${doc.title}" expiră în ${Math.ceil(days)} zile.`,
      });
    }
  }

  return flags;
}

/**
 * Compară oferte pe aceeași unitate de măsură. Fără unitate comună, o comparație de prețuri e
 * dezinformare (2.000 lei „pentru 10 topuri" vs 2.000 lei „pentru 100") — de aceea grupăm strict
 * pe eticheta unității și returnăm doar grupurile cu cel puțin două oferte.
 */
export function compareOffersByUnit(
  offers: { id: string; vendorId: string; unitLabel?: string | null; unitPriceCents?: number | null; offeredAt: Date | string }[]
): { unitLabel: string; offers: { id: string; vendorId: string; unitPriceCents: number; offeredAt: string }[]; bestId: string }[] {
  const groups = new Map<string, { id: string; vendorId: string; unitPriceCents: number; offeredAt: string }[]>();
  for (const o of offers) {
    const label = o.unitLabel?.trim().toLowerCase();
    if (!label || o.unitPriceCents == null) continue;
    const list = groups.get(label) ?? [];
    list.push({
      id: o.id,
      vendorId: o.vendorId,
      unitPriceCents: o.unitPriceCents,
      offeredAt: (o.offeredAt instanceof Date ? o.offeredAt : new Date(o.offeredAt)).toISOString(),
    });
    groups.set(label, list);
  }
  return Array.from(groups.entries())
    .filter(([, list]) => list.length >= 2)
    .map(([unitLabel, list]) => {
      const sorted = [...list].sort((a, b) => a.unitPriceCents - b.unitPriceCents);
      return { unitLabel, offers: sorted, bestId: sorted[0].id };
    });
}
