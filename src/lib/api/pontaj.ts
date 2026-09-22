/**
 * PONTAJ-001 — clientul API al modulului de pontaj.
 *
 * Toate rutele lucrează pe utilizatorul din sesiune: nu există niciun parametru de identitate,
 * fiindcă etapa asta e strict self-service. Timpul circulă în MINUTE (ca și în baza de date);
 * `hours` vine alături doar ca valoare gata de afișat, ca să nu se facă aceeași împărțire în
 * cinci locuri din interfață.
 */
import { api } from "@/lib/api";

export type DaySource = "manual" | "leave" | "holiday" | "weekend" | "pre_holiday" | "norm";

export interface PontajSymbol {
  code: string;
  display: string;
  label: string;
}

export interface PontajForm {
  annexLines: string[];
  title: string;
  legalBasis: string;
  showUnitFields: boolean;
  signatures: [string, string, string];
  legend: [string, string, string][];
}

export interface PontajJurisdiction {
  code: "MD" | "RO" | "OTHER";
  label: string;
  isAdapted: boolean;
  labourCode: string;
  annualLeaveDays: number;
  annualLeaveUnit: "calendar" | "working";
  annualLeaveLegalRef: string;
  preHolidayReductionMinutes: number;
  preHolidayLegalRef: string;
  fullDailyNormMinutes: number;
  fullDailyNormLegalRef: string;
  maxDailyMinutes: number;
  symbols: PontajSymbol[];
  summaryCols: { key: string; short: string }[];
  form: PontajForm;
}

export interface PontajDay {
  date: string;
  weekday: number;
  symbol: string;
  minutes: number;
  hours: number;
  source: DaySource;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  isPreHolidayEve: boolean;
  isPreHolidayReduced: boolean;
  leaveId?: string;
  note?: string;
}

export interface PontajLeave {
  id: string;
  symbol: string;
  startDate: string;
  endDate: string;
  note: string | null;
}

export interface PontajOrg {
  country: string;
  fullDailyNormMinutes: number;
  workWeekdays: number[];
  /** Ce se tipărește în antet. Când administratorul n-a scris nimic, e numele workspace-ului. */
  unitName: string | null;
  subdivisionName: string | null;
  signatoryHead: string | null;
  signatoryRecorder: string | null;
  signatoryHr: string | null;
}

export interface PontajProfile {
  dailyMinutes: number;
  dailyHours: number;
  jobTitle: string | null;
  staffCode: string | null;
  reducedSchedule: boolean;
}

export interface PontajMonth {
  month: string;
  employee: {
    userId: string;
    name: string;
    email: string;
    jobTitle: string | null;
    staffCode: string | null;
    dailyMinutes: number;
    dailyHours: number;
    reducedSchedule: boolean;
  };
  org: PontajOrg;
  /** Rolul curent poate schimba setările organizației (admin/manager). */
  canEditOrg: boolean;
  jurisdiction: PontajJurisdiction;
  days: PontajDay[];
  totals: {
    counts: Record<string, number>;
    workedMinutes: number;
    workedHours: number;
    workedDays: number;
  };
  leaves: PontajLeave[];
  holidays: { date: string; name: string }[];
  schemaLag: boolean;
}

export interface PontajSettings {
  profile: PontajProfile;
  org: PontajOrg;
  /** Textul scris EXPLICIT de administrator — `null` înseamnă „se folosește numele workspace-ului". */
  orgExplicitUnitName: string | null;
  jurisdiction: PontajJurisdiction;
  canEditOrg: boolean;
}

export interface PontajHolidaysResponse {
  year: number;
  country: string;
  legal: { date: string; name: string; source: "legal" }[];
  company: { id: string; date: string; name: string; source: "company" }[];
  canEdit: boolean;
}

export const getPontajMonth = (month: string) =>
  api<PontajMonth>(`/api/pontaj/month?month=${encodeURIComponent(month)}`);

export const setPontajDay = (input: {
  date: string;
  symbol: string;
  minutes?: number;
  note?: string;
}) => api<{ ok: true }>("/api/pontaj/day", { method: "PUT", body: JSON.stringify(input) });

export const clearPontajDay = (date: string) =>
  api<{ ok: true }>(`/api/pontaj/day/${date}`, { method: "DELETE" });

export const addPontajLeave = (input: {
  symbol: string;
  startDate: string;
  endDate: string;
  note?: string;
}) =>
  api<{ ok: true; leave: PontajLeave; calendarDays: number; workingDays: number }>(
    "/api/pontaj/leaves",
    { method: "POST", body: JSON.stringify(input) },
  );

export const deletePontajLeave = (id: string) =>
  api<{ ok: true }>(`/api/pontaj/leaves/${id}`, { method: "DELETE" });

export const getPontajSettings = () => api<PontajSettings>("/api/pontaj/settings");

export const savePontajProfile = (input: {
  dailyMinutes?: number;
  jobTitle?: string | null;
  staffCode?: string | null;
  reducedSchedule?: boolean;
}) =>
  api<{ ok: true; profile: PontajProfile }>("/api/pontaj/settings", {
    method: "PUT",
    body: JSON.stringify(input),
  });

export const savePontajOrg = (input: Partial<PontajOrg>) =>
  api<{ ok: true; org: PontajOrg; jurisdiction: PontajJurisdiction }>("/api/pontaj/org", {
    method: "PUT",
    body: JSON.stringify(input),
  });

export const getPontajHolidays = (year: number) =>
  api<PontajHolidaysResponse>(`/api/pontaj/holidays?year=${year}`);

export const addPontajHoliday = (input: { date: string; name: string }) =>
  api<{ ok: true }>("/api/pontaj/holidays", { method: "POST", body: JSON.stringify(input) });

export const deletePontajHoliday = (id: string) =>
  api<{ ok: true }>(`/api/pontaj/holidays/${id}`, { method: "DELETE" });

// ─── Formatare ────────────────────────────────────────────────────────────────

/** Minute → „8", „7,5". Fără zecimale inutile: formularul se citește de om, nu de mașină. */
export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours)
    ? String(hours)
    : hours.toFixed(2).replace(/0$/, "").replace(".", ",");
}

/** Ce se scrie în celulă: orele pentru ziua lucrată, abrevierea jurisdicției pentru rest. */
export function cellText(day: PontajDay, symbols: PontajSymbol[]): string {
  if (day.symbol === "P") return formatHours(day.minutes);
  return symbols.find((s) => s.code === day.symbol)?.display ?? day.symbol;
}

const MONTHS_RO = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

export function monthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTHS_RO[(m || 1) - 1]} ${y}`;
}

export function monthName(monthKey: string): string {
  return MONTHS_RO[(Number(monthKey.split("-")[1]) || 1) - 1];
}

/** Luna vecină, `yyyy-MM` ± n. */
export function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export const WEEKDAY_SHORT = ["L", "Ma", "Mi", "J", "V", "S", "D"];
