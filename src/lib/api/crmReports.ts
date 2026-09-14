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

export interface CrmConversionRow {
  fromKey: string;
  fromLabel: string;
  toKey: string;
  toLabel: string;
  entered: number;
  advanced: number;
  ratePct: number;
}

export interface CrmOwnerRow extends CrmSalesKpis {
  ownerKey: string;
  ownerName: string;
}

export interface CrmProductRow {
  productKey: string;
  productName: string;
  total: number;
  won: number;
  wonValueCents: number;
  winRatePct: number;
}

export interface CrmLostReasonRow {
  reason: string;
  count: number;
  pct: number;
}

export interface CrmTaskCompliance {
  done: number;
  open: number;
  overdue: number;
  onTimePct: number;
}

export interface CrmReportsResponse {
  range: { from: string | null; to: string | null };
  owner: string | null;
  stages: { key: string; label: string; isWon: boolean; isLost: boolean }[];
  owners: { id: string; name: string }[];
  kpis: CrmSalesKpis;
  conversion: CrmConversionRow[];
  cycleDays: number;
  perOwner: CrmOwnerRow[];
  perProduct: CrmProductRow[];
  lostReasons: CrmLostReasonRow[];
  taskCompliance: CrmTaskCompliance;
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
