/**
 * Recurența task-urilor, partea de server: următoarea ocurență la finalizarea unei serii.
 *
 * Aceeași regulă ca `src/lib/tasks/recurrence.ts` (clientul o folosește ca să DESENEZE
 * ocurențele viitoare în calendar), dar pe UTC: termenele se scriu la prânz ora locală (09:00Z
 * la Chișinău), deci ziua UTC e ziua omului. Regula stocată: JSON text
 * `{ frequency: daily|weekly|monthly|yearly, interval: 1..99, days: [mon..sun], ends_at: "YYYY-MM-DD"|null }`.
 */

export const WEEK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];
export type RecurrenceFrequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;
  days: WeekDay[];
  ends_at: string | null;
}

/** Regula stocată → o regulă validă, sau `null` dacă textul nu e o regulă (nu se reprogramează). */
export function parseRecurrence(rule: string | null | undefined): RecurrenceRule | null {
  if (!rule) return null;
  let parsed: Partial<RecurrenceRule>;
  try {
    parsed = JSON.parse(rule) as Partial<RecurrenceRule>;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const frequency: RecurrenceFrequency =
    parsed.frequency === "daily" || parsed.frequency === "monthly" || parsed.frequency === "yearly"
      ? parsed.frequency
      : "weekly";
  const days = Array.isArray(parsed.days)
    ? WEEK_DAYS.filter((day) => (parsed.days as unknown[]).includes(day))
    : [];
  return {
    frequency,
    interval: Math.max(1, Math.min(99, Math.trunc(Number(parsed.interval)) || 1)),
    days,
    ends_at: typeof parsed.ends_at === "string" && parsed.ends_at ? parsed.ends_at : null,
  };
}

function addDays(date: Date, n: number): Date {
  const out = new Date(date.getTime());
  out.setUTCDate(out.getUTCDate() + n);
  return out;
}

function addMonths(date: Date, n: number): Date {
  const out = new Date(date.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, lastDay));
  return out;
}

const JS_DAY_TO_CODE: WeekDay[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Următoarea ocurență STRICT după `base` (săptămânal: următoarea zi bifată, nu „+7 zile"). */
export function nextOccurrence(base: Date, rule: RecurrenceRule): Date {
  switch (rule.frequency) {
    case "daily":
      return addDays(base, rule.interval);
    case "monthly":
      return addMonths(base, rule.interval);
    case "yearly":
      return addMonths(base, rule.interval * 12);
    default: {
      if (rule.days.length === 0) return addDays(base, rule.interval * 7);
      const wanted = rule.days.map((day) => WEEK_DAYS.indexOf(day));
      const current = WEEK_DAYS.indexOf(JS_DAY_TO_CODE[base.getUTCDay()]);
      const ahead = wanted.filter((index) => index > current);
      if (ahead.length > 0) return addDays(base, Math.min(...ahead) - current);
      return addDays(base, 7 - current + Math.min(...wanted) + (rule.interval - 1) * 7);
    }
  }
}

/**
 * Termenul noii ocurențe la finalizarea seriei: după termenul curent (sau după momentul
 * finalizării), sărind perioadele ratate — un task săptămânal închis după trei săptămâni nu
 * trebuie să nască trei ocurențe restante. `null` = seria s-a încheiat (`ends_at` depășit).
 */
export function nextDueAfterCompletion(base: Date, rule: RecurrenceRule, now: Date = new Date()): Date | null {
  let next = nextOccurrence(base, rule);
  for (let i = 0; i < 60 && next.getTime() <= now.getTime(); i += 1) next = nextOccurrence(next, rule);
  if (rule.ends_at) {
    const ends = new Date(`${rule.ends_at}T23:59:59Z`);
    if (!Number.isNaN(ends.getTime()) && next.getTime() > ends.getTime()) return null;
  }
  return next;
}
