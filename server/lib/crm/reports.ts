// Rapoarte de vânzări — per agent și pe echipă.
//
// PORTAT din crm-vector (`src/lib/crm/reports.ts`). Ce s-a schimbat față de
// sursă și DE CE:
//   · sursa rula în browser peste Supabase, single-tenant; aici rulează pe
//     server, iar apelantul (server/routes/crmReports.ts) filtrează TOT pe
//     `tenant_id` înainte să ajungă un rând aici;
//   · câmpurile sunt camelCase (Drizzle), nu snake_case (PostgREST);
//   · stratul de I/O a rămas afară — funcțiile de aici sunt pure, exact ca în
//     sursă, ca să fie testabile fără bază de date.
//
// Ce NU s-a schimbat, fiindcă sursa avea dreptate:
//   · won/lost se derivă STRICT din flagurile `isWon`/`isLost` ale etapei,
//     niciodată dintr-o cheie hardcodată — etapele sunt redenumibile per
//     workspace, iar un raport care caută literalul „paid" se rupe în tăcere;
//   · „contracte semnate" / „valoare vânzări" se bazează pe PRIMA tranziție
//     reală către o etapă câștigată, nu pe starea curentă a lead-ului.

/** Lead-ul, redus la ce folosesc rapoartele. */
export interface ReportLead {
  id: string;
  stage: string;
  assignedTo: string | null;
  valueCents: number;
  createdAt: string;
  lostReason: string | null;
  interestCourse: string | null;
  productId?: string | null;
}

/** Task, redus. */
export interface ReportTask {
  id: string;
  leadId: string;
  assignedTo: string | null;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
}

/** Etapa pâlniei, redusă. */
export interface ReportStage {
  key: string;
  label: string;
  orderIndex: number;
  isWon: boolean;
  isLost: boolean;
}

/** O tranziție între etape, extrasă din interacțiunile `stage_change`. */
export interface StageChange {
  from: string | null;
  to: string | null;
  leadId?: string;
  occurredAt?: string;
}

/** Intervalul de raportare, semi-deschis: [from, to). */
export interface DateRange {
  from: string | null;
  to: string | null;
}

// ─── Interacțiune redusă, pentru rapoarte (doar ce contează pentru KPI) ─────

export interface ReportInteraction {
  leadId: string;
  type: "call" | "meeting";
  occurredAt: string;
  /** metadata.outcome pentru apeluri: answered / no_answer / scheduled. */
  outcome: string | null;
}

// ─── Helperi comuni ──────────────────────────────────────────────────────────

const wonKeySet = (stages: ReportStage[]) => new Set(stages.filter((s) => s.isWon).map((s) => s.key));
const lostKeySet = (stages: ReportStage[]) => new Set(stages.filter((s) => s.isLost).map((s) => s.key));

/**
 * Etapele „de ofertă" — schema n-are un flag `is_offer` dedicat (doar
 * isWon/isLost), deci le identificăm după LABEL ("ofertă"/"oferta", fără
 * diacritice contează), nu după o cheie fixă — funcționează pe orice pipeline
 * configurat cu o etapă numită așa. Dacă pipeline-ul nu are așa ceva, setul e
 * gol și indicatorul „oferte trimise" e 0 — nu o eroare, nu o presupunere.
 */
function offerKeySet(stages: ReportStage[]): Set<string> {
  const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return new Set(stages.filter((s) => norm(s.label).includes("ofert")).map((s) => s.key));
}

/** Exportat pentru hook-ul de UI (useReports) — filtrarea pe perioadă a
 *  lead-urilor înainte de rapoartele care nu iau `range` ca parametru propriu
 *  (perProductBreakdown, lostReasonBreakdown) trebuie să folosească EXACT
 *  aceeași regulă [from, to) ca `salesKpis`, nu o reimplementare separată. */
export function inRange(iso: string | null | undefined, range: DateRange): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (range.from && t < new Date(range.from).getTime()) return false;
  if (range.to && t >= new Date(range.to).getTime()) return false;
  return true;
}

// ─── cerința 51 — indicatorii minimi per agent / echipă ─────────────────────

export interface SalesKpis {
  leadsAllocated: number;
  callsMade: number;
  successfulContacts: number;
  meetings: number;
  offersSent: number;
  contractsSigned: number;
  salesValueCents: number;
  /** cerința 56 — task-uri finalizate ÎN perioadă (completedAt în range). */
  tasksDone: number;
  /** cerința 56 — task-uri deschise, restante ACUM (independent de perioada
   *  aleasă — „restant” e o stare curentă, nu ceva care se termină la o dată). */
  tasksOverdue: number;
}

/**
 * Indicatorii cerinței 51, calculați pentru UN agent (`ownerKey`) sau pentru
 * toată echipa (`ownerKey` absent — nu se filtrează deloc).
 *
 * „Contracte semnate" / „valoare vânzări" se bazează pe PRIMA tranziție reală
 * către o etapă câștigată (stage_changes), petrecută în interiorul perioadei —
 * nu pe un instantaneu al stării curente a lead-ului. Lead-urile importate în
 * bloc (Kommo), fără NICIO tranziție înregistrată, nu pot fi atribuite unei
 * perioade anume (nu știm CÂND au fost câștigate) — nu intră în raportul pe
 * perioadă. Asta e intenționat: altfel ar umfla artificial oricare zi/săptămână
 * în care se întâmplă să rulezi raportul. Ele rămân vizibile în „Tot timpul”
 * (analytics.ts, care lucrează pe instantaneul curent).
 */
export function salesKpis(
  leads: ReportLead[],
  interactions: ReportInteraction[],
  tasks: ReportTask[],
  stageChanges: StageChange[],
  stages: ReportStage[],
  range: DateRange,
  ownerKey?: string,
  now: Date = new Date()
): SalesKpis {
  const owned = (assignedTo: string | null | undefined) => !ownerKey || assignedTo === ownerKey;
  const ownerOfLead = new Map(leads.map((l) => [l.id, l.assignedTo]));
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const won = wonKeySet(stages);
  const offer = offerKeySet(stages);

  let leadsAllocated = 0;
  for (const l of leads) {
    if (owned(l.assignedTo) && inRange(l.createdAt, range)) leadsAllocated++;
  }

  let callsMade = 0;
  let successfulContacts = 0;
  let meetings = 0;
  for (const i of interactions) {
    if (!inRange(i.occurredAt, range)) continue;
    if (!owned(ownerOfLead.get(i.leadId))) continue;
    if (i.type === "call") {
      callsMade++;
      if (i.outcome === "answered") successfulContacts++;
    } else if (i.type === "meeting") {
      meetings++;
    }
  }

  const offerLeadsSeen = new Set<string>();
  const wonLeadsSeen = new Set<string>();
  let salesValueCents = 0;
  for (const ch of stageChanges) {
    if (!ch.leadId || !inRange(ch.occurredAt, range)) continue;
    if (!owned(ownerOfLead.get(ch.leadId))) continue;
    if (ch.to && offer.has(ch.to)) offerLeadsSeen.add(ch.leadId);
    if (ch.to && won.has(ch.to) && !wonLeadsSeen.has(ch.leadId)) {
      wonLeadsSeen.add(ch.leadId);
      salesValueCents += leadById.get(ch.leadId)?.valueCents ?? 0;
    }
  }

  let tasksDone = 0;
  let tasksOverdue = 0;
  for (const t of tasks) {
    const owner = t.assignedTo ?? ownerOfLead.get(t.leadId) ?? null;
    if (!owned(owner)) continue;
    if (t.status === "done") {
      if (inRange(t.completedAt, range)) tasksDone++;
    } else if (t.status === "open" && t.dueAt && new Date(t.dueAt) < now) {
      tasksOverdue++;
    }
  }

  return {
    leadsAllocated,
    callsMade,
    successfulContacts,
    meetings,
    offersSent: offerLeadsSeen.size,
    contractsSigned: wonLeadsSeen.size,
    salesValueCents,
    tasksDone,
    tasksOverdue,
  };
}

// ─── cerința 52 — conversie reală etapă-cu-etapă ────────────────────────────

export interface StageConversionRow {
  fromKey: string;
  fromLabel: string;
  toKey: string;
  toLabel: string;
  /** Câte lead-uri distincte au avut vreodată o tranziție cu `to = fromKey`. */
  reached: number;
  /** Dintre acelea, câte au avut ulterior și o tranziție cu `to = toKey`. */
  advanced: number;
  conversionPct: number;
}

/**
 * Conversie REALĂ etapă-cu-etapă din tranzițiile efectiv înregistrate
 * (lead_interactions type=stage_change) — spre deosebire de
 * `computeAnalytics().funnel`, care e un instantaneu al distribuției curente,
 * nu o conversie istorică.
 *
 * Pentru fiecare pereche de etape consecutive (ordonate după orderIndex,
 * fără etapele isLost): „reached” = câte lead-uri distincte au ajuns vreodată
 * la `fromKey`; „advanced” = dintre acelea, câte au ajuns și la `toKey`
 * (indiferent de ordinea temporală exactă — o etapă „atinsă vreodată” contează,
 * chiar dacă lead-ul a mai regresat între timp).
 *
 * Lead-urile importate în bloc, FĂRĂ nicio tranziție înregistrată (inserate
 * direct în etapa finală), nu apar deloc în acest calcul — nu au un „moment de
 * intrare” în nicio etapă, deci nu pot fi puse nici la numărător, nici la
 * numitor. Este intenționat: altfel fie le ignorăm și subestimăm volumul, fie
 * le atribuim o intrare falsă la data creării și umflăm/dezumflăm rata. Efectul
 * practic: rata calculată aici e corectă pentru mutările făcute din aplicație,
 * dar nu acoperă loturile importate fără istoric.
 */
export function stageConversion(stageChanges: StageChange[], stages: ReportStage[]): StageConversionRow[] {
  const ordered = [...stages].filter((s) => !s.isLost).sort((a, b) => a.orderIndex - b.orderIndex);

  const reachedByLead = new Map<string, Set<string>>();
  for (const ch of stageChanges) {
    if (!ch.leadId || !ch.to) continue;
    const set = reachedByLead.get(ch.leadId) ?? new Set<string>();
    set.add(ch.to);
    reachedByLead.set(ch.leadId, set);
  }

  const rows: StageConversionRow[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const from = ordered[i];
    const to = ordered[i + 1];
    let reached = 0;
    let advanced = 0;
    for (const set of reachedByLead.values()) {
      if (set.has(from.key)) {
        reached++;
        if (set.has(to.key)) advanced++;
      }
    }
    rows.push({
      fromKey: from.key,
      fromLabel: from.label,
      toKey: to.key,
      toLabel: to.label,
      reached,
      advanced,
      conversionPct: reached ? Math.round((advanced / reached) * 100) : 0,
    });
  }
  return rows;
}

// ─── cerința 53 — durata medie a ciclului de vânzare ────────────────────────

/**
 * Durata medie (în zile, cu o zecimală) de la crearea lead-ului până la
 * PRIMA tranziție reală înregistrată către o etapă câștigată.
 *
 * Afacerile ÎNCĂ deschise (nicio tranziție către won) sunt EXCLUSE — dacă le-am
 * include cu „zile până acum”, durata medie ar scădea artificial de fiecare
 * dată când intră un lead nou netratat, ceea ce ar arăta o îmbunătățire falsă.
 * Lead-urile CÂȘTIGATE dar fără nicio tranziție înregistrată (import în bloc,
 * deja în etapa finală la inserare) sunt de asemenea excluse — nu există un
 * moment real de „a intrat în etapa câștigată” pentru ele.
 */
export function averageCycleDays(leads: ReportLead[], stageChanges: StageChange[], stages: ReportStage[]): number {
  const won = wonKeySet(stages);
  const firstWonAt = new Map<string, string>();
  for (const ch of stageChanges) {
    if (!ch.leadId || !ch.to || !ch.occurredAt || !won.has(ch.to)) continue;
    const prev = firstWonAt.get(ch.leadId);
    if (!prev || ch.occurredAt < prev) firstWonAt.set(ch.leadId, ch.occurredAt);
  }

  const leadById = new Map(leads.map((l) => [l.id, l]));
  let totalDays = 0;
  let count = 0;
  for (const [leadId, wonAt] of firstWonAt) {
    const lead = leadById.get(leadId);
    if (!lead?.createdAt) continue;
    const days = (new Date(wonAt).getTime() - new Date(lead.createdAt).getTime()) / 86_400_000;
    if (days >= 0) {
      totalDays += days;
      count++;
    }
  }
  return count ? Math.round((totalDays / count) * 10) / 10 : 0;
}

// ─── cerința 50 — un rând per agent, aceeași funcție ca vederea individuală ──

export interface OwnerRow extends SalesKpis {
  ownerKey: string;
  ownerName: string;
}

/**
 * Un rând per agent din echipă, calculat cu ACEEAȘI `salesKpis` folosită la
 * dashboard-ul individual — tabelul de echipă și dashboard-ul unui agent NU pot
 * diverge, fiindcă rulează exact același cod, doar cu `ownerKey` diferit.
 */
export function perOwnerBreakdown(
  leads: ReportLead[],
  interactions: ReportInteraction[],
  tasks: ReportTask[],
  stageChanges: StageChange[],
  stages: ReportStage[],
  range: DateRange,
  /** Agenții workspace-ului. În sursă era o constantă hardcodată de 3 oameni;
   *  aici lista vine din baza de date, per tenant. */
  owners: ReadonlyArray<{ id: string; name: string }>,
  now: Date = new Date()
): OwnerRow[] {
  return owners.map((o) => ({
    ownerKey: o.id,
    ownerName: o.name,
    ...salesKpis(leads, interactions, tasks, stageChanges, stages, range, o.id, now),
  }));
}

// ─── cerința 54 — rezultate per produs ──────────────────────────────────────

export interface ProductBreakdownRow {
  product: string;
  total: number;
  won: number;
  lost: number;
  valueCents: number;
  /** % din DECISE (won+lost) — deschise nu intră la numitor. */
  winRatePct: number;
}

/**
 * Rezultate per produs (cerința 54). Grupează după `leads.productId`, tradus
 * prin `productNameById` (catalogul e adăugat de o migrare separată — poate
 * lipsi sau fi null pe orice rând existent; NU depindem de el la citire, doar
 * îl folosim dacă e populat) și cade defensiv pe `interestCourse` (text liber,
 * cum funcționează CRM-ul azi) altfel.
 */
export function perProductBreakdown(
  leads: ReportLead[],
  stages: ReportStage[],
  productNameById: Record<string, string> = {}
): ProductBreakdownRow[] {
  const won = wonKeySet(stages);
  const lost = lostKeySet(stages);
  const byProduct = new Map<string, { total: number; won: number; lost: number; valueCents: number }>();

  for (const lead of leads) {
    const key = (lead.productId && productNameById[lead.productId]) || lead.interestCourse?.trim() || "Fără produs";
    const b = byProduct.get(key) ?? { total: 0, won: 0, lost: 0, valueCents: 0 };
    b.total++;
    if (won.has(lead.stage)) {
      b.won++;
      b.valueCents += lead.valueCents ?? 0;
    } else if (lost.has(lead.stage)) {
      b.lost++;
    }
    byProduct.set(key, b);
  }

  return [...byProduct.entries()]
    .map(([product, b]) => ({
      product,
      ...b,
      winRatePct: b.won + b.lost ? Math.round((b.won / (b.won + b.lost)) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

// ─── cerința 55 — motive de pierdere agregate ───────────────────────────────

export interface LostReasonRow {
  /** Cât din leadurile pierdute ale perioadei cad pe acest motiv (întreg, 0-100). */
  reason: string;
  count: number;
  valueCents: number;
  pct: number;
}

/** Motive de pierdere agregate (cerința 55) — leads fără `lostReason` (nesetat
 *  la momentul pierderii) sunt ignorate, nu grupate sub un fals „necunoscut”. */

/**
 * Leadurile care au intrat într-o etapă „pierdut" ÎN perioadă. `null` când nu se cere filtrare
 * (fără interval, sau fără cronologia tranzițiilor) — apelantul folosește atunci toate rândurile.
 */
function lostLeadIdsInRange(
  stageChanges?: StageChange[],
  stages?: ReportStage[],
  range?: DateRange
): Set<string> | null {
  if (!range || (!range.from && !range.to)) return null;
  if (!stageChanges || !stages) return null;
  const lost = lostKeySet(stages);
  const ids = new Set<string>();
  for (const ch of stageChanges) {
    if (!ch.leadId || !ch.to || !lost.has(ch.to)) continue;
    if (!inRange(ch.occurredAt, range)) continue;
    ids.add(ch.leadId);
  }
  return ids;
}

export function lostReasonBreakdown(
  leads: ReportLead[],
  opts: { stageChanges?: StageChange[]; stages?: ReportStage[]; range?: DateRange } = {}
): LostReasonRow[] {
  // Un motiv de pierdere aparține MOMENTULUI în care leadul s-a pierdut, nu zilei în care a fost
  // creat. Fără filtrul ăsta, „luna aceasta" arăta motivele dintotdeauna — raportul spunea în
  // antet o perioadă, iar în tabel alta.
  const lostInRange = lostLeadIdsInRange(opts.stageChanges, opts.stages, opts.range);

  const map = new Map<string, { count: number; valueCents: number }>();
  for (const l of leads) {
    if (!l.lostReason) continue;
    if (lostInRange && !lostInRange.has(l.id)) continue;
    const b = map.get(l.lostReason) ?? { count: 0, valueCents: 0 };
    b.count++;
    b.valueCents += l.valueCents ?? 0;
    map.set(l.lostReason, b);
  }
  // Procentul e din leadurile PIERDUTE ale perioadei, nu din toate leadurile: „40% dintre
  // pierderi sunt din preț" e o frază utilă; „40% din leaduri" ar fi alt număr și altă concluzie.
  const totalLost = [...map.values()].reduce((sum, b) => sum + b.count, 0);
  return [...map.entries()]
    .map(([reason, b]) => ({ reason, ...b, pct: totalLost ? Math.round((b.count / totalLost) * 100) : 0 }))
    .sort((a, b) => b.count - a.count);
}

// ─── cerința 56 — task-uri finalizate vs restante ───────────────────────────

export interface TaskCompliance {
  done: number;
  overdue: number;
  openNotYetDue: number;
  /** % task-uri finalizate din totalul cunoscut (done + overdue + în așteptare). */
  totalPct: number;
}

/**
 * Task-uri finalizate vs restante (cerința 56), instantaneu la `now`.
 * Task-urile `snoozed` nu sunt nici „done”, nici „overdue” — sunt amânate
 * deliberat de agent, nu ignorate; le raportăm separat ar necesita o categorie
 * proprie, dar cerința cere explicit doar „done vs overdue”, deci le excludem
 * din ambele găleți (nu le numărăm ca restanță nemeritată).
 */
export function taskCompliance(tasks: ReportTask[], now: Date = new Date()): TaskCompliance {
  let done = 0;
  let overdue = 0;
  let openNotYetDue = 0;
  for (const t of tasks) {
    if (t.status === "done") done++;
    else if (t.status === "open" && t.dueAt && new Date(t.dueAt) < now) overdue++;
    else if (t.status === "open") openNotYetDue++;
  }
  const total = done + overdue + openNotYetDue;
  return { done, overdue, openNotYetDue, totalPct: total ? Math.round((done / total) * 100) : 0 };
}

// ─── Strat de date (I/O) ─────────────────────────────────────────────────────


// ─── Evoluția în timp (cerința 57 — „pe perioadă selectată") ─────────────────

export interface TimelineBucket {
  /** Începutul intervalului, ISO (zi, săptămână sau lună — vezi `bucketSizeFor`). */
  bucket: string;
  leadsCreated: number;
  offersSent: number;
  contractsSigned: number;
  salesValueCents: number;
}

export type BucketSize = "day" | "week" | "month";

/**
 * Cât de fin se taie perioada. O lună pe zile e citibilă; un an pe zile e un gard de 365 de bare
 * în care nu vezi nimic. Pragurile sunt alese ca graficul să aibă între ~10 și ~60 de puncte.
 */
export function bucketSizeFor(range: DateRange, now: Date = new Date()): BucketSize {
  const from = range.from ? new Date(range.from) : null;
  const to = range.to ? new Date(range.to) : now;
  if (!from) return "month"; // „tot timpul"
  const days = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
  if (days <= 62) return "day";
  if (days <= 400) return "week";
  return "month";
}

/** Eticheta intervalului în care cade o dată (ziua, lunea săptămânii, sau întâi luna). */
export function bucketKey(iso: string, size: BucketSize): string {
  const d = new Date(iso);
  if (size === "month") return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  if (size === "week") {
    const copy = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    // Luni ca prima zi (ro-MD): duminica (0) se trage cu 6 zile înapoi, nu cu 0.
    const shift = (copy.getUTCDay() + 6) % 7;
    copy.setUTCDate(copy.getUTCDate() - shift);
    return copy.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Evoluția în perioada aleasă: leaduri intrate, oferte trimise, contracte semnate și valoarea lor.
 *
 * Pură, ca restul fișierului. „Contract semnat" e, ca peste tot aici, PRIMA tranziție către o
 * etapă cu flagul `isWon` — nu starea curentă a leadului, care n-ar ști să spună CÂND s-a
 * întâmplat.
 */
export function timeline(
  leads: ReportLead[],
  stageChanges: StageChange[],
  stages: ReportStage[],
  range: DateRange,
  size: BucketSize
): TimelineBucket[] {
  const won = wonKeySet(stages);
  // Aceeași regulă ca în `salesKpis`: o „ofertă trimisă" e intrarea într-o etapă de ofertă.
  // Dacă graficul ar număra altfel decât plăcuța de deasupra lui, raportul s-ar contrazice
  // singur pe același ecran.
  const offer = offerKeySet(stages);
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const buckets = new Map<string, TimelineBucket>();

  const touch = (iso: string): TimelineBucket => {
    const key = bucketKey(iso, size);
    let b = buckets.get(key);
    if (!b) {
      b = { bucket: key, leadsCreated: 0, offersSent: 0, contractsSigned: 0, salesValueCents: 0 };
      buckets.set(key, b);
    }
    return b;
  };

  for (const lead of leads) {
    if (!inRange(lead.createdAt, range)) continue;
    touch(lead.createdAt).leadsCreated++;
  }

  const offerSeen = new Set<string>();
  for (const ch of stageChanges) {
    if (!ch.leadId || !ch.to || !ch.occurredAt || !offer.has(ch.to)) continue;
    if (!inRange(ch.occurredAt, range)) continue;
    // O singură ofertă per lead, ca în `salesKpis`: un lead plimbat de două ori prin etapa de
    // ofertă n-a produs două oferte.
    if (offerSeen.has(ch.leadId)) continue;
    offerSeen.add(ch.leadId);
    touch(ch.occurredAt).offersSent++;
  }

  // Prima intrare într-o etapă câștigată, per lead — altfel o cerere plimbată înainte-înapoi ar
  // fi numărată de mai multe ori ca vânzare.
  const firstWonAt = new Map<string, string>();
  for (const ch of stageChanges) {
    if (!ch.leadId || !ch.to || !ch.occurredAt || !won.has(ch.to)) continue;
    const prev = firstWonAt.get(ch.leadId);
    if (!prev || ch.occurredAt < prev) firstWonAt.set(ch.leadId, ch.occurredAt);
  }
  for (const [leadId, at] of firstWonAt) {
    if (!inRange(at, range)) continue;
    const b = touch(at);
    b.contractsSigned++;
    b.salesValueCents += leadById.get(leadId)?.valueCents ?? 0;
  }

  return [...buckets.values()].sort((a, b) => (a.bucket < b.bucket ? -1 : 1));
}

// ─── CC-4: pâlnia ca pâlnie — bani pe etapă și cădere pe etapă ───────────────

/** Etapa, îmbogățită cu ce-i trebuie pâlniei vizuale (culoare + probabilitate). */
export interface FunnelStage extends ReportStage {
  color?: string | null;
  probabilityPct?: number | null;
}

/** Lead-ul, cu probabilitatea proprie (când o are) — prognoza n-o ia doar de la etapă. */
export interface FunnelLead extends ReportLead {
  probabilityPct?: number | null;
}

export interface FunnelStageRow {
  key: string;
  label: string;
  color: string | null;
  orderIndex: number;
  isWon: boolean;
  isLost: boolean;
  /** Câte oportunități stau ACUM în etapă. */
  currentCount: number;
  /** Suma lor, în cenți — răspunsul la „cât e blocat aici". */
  currentValueCents: number;
  /** Aceeași sumă, ponderată cu probabilitatea (a leadului, altfel a etapei). */
  weightedValueCents: number;
  /** Câte oportunități au ajuns VREODATĂ până aici (vezi nota de mai jos). */
  reached: number;
  /** Dintre cele care au ajuns aici, câte au mers mai departe. */
  advanced: number;
  /** Câte s-au oprit aici: `reached − advanced`. */
  dropped: number;
  /** Cât la sută din cele ajunse aici NU au mers mai departe. */
  dropRatePct: number;
  /** Cât la sută au mers mai departe — complementul, calculat o dată. */
  conversionPct: number;
}

/**
 * Pâlnia, așa cum o cere un manager de vânzări: pe fiecare etapă, banii din stânga și rata de
 * cădere din dreapta.
 *
 * CUM SE AFLĂ „a ajuns vreodată până aici" — și de ce nu doar din tranziții. `stageConversion`
 * (mai sus) numără EXCLUSIV tranziții înregistrate, ceea ce e corect pentru mutările făcute în
 * aplicație, dar face invizibil un lot importat în bloc: acele lead-uri n-au nicio tranziție,
 * deci nu apar nici la numărător, nici la numitor. Pe o bază de outreach, unde 90% din leaduri
 * intră prin import, pâlnia ar fi aproape goală.
 *
 * Aici combinăm cele două surse, în ordinea încrederii:
 *   1. tranzițiile reale, când există — ele spun exact unde a fost lead-ul;
 *   2. poziția CURENTĂ, ca prag minim: un lead aflat acum în „Negociere" a trecut prin etapele
 *      dinaintea ei. Asumăm o pâlnie liniară — și chiar asta e o pâlnie.
 *
 * Etapele „pierdut" nu intră în lanț: un lead pierdut a căzut DINTR-O etapă deschisă, iar dacă
 * l-am pune la coadă, rata de cădere ar arăta zero pe toate etapele și 100% la final. Când
 * tranzițiile lui există, se numără corect la etapa din care a plecat; când e importat direct ca
 * pierdut, nu avem de unde ști unde a căzut — apare doar în rândul „pierdut", nu inventăm.
 *
 * Etapa CÂȘTIGATĂ e ultima verigă: „a ajuns la câștigat" nu mai are unde avansa, deci rata ei de
 * cădere e 0, nu 100%.
 */
export function funnelBreakdown(
  leads: FunnelLead[],
  stages: FunnelStage[],
  changes: StageChange[]
): FunnelStageRow[] {
  // Lanțul pâlniei: etapele deschise + cea câștigată, în ordine. Cele pierdute stau deoparte.
  const chain = stages.filter((s) => !s.isLost).sort((a, b) => a.orderIndex - b.orderIndex);
  const indexOf = new Map(chain.map((s, i) => [s.key, i]));
  const probabilityOf = new Map(stages.map((s) => [s.key, s.probabilityPct ?? 0]));

  const currentCount = new Map<string, number>();
  const currentValue = new Map<string, number>();
  const weighted = new Map<string, number>();
  /** Cel mai departe a ajuns fiecare lead, ca index în lanț. */
  const furthest = new Map<string, number>();

  for (const lead of leads) {
    currentCount.set(lead.stage, (currentCount.get(lead.stage) ?? 0) + 1);
    currentValue.set(lead.stage, (currentValue.get(lead.stage) ?? 0) + (lead.valueCents ?? 0));
    const pct = lead.probabilityPct ?? probabilityOf.get(lead.stage) ?? 0;
    weighted.set(lead.stage, (weighted.get(lead.stage) ?? 0) + Math.round(((lead.valueCents ?? 0) * pct) / 100));

    const idx = indexOf.get(lead.stage);
    if (idx !== undefined) furthest.set(lead.id, Math.max(furthest.get(lead.id) ?? -1, idx));
  }

  for (const change of changes) {
    if (!change.leadId || !change.to) continue;
    const idx = indexOf.get(change.to);
    if (idx === undefined) continue; // tranziție către o etapă pierdută sau dispărută
    furthest.set(change.leadId, Math.max(furthest.get(change.leadId) ?? -1, idx));
  }

  // Câte lead-uri au atins cel puțin indexul i.
  const reachedAt = new Array(chain.length).fill(0) as number[];
  for (const idx of furthest.values()) {
    for (let i = 0; i <= idx && i < reachedAt.length; i++) reachedAt[i] += 1;
  }

  const rows: FunnelStageRow[] = chain.map((stage, i) => {
    const reached = reachedAt[i] ?? 0;
    // Ultima verigă (de regulă etapa câștigată) n-are unde avansa: tot ce a ajuns acolo a ajuns.
    const advanced = i + 1 < reachedAt.length ? reachedAt[i + 1] ?? 0 : reached;
    const dropped = Math.max(0, reached - advanced);
    return {
      key: stage.key,
      label: stage.label,
      color: stage.color ?? null,
      orderIndex: stage.orderIndex,
      isWon: stage.isWon,
      isLost: stage.isLost,
      currentCount: currentCount.get(stage.key) ?? 0,
      currentValueCents: currentValue.get(stage.key) ?? 0,
      weightedValueCents: weighted.get(stage.key) ?? 0,
      reached,
      advanced,
      dropped,
      dropRatePct: reached === 0 ? 0 : Math.round((dropped / reached) * 100),
      conversionPct: reached === 0 ? 0 : Math.round((advanced / reached) * 100),
    };
  });

  // Etapele „pierdut" se raportează separat, la coadă: sunt un rezultat, nu o verigă.
  for (const stage of stages.filter((s) => s.isLost).sort((a, b) => a.orderIndex - b.orderIndex)) {
    rows.push({
      key: stage.key,
      label: stage.label,
      color: stage.color ?? null,
      orderIndex: stage.orderIndex,
      isWon: false,
      isLost: true,
      currentCount: currentCount.get(stage.key) ?? 0,
      currentValueCents: currentValue.get(stage.key) ?? 0,
      weightedValueCents: weighted.get(stage.key) ?? 0,
      reached: currentCount.get(stage.key) ?? 0,
      advanced: 0,
      dropped: currentCount.get(stage.key) ?? 0,
      dropRatePct: 100,
      conversionPct: 0,
    });
  }

  return rows;
}

/** Pâlnia unui singur agent — aceeași funcție, pe lead-urile lui. */
export function funnelByOwner(
  leads: FunnelLead[],
  stages: FunnelStage[],
  changes: StageChange[],
  ownerKey: string
): FunnelStageRow[] {
  const mine = leads.filter((l) => l.assignedTo === ownerKey);
  const ids = new Set(mine.map((l) => l.id));
  return funnelBreakdown(
    mine,
    stages,
    changes.filter((c) => c.leadId && ids.has(c.leadId))
  );
}


// ─── CC-5: norme KPI și gradul de realizare ─────────────────────────────────

/** O normă, redusă la ce folosește calculul. */
export interface KpiTargetRow {
  userId: string | null;
  period: string;
  metric: string;
  target: number;
}

export interface KpiAttainment {
  /** Ținta scalată la perioada raportului (vezi mai jos de ce se scalează). */
  target: number;
  achieved: number;
  /** Procent din țintă, rotunjit. Peste 100 NU se taie: „140%" e o informație, nu o eroare. */
  pct: number;
}

/** Câte zile are intervalul raportului. Fără `from`/`to` (adică „tot timpul"), normele nu se pot
 *  scala — o țintă săptămânală n-are înțeles peste o perioadă nedefinită. */
export function rangeDays(range: DateRange): number | null {
  if (!range.from || !range.to) return null;
  const from = new Date(range.from).getTime();
  const to = new Date(range.to).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return null;
  return (to - from) / 86_400_000;
}

/**
 * Gradul de realizare, indicator cu indicator.
 *
 * **Scalarea, spusă pe față.** Norma se pune „pe săptămână" (sau pe lună), dar raportul se poate
 * cere pe orice interval. O normă de 60 de apeluri/săptămână, privită pe 30 de zile, devine
 * 60 × 30/7 ≈ 257. Alternativa — să arătăm 60 indiferent de perioadă — ar fi produs „428%" la
 * orice raport lunar, adică un număr care nu înseamnă nimic.
 *
 * **Când perioada e „tot timpul"** (fără capete), scalarea nu are sens și nu inventăm una:
 * indicatorul rămâne fără grad de realizare, iar interfața arată cifra goală, ca înainte.
 *
 * **Fără normă setată nu există 0%.** Un 0% pe un indicator pe care nimeni n-a cerut nimic ar
 * acuza degeaba — și ar face ca ecranul să pară roșu într-un workspace care doar n-a apucat să-și
 * pună norme.
 */
export function kpiAttainment(
  kpis: SalesKpis,
  targets: KpiTargetRow[],
  range: DateRange,
  ownerKey?: string
): Record<string, KpiAttainment> {
  const days = rangeDays(range);
  if (days === null) return {};

  const out: Record<string, KpiAttainment> = {};

  for (const metric of Object.keys(kpis) as (keyof SalesKpis)[]) {
    // Norma personală bate norma generală a workspace-ului.
    const personal = ownerKey ? targets.find((t) => t.userId === ownerKey && t.metric === metric) : undefined;
    const general = targets.find((t) => t.userId === null && t.metric === metric);
    const rule = personal ?? general;
    if (!rule || rule.target <= 0) continue;

    const periodDays = rule.period === "month" ? 30 : 7;
    const scaled = Math.round((rule.target * days) / periodDays);
    const achieved = kpis[metric] ?? 0;
    out[metric] = {
      target: scaled,
      achieved,
      pct: scaled === 0 ? 0 : Math.round((achieved / scaled) * 100),
    };
  }

  return out;
}
