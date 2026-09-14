// Detectarea și unificarea duplicatelor — PORTAT din crm-vector
// (`src/lib/crm/duplicates.ts`), partea PURĂ. Stratul de date e separat, în
// `server/routes/crmCompanies.ts`, fiindcă acolo trebuie filtrat pe workspace.
//
// De ce contează fiecare regulă de mai jos: o unificare greșită e IREVERSIBILĂ
// și amestecă istoricul a doi oameni fără legătură. Capcanele pe care sursa
// le-a rezolvat deja și pe care le păstrăm:
//   · două fișe goale (fără telefon, fără email) NU sunt „egale" — altfel
//     orice două lead-uri incomplete ar fi unite;
//   · numele firmei singur e un semnal SLAB — doi oameni de la aceeași firmă,
//     cu același număr de centrală, nu sunt aceeași persoană;
//   · codul fiscal, când există, e decisiv;
//   · `planMerge` e pur și inspectabil, ca interfața să poată arăta EXACT ce se
//     va întâmpla înainte ca omul să confirme.

/** Numele normalizat pentru comparații: fără diacritice, spații colapsate, lowercase. */
function normalizeNameLocal(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Lead-ul, redus la ce folosește dedup-ul. */
export interface LeadRecord {
  id: string;
  fullName: string;
  phone?: string | null;
  phoneNormalized?: string | null;
  email?: string | null;
  emailNormalized?: string | null;
  company?: string | null;
  companyId?: string | null;
  dealName?: string | null;
  interestCourse?: string | null;
  stage?: string;
  valueCents?: number;
  debtCents?: number;
  assignedTo?: string | null;
  lostReason?: string | null;
  notes?: string | null;
  createdAt?: string;
  archivedAt?: string | null;
}

export interface LeadContact {
  id: string;
  leadId: string;
  fullName: string;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary?: number;
}

import { normalizeEmail, normalizePhone } from "./normalize";


// Supabase e tipizat din `src/integrations/supabase/types.ts`, care e STALE
// față de schema reală (nu știe încă de `companies`, `leads.companyId`,
// `lead_contacts.phoneNormalized/emailNormalized` — vezi migrarea
// 20260913104000). Nu avem voie să atingem acel fișier generat în acest
// modul, deci tratăm clientul ca `any` aici, la fel cum face deja
// `src/pages/B2B.tsx` pentru `b2b_sales`. Vezi INTEGRARE NECESARĂ în raportul
// final pentru patch-ul manual recomandat pe types.ts.



// ─────────────────────────────────────────────────────────────────────────────
// Potrivire (matching) — generic peste firme, lead-uri și contacte
// ─────────────────────────────────────────────────────────────────────────────

/** Forma minimă comparabilă — un lead (name=fullName), o firmă (name=name),
 *  sau o persoană de contact (name=fullName, companyName=firma ei). */
export interface DedupRecord {
  /** Numele entității în sine: persoana (lead/contact) sau firma (company). */
  name?: string | null;
  /** Numele firmei asociate — semnal SLAB, folosit doar ca indiciu suplimentar
   *  pentru lead-uri/contacte (nu decide singur un duplicat: vezi WEIGHTS). */
  companyName?: string | null;
  phone?: string | null;
  email?: string | null;
  /** IDNO (cod fiscal) — decisiv dacă egal pe ambele părți; doar la firme. */
  idno?: string | null;
}

export interface DuplicateKey {
  phone: string | null;
  email: string | null;
  name: string | null;
  companyName: string | null;
  idno: string | null;
}

function normalizeIdno(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const clean = raw.trim().toUpperCase();
  return clean.length > 0 ? clean : null;
}

/** `duplicateKey(record)` → cheile normalizate pe care se face potrivirea.
 *  Null/gol rămâne null (niciodată nu devine "egal cu null" în scoreMatch). */
export function duplicateKey(record: DedupRecord): DuplicateKey {
  return {
    phone: normalizePhone(record.phone ?? null),
    email: normalizeEmail(record.email ?? null),
    name: normalizeNameLocal(record.name ?? null),
    companyName: normalizeNameLocal(record.companyName ?? null),
    idno: normalizeIdno(record.idno ?? null),
  };
}

/**
 * Ponderile scorului de potrivire (0..100), documentate explicit:
 *  - `idno` egal pe ambele părți → DECISIV, scor 100 imediat (e aceeași firmă,
 *    cod fiscal nu minte).
 *  - `phone` exact normalizat → semnal PUTERNIC (45p), dar NU decisiv singur —
 *    un centralist de firmă poate fi partajat de doi oameni diferiți.
 *  - `email` exact normalizat → semnal PUTERNIC (40p), la fel, neconcludent
 *    singur (poate fi o adresă generică gen office@).
 *  - `name` (persoană sau firmă) exact normalizat → semnal mediu (25p).
 *  - `companyName` (numele firmei, folosit ca indiciu pe lead-uri/contacte)
 *    egal SINGUR → semnal SLAB (10p) — insuficient pentru duplicat.
 * Pragul implicit (`DUPLICATE_THRESHOLD`=60) e calibrat ca:
 *   telefon+nume (45+25=70) sau email+nume (40+25=65) → duplicat;
 *   telefon+firmă, fără nume egal (45+10=55, cazul centralistului) → NU e
 *   duplicat.
 */
export const WEIGHTS = {
  idno: 100,
  phone: 45,
  email: 40,
  name: 25,
  companyName: 10,
} as const;

export const DUPLICATE_THRESHOLD = 60;

/** `scoreMatch(a, b)` → 0..100. Un câmp gol/nul pe oricare parte nu contribuie
 *  NICIODATĂ (gol nu e niciodată tratat ca "egal cu gol"). */
export function scoreMatch(a: DedupRecord, b: DedupRecord): number {
  const ka = duplicateKey(a);
  const kb = duplicateKey(b);

  if (ka.idno && kb.idno && ka.idno === kb.idno) return 100;

  let score = 0;
  if (ka.phone && kb.phone && ka.phone === kb.phone) score += WEIGHTS.phone;
  if (ka.email && kb.email && ka.email === kb.email) score += WEIGHTS.email;
  if (ka.name && kb.name && ka.name === kb.name) score += WEIGHTS.name;
  if (ka.companyName && kb.companyName && ka.companyName === kb.companyName) score += WEIGHTS.companyName;
  return Math.min(score, 100);
}

/** Motivele (câmpurile) care au contribuit la scor — pt afișarea „de ce"
 *  în UI-ul de duplicate (`LeadsDuplicates.tsx`). Text în română. */
export function matchReasons(a: DedupRecord, b: DedupRecord): string[] {
  const ka = duplicateKey(a);
  const kb = duplicateKey(b);
  const reasons: string[] = [];
  if (ka.idno && kb.idno && ka.idno === kb.idno) reasons.push("IDNO identic");
  if (ka.phone && kb.phone && ka.phone === kb.phone) reasons.push("Telefon identic");
  if (ka.email && kb.email && ka.email === kb.email) reasons.push("Email identic");
  if (ka.name && kb.name && ka.name === kb.name) reasons.push("Nume identic");
  if (ka.companyName && kb.companyName && ka.companyName === kb.companyName) reasons.push("Companie identică");
  return reasons;
}

export interface DuplicateCluster<T> {
  records: T[];
  /** Cel mai mare scor pereche găsit în interiorul clusterului. */
  score: number;
  reasons: string[];
}

/**
 * `groupDuplicates(records, threshold)` → clustere de potențiale duplicate.
 *
 * Nu comparăm toate perechile posibile (O(n²), prohibitiv la 3200+ lead-uri) —
 * grupăm întâi indicii pe fiecare cheie puternică (idno/telefon/email/nume) și
 * comparăm doar perechile care ajung în aceeași găleată, apoi unificăm
 * (union-find) perechile al căror scor trece pragul. Rezultat: aproape liniar
 * în practică, exact în rezultat (nicio pereche cu vreo cheie comună nu e
 * omisă).
 */
export function groupDuplicates<T extends DedupRecord & { id: string }>(
  records: T[],
  threshold: number = DUPLICATE_THRESHOLD
): DuplicateCluster<T>[] {
  const n = records.length;
  if (n < 2) return [];

  const keys = records.map(duplicateKey);
  const parent = records.map((_, i) => i);
  function find(i: number): number {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(i: number, j: number) {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }

  const buckets = new Map<string, number[]>();
  const addToBucket = (key: string | null, prefix: string, idx: number) => {
    if (!key) return;
    const bk = `${prefix}:${key}`;
    const arr = buckets.get(bk);
    if (arr) arr.push(idx);
    else buckets.set(bk, [idx]);
  };
  keys.forEach((k, i) => {
    addToBucket(k.idno, "idno", i);
    addToBucket(k.phone, "phone", i);
    addToBucket(k.email, "email", i);
    addToBucket(k.name, "name", i);
  });

  const seenPairs = new Set<string>();
  const pairInfo = new Map<string, { score: number; reasons: string[] }>();
  for (const idxs of buckets.values()) {
    if (idxs.length < 2) continue;
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const i = idxs[a];
        const j = idxs[b];
        const pairKey = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const score = scoreMatch(records[i], records[j]);
        if (score >= threshold) {
          union(i, j);
          pairInfo.set(pairKey, { score, reasons: matchReasons(records[i], records[j]) });
        }
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = groups.get(root);
    if (arr) arr.push(i);
    else groups.set(root, [i]);
  }

  const clusters: DuplicateCluster<T>[] = [];
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    let bestScore = 0;
    let bestReasons: string[] = [];
    for (let a = 0; a < idxs.length; a++) {
      for (let b = a + 1; b < idxs.length; b++) {
        const i = idxs[a];
        const j = idxs[b];
        const pairKey = i < j ? `${i}-${j}` : `${j}-${i}`;
        const found = pairInfo.get(pairKey);
        const s = found ? found.score : scoreMatch(records[i], records[j]);
        if (s > bestScore) {
          bestScore = s;
          bestReasons = found ? found.reasons : matchReasons(records[i], records[j]);
        }
      }
    }
    clusters.push({ records: idxs.map((i) => records[i]), score: bestScore, reasons: bestReasons });
  }
  clusters.sort((a, b) => b.score - a.score);
  return clusters;
}

// ─────────────────────────────────────────────────────────────────────────────
// Adaptoare — Lead / LeadContact / Company → DedupRecord
// ─────────────────────────────────────────────────────────────────────────────

export interface LeadDedupRecord extends DedupRecord {
  id: string;
  lead: LeadRecord;
}

/** Un lead ca subiect de dedup: numele persoanei + firma ca indiciu slab. */
export function leadToDedupRecord(lead: LeadRecord): LeadDedupRecord {
  return {
    id: lead.id,
    lead,
    name: lead.fullName,
    companyName: lead.company,
    phone: lead.phone,
    email: lead.email,
  };
}

export interface ContactDedupRecord extends DedupRecord {
  id: string;
  contact: LeadContact;
}

/** O persoană de contact B2B ca subiect de dedup; `companyText` = firma
 *  lead-ului părinte (dacă e cunoscută), folosită tot ca indiciu slab. */
export function contactToDedupRecord(contact: LeadContact, companyText?: string | null): ContactDedupRecord {
  return {
    id: contact.id,
    contact,
    name: contact.fullName,
    companyName: companyText ?? null,
    phone: contact.phone,
    email: contact.email,
  };
}

export interface CompanyRecord {
  id: string;
  name: string;
  idno?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface CompanyDedupRecord extends DedupRecord {
  id: string;
  company: CompanyRecord;
}

/** O firmă ca subiect de dedup — aici `name` E identitatea firmei (nu o
 *  persoană), deci contează cu ponderea `name` (25p), nu cu `companyName`
 *  (10p, rezervată exclusiv indiciilor slabe de pe lead-uri/contacte). */
export function companyToDedupRecord(company: CompanyRecord): CompanyDedupRecord {
  return {
    id: company.id,
    company,
    name: company.name,
    phone: company.phone,
    email: company.email,
    idno: company.idno,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Planul de fuzionare (planMerge) — PUR, inspectabil înainte de orice scriere
// ─────────────────────────────────────────────────────────────────────────────

/** Câmpurile "informative" pe care fuzionarea le poate completa de pe un
 *  duplicat DOAR dacă lead-ul principal le are goale — niciodată nu
 *  suprascrie o valoare deja existentă pe principal. Nu includem `stage`,
 *  `source`, `archivedAt` etc. — stare de pipeline, nu se moștenește orbește. */
export const MERGEABLE_LEAD_FIELDS: (keyof LeadRecord)[] = [
  "fullName",
  "phone",
  "email",
  "company",
  "companyId",
  "dealName",
  "interestCourse",
  "notes",
  // Notă de portare: câmpurile de segmentare din crm-vector (industrie, regiune,
  // mărime, consum, next action, termen estimat, probabilitate) NU există în
  // tabela `leads` de aici. Nu le punem în listă doar ca să pară complet — se
  // adaugă abia când coloanele există.
  "assignedTo",
  "lostReason",
];

/** Tabelele-copil re-parentate la fuzionare (re-verificate contra migrărilor —
 *  vezi raportul final pentru lista completă + ce am lăsat deliberat în afară:
 *  `automation_runs`/`cx_*`/`course_edition_participants` sunt log istoric cu
 *  `ON DELETE SET NULL`, nu au nevoie să „urmeze" lead-ul fuzionat). */
export const REPARENT_TABLES = [
  "lead_interactions",
  "lead_tasks",
  "lead_attachments",
  "lead_contacts",
  "lead_cadence_enrollments",
  "lead_products",
] as const;
export type ReparentTable = (typeof REPARENT_TABLES)[number];

export interface FieldDecision {
  field: keyof LeadRecord;
  keep: "primary" | "duplicate";
  value: unknown;
  /** Lead-ul din care provine valoarea păstrată (principalul sau un duplicat). */
  fromLeadId: string;
}

export interface TagDecision {
  leadId: string;
  tag: string;
}

export interface FieldValueDecision {
  leadId: string;
  fieldId: string;
}

export interface ReparentSummary {
  table: ReparentTable;
  leadId: string;
  count: number;
}

export interface MergePlan {
  primaryId: string;
  duplicateIds: string[];
  /** Per câmp: ce valoare supraviețuiește și de unde vine. */
  fields: FieldDecision[];
  /** `valueCents` însumat pe principal + toate duplicatele. */
  valueCentsTotal: number;
  /** `debtCents` însumat, la fel. */
  debtCentsTotal: number;
  /** Câte rânduri copil (per tabel, per duplicat) urmează să fie re-parentate —
   *  informativ, populat doar dacă apelantul a furnizat `childCounts`. */
  reparented: ReparentSummary[];
  /** Tag-uri de pe duplicate care VOR fi mutate pe principal (nu există deja acolo). */
  keptTags: TagDecision[];
  /** Tag-uri de pe duplicate care NU sunt mutate — principalul (sau alt
   *  duplicat procesat înaintea lor) are deja acel tag; rândul rămâne pe
   *  duplicatul arhivat (nu se șterge nimic, doar nu se re-inserează). */
  droppedTags: TagDecision[];
  /** La fel, pentru `lead_field_values` (unic pe leadId+field_id). */
  keptFieldValues: FieldValueDecision[];
  droppedFieldValues: FieldValueDecision[];
}

export interface MergeContext {
  /** Tag-urile deja prezente pe principal. */
  primaryTags?: string[];
  /** Tag-urile fiecărui duplicat, cheie = lead id. */
  duplicateTags?: Record<string, string[]>;
  /** field_id-urile deja setate pe principal (`lead_field_values`). */
  primaryFieldIds?: string[];
  /** field_id-urile setate pe fiecare duplicat, cheie = lead id. */
  duplicateFieldIds?: Record<string, string[]>;
  /** Câte rânduri copil are fiecare duplicat, per tabel — doar pt. raportare
   *  în plan (UI-ul de preview le poate arăta operatorului). */
  childCounts?: Record<string, Partial<Record<ReparentTable, number>>>;
}

function isEmptyValue(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

/**
 * `planMerge(primary, duplicates, context?)` → planul PUR de fuzionare, complet
 * inspectabil ÎNAINTE de orice scriere (`mergeLeads` doar EXECUTĂ acest plan).
 *
 * Regula per câmp: valoarea principalului supraviețuiește dacă nu e goală;
 * altfel se ia prima valoare ne-goală găsită printre duplicate (în ordinea
 * dată). `valueCents`/`debtCents` nu se "păstrează" — se ÎNSUMEAZĂ, fiindcă
 * reprezintă bani pe oportunități distincte care acum devin una singură.
 */
export function planMerge(
  primary: LeadRecord,
  duplicates: LeadRecord[],
  context: MergeContext = {}
): MergePlan {
  const fields: FieldDecision[] = [];
  for (const field of MERGEABLE_LEAD_FIELDS) {
    const primaryValue = (primary as unknown as Record<string, unknown>)[field as string];
    if (!isEmptyValue(primaryValue)) {
      fields.push({ field, keep: "primary", value: primaryValue, fromLeadId: primary.id });
      continue;
    }
    const donor = duplicates.find((d) => !isEmptyValue((d as unknown as Record<string, unknown>)[field as string]));
    if (donor) {
      fields.push({
        field,
        keep: "duplicate",
        value: (donor as unknown as Record<string, unknown>)[field as string],
        fromLeadId: donor.id,
      });
    } else {
      fields.push({ field, keep: "primary", value: primaryValue, fromLeadId: primary.id });
    }
  }

  const valueCentsTotal =
    (primary.valueCents ?? 0) + duplicates.reduce((sum, d) => sum + (d.valueCents ?? 0), 0);
  const debtCentsTotal =
    (primary.debtCents ?? 0) + duplicates.reduce((sum, d) => sum + (d.debtCents ?? 0), 0);

  const claimedTags = new Set(context.primaryTags ?? []);
  const keptTags: TagDecision[] = [];
  const droppedTags: TagDecision[] = [];
  for (const dup of duplicates) {
    const tags = context.duplicateTags?.[dup.id] ?? [];
    for (const tag of tags) {
      if (claimedTags.has(tag)) droppedTags.push({ leadId: dup.id, tag });
      else {
        claimedTags.add(tag);
        keptTags.push({ leadId: dup.id, tag });
      }
    }
  }

  const claimedFieldIds = new Set(context.primaryFieldIds ?? []);
  const keptFieldValues: FieldValueDecision[] = [];
  const droppedFieldValues: FieldValueDecision[] = [];
  for (const dup of duplicates) {
    const fieldIds = context.duplicateFieldIds?.[dup.id] ?? [];
    for (const fieldId of fieldIds) {
      if (claimedFieldIds.has(fieldId)) droppedFieldValues.push({ leadId: dup.id, fieldId });
      else {
        claimedFieldIds.add(fieldId);
        keptFieldValues.push({ leadId: dup.id, fieldId });
      }
    }
  }

  const reparented: ReparentSummary[] = [];
  for (const dup of duplicates) {
    const counts = context.childCounts?.[dup.id] ?? {};
    for (const table of REPARENT_TABLES) {
      const count = counts[table];
      if (count) reparented.push({ table, leadId: dup.id, count });
    }
  }

  return {
    primaryId: primary.id,
    duplicateIds: duplicates.map((d) => d.id),
    fields,
    valueCentsTotal,
    debtCentsTotal,
    reparented,
    keptTags,
    droppedTags,
    keptFieldValues,
    droppedFieldValues,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Descoperire duplicate (data layer) — leads / contacte
// ─────────────────────────────────────────────────────────────────────────────

/** Coloane minime necesare pentru dedup — nu tragem `SELECT *` pe 3200 rânduri. */
const LEAD_DEDUP_COLS =
  "id,fullName,phone,phoneNormalized,email,emailNormalized,company,companyId,valueCents,debtCents,archivedAt,createdAt";
