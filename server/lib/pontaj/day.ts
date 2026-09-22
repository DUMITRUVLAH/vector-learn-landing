/**
 * PONTAJ-001 — compunerea zilei unui angajat. SURSĂ UNICĂ, pur, fără I/O.
 *
 * Ziua e descrisă de patru surse: calendarul organizației (zilele de lucru), sărbătorile legale
 * și proprii, concediile înregistrate pe interval și corecția punctuală pe o zi. Fiecare ecran
 * care ar citi doar o parte din ele ar ajunge să contrazică celelalte fără nicio eroare — de
 * aceea verdictul se calculează AICI, într-un singur loc, iar ruta și pagina doar îl afișează.
 *
 * **Totul în MINUTE, ca întregi.** Zecimalele de oră (7,5 · 8,25) adună drift la însumare, iar
 * `numeric` din Postgres se întoarce ca string în drizzle — două surse de erori tăcute într-un
 * document care se semnează. Conversia la ore se face o singură dată, la afișare.
 *
 * **Niciun literal normativ aici.** Norma zilnică întreagă și reducerea din ajun vin ca
 * parametri, din jurisdicția organizației (`jurisdiction.ts`) sau din setările ei. Un implicit
 * „rezonabil" scris în motor ar fi o afirmație despre lege ascunsă într-o funcție.
 */
import { addDaysToKey, isoWeekday } from "./holidays";
import { SUMMARY_COLS, SYMBOL_TO_SUMMARY_COL, type SummaryCol } from "./jurisdiction";

/** De unde vine verdictul zilei — se arată în interfață, ca omul să știe ce poate schimba. */
export type DaySource = "manual" | "leave" | "holiday" | "weekend" | "pre_holiday" | "norm";

export interface ComposedDay {
  /** `yyyy-MM-dd`. */
  date: string;
  /** 1 = luni … 7 = duminică. */
  weekday: number;
  symbol: string;
  /** Minutele lucrate. 0 pentru orice simbol care nu e `P`. */
  minutes: number;
  source: DaySource;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  /** Ziua din ajunul unei sărbători nelucrătoare. */
  isPreHolidayEve: boolean;
  /** Ajunul chiar a fost scurtat (fals pentru cei cu program redus — art. 96/97 CM RM). */
  isPreHolidayReduced: boolean;
  /** Id-ul concediului care acoperă ziua, ca interfața să-l poată șterge de pe celulă. */
  leaveId?: string;
  note?: string;
}

export interface ComposeInput {
  /** Zilele de compus, `yyyy-MM-dd`, în ordine. */
  days: string[];
  /** Zilele lucrătoare ale organizației, ISO: 1 = luni … 7 = duminică. */
  workWeekdays: number[];
  /** `yyyy-MM-dd → nume` pentru sărbători (legale + proprii). Trebuie să acopere și ziua de după ultima zi compusă. */
  holidays: Map<string, string>;
  /** Norma zilnică a persoanei, în minute. */
  dailyMinutes: number;
  /** Norma zilnică întreagă a jurisdicției, în minute — reperul pentru scurtarea ajunului. */
  fullDailyNormMinutes: number;
  /** Cu cât se scurtează ajunul în jurisdicția organizației, în minute. 0 = nu se scurtează. */
  preHolidayReductionMinutes: number;
  /**
   * Program redus prin art. 96 / zi parțială prin art. 97 din Codul muncii RM. Art. 102 îi
   * scutește de scurtarea ajunului: a reduce un program de 4 ore la 3 ar fi o tăiere pe care
   * legea nu o cere.
   */
  reducedSchedule: boolean;
  /** Concediile care ating intervalul, deja citite din DB. */
  leaves: LeaveSpan[];
  /** Corecțiile punctuale, pe zi. Bat orice altceva. */
  entries: DayEntry[];
}

export interface LeaveSpan {
  id: string;
  symbol: string;
  /** `yyyy-MM-dd`, inclusiv. */
  startDate: string;
  /** `yyyy-MM-dd`, inclusiv. */
  endDate: string;
  note?: string | null;
}

export interface DayEntry {
  /** `yyyy-MM-dd`. */
  date: string;
  symbol: string;
  minutes: number;
  note?: string | null;
}

/**
 * Cât are ziua din ajun pentru cineva cu norma `dailyMinutes`.
 *
 * Art. 102 din Codul muncii RM scutește de reducere pe cei cu durată redusă a timpului de muncă
 * (art. 96) sau cu zi de muncă parțială (art. 97) — în datele noastre, exact cei marcați cu
 * `reducedSchedule` sau cei care lucrează deja sub norma întreagă.
 */
export function preHolidayMinutes(
  dailyMinutes: number,
  reductionMinutes: number,
  fullDailyNormMinutes: number,
  reducedSchedule: boolean,
): number {
  if (reductionMinutes <= 0) return dailyMinutes;
  if (reducedSchedule) return dailyMinutes;
  if (dailyMinutes < fullDailyNormMinutes) return dailyMinutes;
  return Math.max(0, dailyMinutes - reductionMinutes);
}

/**
 * Verdictul unei zile. **Ordinea e regula**, nu o preferință de stil:
 *
 * 1. corecția manuală — omul a spus explicit ce s-a întâmplat în ziua aia;
 * 2. concediul — acoperă ziua chiar dacă e zi lucrătoare;
 * 3. sărbătoarea, apoi repausul săptămânal — calendarul;
 * 4. ajunul scurtat, apoi norma obișnuită.
 *
 * Concediul stă DEASUPRA calendarului intenționat: un concediu înregistrat peste weekend rămâne
 * vizibil ca atare în MD, unde concediul anual se numără în zile calendaristice (art. 113), deci
 * zilele de repaus din interiorul lui chiar se consumă.
 */
export function composeDay(
  date: string,
  ctx: Omit<ComposeInput, "days" | "leaves" | "entries"> & {
    leave?: LeaveSpan | null;
    entry?: DayEntry | null;
  },
): ComposedDay {
  const weekday = isoWeekday(date);
  const isWeekend = !ctx.workWeekdays.includes(weekday);
  const holidayName = ctx.holidays.get(date);
  const isHoliday = holidayName !== undefined;

  // Ajunul e ziua calendaristică DINAINTEA sărbătorii, nu ultima zi lucrătoare dinaintea ei:
  // dacă sărbătoarea cade lunea, ajunul e duminica — zi de repaus, deci nu se scurtează nimic.
  // La două sărbători consecutive (7 și 8 ianuarie), ajunul celei de-a doua e prima, tot
  // nelucrătoare. Ambele cazuri ies singure din condiția de mai jos.
  const isPreHolidayEve =
    !isWeekend && !isHoliday && ctx.holidays.has(addDaysToKey(date, 1));

  const base = {
    date,
    weekday,
    isWeekend,
    isHoliday,
    holidayName,
    isPreHolidayEve,
    isPreHolidayReduced: false,
  };

  if (ctx.entry) {
    return {
      ...base,
      symbol: ctx.entry.symbol,
      minutes: ctx.entry.symbol === "P" ? ctx.entry.minutes : 0,
      source: "manual",
      note: ctx.entry.note ?? undefined,
    };
  }

  if (ctx.leave) {
    return {
      ...base,
      symbol: ctx.leave.symbol,
      minutes: 0,
      source: "leave",
      leaveId: ctx.leave.id,
      note: ctx.leave.note ?? undefined,
    };
  }

  if (isHoliday) return { ...base, symbol: "Sn", minutes: 0, source: "holiday" };
  if (isWeekend) return { ...base, symbol: "R", minutes: 0, source: "weekend" };

  if (isPreHolidayEve) {
    const minutes = preHolidayMinutes(
      ctx.dailyMinutes,
      ctx.preHolidayReductionMinutes,
      ctx.fullDailyNormMinutes,
      ctx.reducedSchedule,
    );
    return {
      ...base,
      symbol: "P",
      minutes,
      source: "pre_holiday",
      isPreHolidayReduced: minutes !== ctx.dailyMinutes,
    };
  }

  return { ...base, symbol: "P", minutes: ctx.dailyMinutes, source: "norm" };
}

/** Indexul „zi → concediu". Ultimul înregistrat câștigă ziua, ca la orice suprapunere de intervale. */
export function indexLeaves(leaves: LeaveSpan[]): Map<string, LeaveSpan> {
  const byDay = new Map<string, LeaveSpan>();
  for (const leave of leaves) {
    let cursor = leave.startDate;
    // Gard: un interval corupt (sau absurd de lung) nu are voie să blocheze luna.
    for (let i = 0; i <= 400 && cursor <= leave.endDate; i += 1) {
      byDay.set(cursor, leave);
      cursor = addDaysToKey(cursor, 1);
    }
  }
  return byDay;
}

/** Luna întreagă a unei persoane, gata de afișat și de tipărit. */
export function composeDays(input: ComposeInput): ComposedDay[] {
  const leaveByDay = indexLeaves(input.leaves);
  const entryByDay = new Map(input.entries.map((e) => [e.date, e]));
  return input.days.map((date) =>
    composeDay(date, {
      workWeekdays: input.workWeekdays,
      holidays: input.holidays,
      dailyMinutes: input.dailyMinutes,
      fullDailyNormMinutes: input.fullDailyNormMinutes,
      preHolidayReductionMinutes: input.preHolidayReductionMinutes,
      reducedSchedule: input.reducedSchedule,
      leave: leaveByDay.get(date) ?? null,
      entry: entryByDay.get(date) ?? null,
    }),
  );
}

export interface MonthTotals {
  /** Câte zile a adunat fiecare coloană de total din formular. */
  counts: Record<SummaryCol, number>;
  /** Minutele lucrate în lună (doar zilele `P`). */
  workedMinutes: number;
  /** Zile lucrate, ca număr — oglinda coloanei `zl`, scoasă separat pentru rezumat. */
  workedDays: number;
}

export function emptyCounts(): Record<SummaryCol, number> {
  const counts = {} as Record<SummaryCol, number>;
  for (const col of SUMMARY_COLS) counts[col] = 0;
  return counts;
}

/** Totalurile lunii, dintr-o singură trecere peste zilele deja compuse. */
export function monthTotals(days: readonly ComposedDay[]): MonthTotals {
  const counts = emptyCounts();
  let workedMinutes = 0;
  for (const day of days) {
    const col = SYMBOL_TO_SUMMARY_COL[day.symbol];
    if (col) counts[col] += 1;
    if (day.symbol === "P") workedMinutes += day.minutes;
  }
  return { counts, workedMinutes, workedDays: counts.zl };
}

/** Minute → ore, cu două zecimale. O singură conversie, la granița cu afișarea. */
export function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

/** Ore (decimale, din interfață) → minute întregi. */
export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}
