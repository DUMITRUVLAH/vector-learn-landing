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
  reason: string;
  count: number;
  valueCents: number;
}

/** Motive de pierdere agregate (cerința 55) — leads fără `lostReason` (nesetat
 *  la momentul pierderii) sunt ignorate, nu grupate sub un fals „necunoscut”. */
export function lostReasonBreakdown(leads: ReportLead[]): LostReasonRow[] {
  const map = new Map<string, { count: number; valueCents: number }>();
  for (const l of leads) {
    if (!l.lostReason) continue;
    const b = map.get(l.lostReason) ?? { count: 0, valueCents: 0 };
    b.count++;
    b.valueCents += l.valueCents ?? 0;
    map.set(l.lostReason, b);
  }
  return [...map.entries()]
    .map(([reason, b]) => ({ reason, ...b }))
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

