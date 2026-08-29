/**
 * Jurnalul de activitate, scris pentru oameni.
 *
 * Rândurile din `par_audit` sunt scrise de server în limbaj tehnic (engleză, id-uri,
 * hash-uri, JSON). Pe ecran ele ajungeau exact așa — „Updated fields: payeeType",
 * `{"attachmentId":"0973c7b7-…","checks":[{"field":"sumă","expected":2340200,…}]}`.
 * Cine deschide dosarul nu citește JSON; vrea să afle ce s-a întâmplat, într-o frază.
 *
 * Aici traducem: fiecare eveniment devine un titlu scurt în română plus cel mult
 * câteva propoziții. Ce nu spune nimic unui om (uuid-uri, hash-uri, „cents") se taie.
 * Rândurile vechi din baza de date rămân neatinse — traducerea se face la afișare.
 */
import { formatCurrency, PAR_STATUS_LABELS } from "../api/par";

export interface HumanTimelineEvent {
  icon: string;
  title: string;
  /** Propoziții scurte, în ordinea în care merită citite. Poate fi gol. */
  lines: string[];
}

// ─── Titluri și pictograme ────────────────────────────────────────────────────

/** Catalogul de evenimente PAR, cu titlul lor omenesc. Sursa unică — și pentru filtrele din
 *  „Administrare PAR → Audit", ca să nu existe două dicționare care divergă (docs/solutions
 *  frontend/one-concept-one-label.md). */
export const PAR_EVENT_TITLES: Record<string, string> = {
  created: "Cerere creată",
  created_from_template: "Creată dintr-un șablon",
  duplicated_from: "Copiată după altă cerere",
  edited: "Modificată",
  quote_selected: "Ofertă aleasă",
  submitted: "Trimisă spre aprobare",
  approved: "Semnată la un pas",
  step_unlocked: "A intrat la pasul următor",
  fully_approved: "Aprobată complet",
  fully_approved_to_finance: "Aprobată complet și trimisă la finanțe",
  rejected: "Respinsă",
  changes_requested: "S-au cerut modificări",
  withdrawn: "Retrasă pentru corectare",
  reopened: "Redeschisă ca ciornă",
  cancelled: "Anulată",
  in_finance: "Primită de finanțe",
  reapproval_required: "Are nevoie de reaprobare",
  overage_reapproved: "Depășirea de sumă a fost reaprobată",
  approval_limit_exceeded: "Peste limita aprobatorului",
  paid: "Plătită",
  vendor_autosaved: "Beneficiar salvat în registru",
  po_issued: "Comandă emisă",
  goods_received: "Recepție înregistrată",
  document_reconciliation_match: "Actul se potrivește cu cererea",
  document_reconciliation_warning: "Actul nu se potrivește cu cererea",
  integrity_mismatch: "Datele diferă de cele semnate",
  integrity_mismatch_display: "Datele diferă de cele semnate",
  efactura_reminder: "Reminder pentru e-Factura",
  efactura_marked_received: "e-Factura marcată ca primită",
};

const EVENT_ICONS: Record<string, string> = {
  created: "➕",
  created_from_template: "➕",
  duplicated_from: "➕",
  edited: "✏️",
  quote_selected: "🧾",
  submitted: "📤",
  approved: "✅",
  fully_approved: "✅",
  fully_approved_to_finance: "✅",
  step_unlocked: "🔓",
  rejected: "❌",
  changes_requested: "🔄",
  withdrawn: "↩️",
  reopened: "↩️",
  cancelled: "🚫",
  in_finance: "🏦",
  reapproval_required: "⚠️",
  overage_reapproved: "✅",
  approval_limit_exceeded: "⚠️",
  paid: "💰",
  vendor_autosaved: "📇",
  po_issued: "📦",
  goods_received: "📦",
  document_reconciliation_match: "🔍",
  document_reconciliation_warning: "⚠️",
  integrity_mismatch: "⚠️",
  integrity_mismatch_display: "⚠️",
  efactura_reminder: "✉️",
  efactura_marked_received: "🧾",
};

export function eventTitle(event: string): string {
  if (PAR_EVENT_TITLES[event]) return PAR_EVENT_TITLES[event];
  const words = event.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "Activitate";
}

export function eventIcon(event: string): string {
  return EVENT_ICONS[event] ?? "📋";
}

// ─── Etichete de câmp (cheile camelCase din par_requests) ─────────────────────

const FIELD_LABELS: Record<string, string> = {
  payerId: "Organizația plătitoare",
  dateOfRequest: "Data cererii",
  requestorTitle: "Funcția solicitantului",
  requestorCode: "Codul solicitantului",
  departmentId: "Departamentul",
  dateNeeded: "Data până la care e nevoie",
  projectId: "Proiectul",
  eventId: "Evenimentul",
  budgetCodeId: "Codul bugetar",
  budgetCodeNote: "Nota la codul bugetar",
  purpose: "Scopul cererii",
  chargeTo: "Se pune pe",
  chargeBillingCode: "Codul de facturare",
  endUse: "Destinația finală",
  currency: "Valuta",
  attachmentsPresent: "Anexe atașate",
  attachmentsNote: "Nota la anexe",
  vendorId: "Beneficiarul din registru",
  payeeName: "Beneficiarul",
  payeeIdnp: "IDNO/IDNP-ul beneficiarului",
  payeeIban: "IBAN-ul beneficiarului",
  payeeBank: "Banca beneficiarului",
  payeeType: "Tipul beneficiarului",
  totalEstimatedCents: "Suma estimată",
  totalMdlCents: "Totalul în lei",
  exchangeRate: "Cursul valutar",
  status: "Statusul",
};

export function fieldLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  // camelCase → cuvinte separate, ca să nu apară „budgetCodeNote" pe ecran
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

const ENUM_LABELS: Record<string, Record<string, string>> = {
  payeeType: { fizic: "persoană fizică", juridic: "persoană juridică" },
  purpose: {
    execute_payment: "efectuarea plății",
    obtain_quotations: "obținerea ofertelor",
    provide_estimate: "oferirea unei estimări",
  },
  chargeTo: { operations: "operațional", program: "program", other: "altceva" },
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T|$)/;

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
}

/** Valoarea unui câmp, scrisă ca pentru o persoană (nu ca pentru un log). */
export function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "necompletat";
  if (value === "***") return "ascuns (date bancare)";
  if (typeof value === "boolean") return value ? "da" : "nu";
  if (ENUM_LABELS[key]?.[String(value)]) return ENUM_LABELS[key][String(value)];
  if (key === "status")
    return (PAR_STATUS_LABELS as Record<string, string>)[String(value)] ?? String(value);
  if (typeof value === "number" && key.endsWith("Cents")) return formatCurrency(value, "MDL");
  const str = String(value);
  if (UUID_RE.test(str)) return "altă valoare";
  if (ISO_DATE_RE.test(str)) return fmtDate(str);
  return str.length > 90 ? `${str.slice(0, 90)}…` : str;
}

/**
 * Diferențele salvate ca JSON ({"payeeType":{"from":null,"to":"juridic"}}) devin
 * rânduri de tipul „Tipul beneficiarului: necompletat → persoană juridică".
 */
export function humanizeDiff(diff: string | null | undefined): string[] {
  if (!diff) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(diff);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== "object") return [];

  const lines: string[] = [];
  for (const [key, raw] of Object.entries(parsed as Record<string, unknown>)) {
    const label = fieldLabel(key);
    if (!raw || typeof raw !== "object") {
      lines.push(`${label}: ${formatFieldValue(key, raw)}`);
      continue;
    }
    const change = raw as Record<string, unknown>;
    const before = "from" in change ? change.from : change.before;
    const after = "to" in change ? change.to : change.after;
    const beforeEmpty = before === null || before === undefined || before === "";
    const afterEmpty = after === null || after === undefined || after === "";

    // Datele bancare se salvează redactate („***"): spunem doar că s-au completat.
    if (before === "***" || after === "***") {
      if (afterEmpty) lines.push(`${label}: șters`);
      else if (beforeEmpty) lines.push(`${label}: completat (valoarea nu se afișează)`);
      else lines.push(`${label}: schimbat (valoarea nu se afișează)`);
      continue;
    }

    // Id-urile brute nu spun nimic: arătăm doar direcția schimbării.
    const isOpaque = (v: unknown) => typeof v === "string" && UUID_RE.test(v);
    if (isOpaque(before) || isOpaque(after)) {
      if (beforeEmpty) lines.push(`${label}: completat`);
      else if (afterEmpty) lines.push(`${label}: șters`);
      else lines.push(`${label}: schimbat`);
      continue;
    }
    if (beforeEmpty) lines.push(`${label}: ${formatFieldValue(key, after)} (era necompletat)`);
    else if (afterEmpty) lines.push(`${label}: șters (era ${formatFieldValue(key, before)})`);
    else lines.push(`${label}: ${formatFieldValue(key, before)} → ${formatFieldValue(key, after)}`);
  }
  return lines;
}

// ─── Verificarea actului față de cerere (JSON în `detail`) ────────────────────

interface ReconcileCheck {
  field: string;
  expected: unknown;
  found: unknown;
  matches: boolean | null;
}

const CHECK_NAMES: Record<string, string> = {
  "sumă": "suma",
  "valută": "valuta",
  "beneficiar": "beneficiarul",
  "IDNO/IDNP": "IDNO/IDNP-ul",
  IBAN: "IBAN-ul",
  "bancă": "banca",
};

function checkValue(field: string, value: unknown, currency: string): string {
  if (value === null || value === undefined || value === "") return "necompletat";
  if (field === "sumă" && typeof value === "number") return formatCurrency(value, currency);
  return String(value);
}

function humanizeReconciliation(detail: Record<string, unknown>): string[] {
  const fileName = typeof detail.fileName === "string" ? detail.fileName : null;
  const checks = Array.isArray(detail.checks) ? (detail.checks as ReconcileCheck[]) : [];
  const currencyCheck = checks.find((c) => c.field === "valută");
  const currency =
    typeof currencyCheck?.expected === "string" ? currencyCheck.expected : "MDL";

  const lines: string[] = [
    fileName
      ? `Am comparat actul „${fileName}" cu datele din cerere.`
      : "Am comparat actul încărcat cu datele din cerere.",
  ];

  const name = (f: string) => CHECK_NAMES[f] ?? f;
  const ok = checks.filter((c) => c.matches === true).map((c) => name(c.field));
  const bad = checks.filter((c) => c.matches === false);
  const unknown = checks.filter((c) => c.matches === null || c.matches === undefined);

  if (bad.length) {
    lines.push(
      `Nu coincid: ${bad
        .map(
          (c) =>
            `${name(c.field)} (în act ${checkValue(c.field, c.found, currency)}, în cerere ${checkValue(c.field, c.expected, currency)})`,
        )
        .join("; ")}.`,
    );
  }
  if (ok.length) lines.push(`Coincid: ${ok.join(", ")}.`);
  if (unknown.length) {
    lines.push(`Nu s-au putut verifica: ${unknown.map((c) => name(c.field)).join(", ")}.`);
  }
  return lines;
}

// ─── Detaliile scrise de server, traduse ─────────────────────────────────────

function cleanup(text: string): string {
  return text
    .replace(/\bBody hash:.*$/i, "")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s;,]+$/g, "")
    .trim();
}

function money(cents: string | number, currency = "MDL"): string {
  const n = typeof cents === "number" ? cents : Number(cents);
  return Number.isFinite(n) ? formatCurrency(n, currency) : String(cents);
}

const RULES: Array<[RegExp, (m: RegExpMatchArray) => string | null]> = [
  [/^(?:PAR\s+)?(\S+)\s+created as draft/i, (m) => `Cererea ${m[1]} a fost creată ca ciornă.`],
  [/^Duplicated from (\S+)/i, (m) => `Copiată după cererea ${m[1]}.`],
  [/^Instantiated from template "(.+?)"/i, (m) => `Creată din șablonul „${m[1]}".`],
  [
    /^(?:PAR\s+)?\S+\s+submitted;\s*(\d+)\s*approval step/i,
    (m) =>
      `Trimisă spre aprobare, cu ${m[1]} ${m[1] === "1" ? "pas de semnat" : "pași de semnat"}.`,
  ],
  [
    /^Step (\d+) \((.+?)\) approved(.*)$/i,
    (m) => {
      const deleg = m[3]?.match(/prin delegare de la (.+?)\s*$/i);
      return `A semnat pasul ${m[1]} — ${m[2]}.${deleg ? ` Prin delegare de la ${deleg[1]}.` : ""}`;
    },
  ],
  [
    /^Step (\d+) unlocked for (\d+) approver/i,
    (m) =>
      `S-a deschis pasul ${m[1]} pentru ${m[2]} ${m[2] === "1" ? "aprobator" : "aprobatori"}.`,
  ],
  [/^Step (\d+) rejected\. Comment: ([\s\S]*)$/i, (m) => `Respinsă la pasul ${m[1]}. Motiv: ${m[2]}`],
  [
    /^Step (\d+) requested changes\. Comment: ([\s\S]*)$/i,
    (m) => `S-au cerut modificări la pasul ${m[1]}. Motiv: ${m[2]}`,
  ],
  [
    /^Final approval blocked: PAR total (\d+) MDL cents exceeds approver limit (\d+) cents/i,
    (m) =>
      `Aprobarea finală s-a oprit: suma ${money(m[1])} trece peste limita aprobatorului (${money(m[2])}).`,
  ],
  [
    /^Overage re-approved/i,
    () => "Depășirea de sumă a fost reaprobată; cererea s-a întors la finanțe.",
  ],
  [/^Received by user .*assigned to/i, () => "Cererea a intrat la finanțe și a fost dată în lucru."],
  [
    /^Actual amount: (\d+) cents\.\s*Ref: (.*)$/i,
    (m) => {
      const ref = m[2].trim();
      return `Plătit ${money(m[1])}${ref && ref !== "-" ? ` · document de plată ${ref}` : ""}.`;
    },
  ],
  [
    /^Actual (\d+) exceeds estimated (\d+) by >10%/i,
    (m) =>
      `Suma plătită (${money(m[1])}) trece cu peste 10% peste estimarea din cerere (${money(m[2])}) — e nevoie de reaprobare.`,
  ],
  [
    /^All approval steps complete/i,
    () => "Toți aprobatorii au semnat; cererea a mers la finanțe.",
  ],
  [/^Hash mismatch/i, () => "Datele cererii nu mai sunt cele semnate la aprobare."],
  [
    /^Plătitor legat de registrul de prestatori \(existent\)/i,
    () => "Beneficiarul era deja în registrul de prestatori.",
  ],
  [
    /^Plătitor salvat automat în registrul de prestatori/i,
    () => "Beneficiarul a fost salvat în registrul de prestatori.",
  ],
  [
    /^(?:PAR\s+)?\S+\s+reopened from/i,
    () => "Cererea a fost redeschisă ca ciornă, ca să poată fi corectată.",
  ],
  [
    /^(?:PAR\s+)?\S+\s+retras din aprobare[^—]*(—\s*(\d+) decizie)?/i,
    (m) =>
      `Retrasă din aprobare pentru corectare.${m[2] ? ` S-au anulat ${m[2]} ${m[2] === "1" ? "semnătură dată" : "semnături date"} deja.` : ""}`,
  ],
  [
    /^Comandă emisă: (\S+) către (.+?) \(([\d.]+) (\w+)\)/i,
    (m) => `Comanda ${m[1]} către ${m[2]}, ${m[3]} ${m[4]}.`,
  ],
  [
    /^Recepție (completă|parțială) înregistrată \((\d+) linii\)/i,
    (m) => `Recepție ${m[1]} pentru ${m[2]} ${m[2] === "1" ? "poziție" : "poziții"}.`,
  ],
  [
    /^Ofertă selectată: (.+?) \(([\d.]+) (\w+)\)\. Motiv: ([\s\S]*)$/i,
    (m) => `Aleasă oferta de la ${m[1]}, ${m[2]} ${m[3]}. Motiv: ${m[4]}`,
  ],
];

/**
 * Traduce `detail` în propoziții. Dacă evenimentul are deja un `diff` afișat,
 * rândul „Updated fields: …" nu mai aduce nimic — îl lăsăm deoparte.
 */
export function humanizeDetail(
  event: string,
  detail: string | null | undefined,
  opts: { hasDiff?: boolean } = {},
): string[] {
  if (!detail) return [];
  const trimmed = detail.trim();

  // Unele evenimente scriu JSON în `detail`. Nimeni nu citește JSON pe ecran.
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      if (Array.isArray(parsed.checks)) return humanizeReconciliation(parsed);
      // JSON necunoscut: scoatem doar perechile lizibile, fără acolade și ghilimele.
      return Object.entries(parsed)
        .filter(([, v]) => v !== null && typeof v !== "object")
        .slice(0, 4)
        .map(([k, v]) => `${fieldLabel(k)}: ${formatFieldValue(k, v)}`);
    } catch {
      return [];
    }
  }

  const updated = trimmed.match(/^Updated fields:\s*(.*)$/i);
  if (updated) {
    if (opts.hasDiff) return [];
    const raw = updated[1].trim();
    if (!raw || raw.startsWith("(")) return ["Nu s-a schimbat nimic."];
    const names = raw
      .split(",")
      .map((f) => fieldLabel(f.trim()).toLowerCase())
      .filter(Boolean);
    return [`A schimbat: ${names.join(", ")}.`];
  }

  for (const [re, render] of RULES) {
    const m = trimmed.match(re);
    if (m) {
      const out = render(m);
      return out ? [cleanup(out)] : [];
    }
  }

  const cleaned = cleanup(trimmed);
  return cleaned ? [cleaned] : [];
}

/** Un rând de jurnal, gata de afișat. */
export function humanizeEvent(ev: {
  event: string;
  detail: string | null;
  diff: string | null;
}): HumanTimelineEvent {
  const diffLines = humanizeDiff(ev.diff);
  return {
    icon: eventIcon(ev.event),
    title: eventTitle(ev.event),
    lines: [...humanizeDetail(ev.event, ev.detail, { hasDiff: diffLines.length > 0 }), ...diffLines],
  };
}
