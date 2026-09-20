/**
 * CRM — clientul tipat pentru rapoartele de vânzări.
 *
 * Un SINGUR endpoint aduce tot ce afișează pagina. Schimbarea perioadei sau a
 * agentului reface cererea, dar nu șapte cereri — pool-ul de conexiuni pe
 * Vercel e `max: 3`.
 */
import { api } from "@/lib/api";

export interface CrmSalesKpis {
  leadsAllocated: number;
  callsMade: number;
  successfulContacts: number;
  meetings: number;
  offersSent: number;
  contractsSigned: number;
  salesValueCents: number;
  tasksDone: number;
  tasksOverdue: number;
}

/**
 * ATENȚIE la nume: acestea sunt EXACT câmpurile pe care le întoarce serverul
 * (`StageConversionRow` din server/lib/crm/reports.ts). Tipurile de aici scriseseră
 * `entered`/`ratePct`, care nu există — iar pagina afișa, în producție, o coloană goală și
 * „undefined%". Nimic nu prinsese asta, fiindcă TypeScript verifică tipul declarat, nu ce vine
 * de pe fir.
 */
export interface CrmConversionRow {
  fromKey: string;
  fromLabel: string;
  toKey: string;
  toLabel: string;
  /** Câte leaduri distincte au ajuns vreodată în etapa `fromKey`. */
  reached: number;
  /** Dintre acelea, câte au ajuns și în `toKey`. */
  advanced: number;
  conversionPct: number;
}

export interface CrmOwnerRow extends CrmSalesKpis {
  ownerKey: string;
  ownerName: string;
}

export interface CrmProductRow {
  /** Numele produsului/cursului — cheia de grupare e chiar el. */
  product: string;
  total: number;
  won: number;
  lost: number;
  /** Valoarea leadurilor câștigate, în cenți. */
  valueCents: number;
  /** % din cele DECISE (câștigate + pierdute); cele deschise nu intră la numitor. */
  winRatePct: number;
}

export interface CrmLostReasonRow {
  reason: string;
  count: number;
  /** Valoarea totală a leadurilor pierdute pe acest motiv, în cenți. */
  valueCents: number;
  /** Procent din leadurile pierdute ale perioadei. */
  pct: number;
}

export interface CrmTaskCompliance {
  done: number;
  overdue: number;
  /** Deschise, dar încă nescadente. */
  openNotYetDue: number;
  /** % finalizate din totalul cunoscut (finalizate + restante + în așteptare). */
  totalPct: number;
}

export interface CrmTimelineBucket {
  /** Începutul intervalului (ISO, doar data). */
  bucket: string;
  leadsCreated: number;
  offersSent: number;
  contractsSigned: number;
  salesValueCents: number;
}

export interface CrmReportsResponse {
  range: { from: string | null; to: string | null };
  owner: string | null;
  stages: { key: string; label: string; isWon: boolean; isLost: boolean }[];
  owners: { id: string; name: string }[];
  kpis: CrmSalesKpis;
  /** Gradul de realizare față de normă, per indicator (CC-5). Lipsă = fără normă sau perioadă
   *  fără capete — interfața arată atunci cifra simplă, nu 0%. */
  attainment?: Record<string, { target: number; achieved: number; pct: number }>;
  /** Normele workspace-ului, așa cum sunt salvate (nescalate). */
  targets?: { userId: string | null; period: string; metric: string; target: number }[];
  conversion: CrmConversionRow[];
  cycleDays: number;
  perOwner: CrmOwnerRow[];
  perProduct: CrmProductRow[];
  lostReasons: CrmLostReasonRow[];
  taskCompliance: CrmTaskCompliance;
  /** Contactabilitatea listei (CC-6): apeluri → răspunsuri → decidenți. */
  callFunnel?: {
    dialed: number;
    connected: number;
    decisionMakers: number;
    leadsTouched: number;
    callsPerDecisionMaker: number | null;
    byOutcome: { outcome: string; label: string; count: number; pct: number }[];
    unknown: number;
  };
  /** Evoluția în perioadă, tăiată pe zi/săptămână/lună (vezi `bucketSize`). */
  timeline?: CrmTimelineBucket[];
  bucketSize?: "day" | "week" | "month";
  /** Prezent doar când baza a rămas în urma codului — pagina arată gol, nu eroare. */
  schemaLag?: boolean;
}

export function getCrmReports(params: {
  from?: string | null;
  to?: string | null;
  owner?: string | null;
}): Promise<CrmReportsResponse> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.owner) qs.set("owner", params.owner);
  const suffix = qs.toString();
  return api<CrmReportsResponse>(`/api/crm/reports${suffix ? `?${suffix}` : ""}`);
}

// ─── Perioade ────────────────────────────────────────────────────────────────

export type CrmPeriodPreset = "today" | "thisWeek" | "thisMonth" | "lastMonth" | "last90" | "all" | "custom";

export const CRM_PERIOD_LABELS: Record<CrmPeriodPreset, string> = {
  today: "Azi",
  thisWeek: "Săptămâna aceasta",
  thisMonth: "Luna aceasta",
  lastMonth: "Luna trecută",
  last90: "Ultimele 90 de zile",
  all: "Tot timpul",
  custom: "Interval ales",
};

/**
 * Intervalele sunt SEMI-DESCHISE: [from, to). Altfel o înregistrare făcută la
 * 23:59:59 în ultima zi ar cădea în afara raportului sau ar fi numărată de două
 * ori la granița dintre două perioade.
 *
 * Săptămâna începe LUNI — convenția din România, nu duminica.
 */
export function presetRange(preset: CrmPeriodPreset, now: Date = new Date()): { from: string | null; to: string | null } {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const iso = (d: Date) => d.toISOString();

  switch (preset) {
    case "today": {
      const from = startOfDay(now);
      const to = new Date(from);
      to.setDate(to.getDate() + 1);
      return { from: iso(from), to: iso(to) };
    }
    case "thisWeek": {
      const d = startOfDay(now);
      // getDay(): 0 = duminică. Ne întoarcem la lunea curentă.
      const shift = (d.getDay() + 6) % 7;
      const from = new Date(d);
      from.setDate(d.getDate() - shift);
      const to = new Date(from);
      to.setDate(from.getDate() + 7);
      return { from: iso(from), to: iso(to) };
    }
    case "thisMonth": {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { from: iso(from), to: iso(to) };
    }
    case "lastMonth": {
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: iso(from), to: iso(to) };
    }
    case "last90": {
      const to = startOfDay(now);
      to.setDate(to.getDate() + 1);
      const from = new Date(to);
      from.setDate(to.getDate() - 90);
      return { from: iso(from), to: iso(to) };
    }
    case "all":
    case "custom":
    default:
      return { from: null, to: null };
  }
}
