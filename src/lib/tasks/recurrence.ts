// Regula de recurență a unui task: parsare, următoarea ocurență și rezumatul
// citibil. Totul aici, ca editorul, cardurile și calendarul să spună ACELAȘI
// lucru — până acum regula era parsată doar în `TaskDetailPanel`, iar restul
// interfeței nu știa nici măcar că taskul se repetă.
//
// Oglindă a funcției DB `public.hr_task_next_occurrence(timestamptz, jsonb)`:
// dacă schimbi una, schimb-o și pe cealaltă (vezi COMMENT ON FUNCTION).

export const WEEK_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export type RecurrenceRule = {
  frequency: RecurrenceFrequency;
  interval: number;
  days: WeekDay[];
  ends_at?: string | null;
};

export const DEFAULT_RECURRENCE: RecurrenceRule = {
  frequency: 'weekly',
  interval: 1,
  days: [],
  ends_at: null,
};

/** `getDay()` dă 0 pentru duminică; `WEEK_DAYS` începe luni. */
const JS_DAY_TO_CODE: WeekDay[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function weekDayOf(date: Date): WeekDay {
  return JS_DAY_TO_CODE[date.getDay()];
}

/**
 * Parsează regula stocată. Întoarce ÎNTOTDEAUNA o regulă validă — un JSON rupt
 * sau o frecvență necunoscută nu au voie să trântească ecranul, iar editorul
 * are nevoie de valori pe care să le afișeze.
 */
export function parseRecurrence(rule: string | null | undefined): RecurrenceRule {
  if (!rule) return { ...DEFAULT_RECURRENCE };
  let parsed: Partial<RecurrenceRule>;
  try {
    parsed = JSON.parse(rule) as Partial<RecurrenceRule>;
  } catch {
    return { ...DEFAULT_RECURRENCE };
  }
  if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_RECURRENCE };

  const frequency: RecurrenceFrequency =
    parsed.frequency === 'daily' || parsed.frequency === 'monthly' || parsed.frequency === 'yearly'
      ? parsed.frequency
      : 'weekly';

  const days = Array.isArray(parsed.days)
    ? (parsed.days.filter((day): day is WeekDay =>
        WEEK_DAYS.includes(day as WeekDay)) as WeekDay[])
    : [];

  return {
    frequency,
    interval: Math.max(1, Math.min(99, Math.trunc(Number(parsed.interval)) || 1)),
    // Dedup + ordine stabilă: două UI-uri care bifează aceleași zile în altă
    // ordine trebuie să producă aceeași regulă.
    days: WEEK_DAYS.filter((day) => days.includes(day)),
    ends_at: typeof parsed.ends_at === 'string' && parsed.ends_at ? parsed.ends_at : null,
  };
}

function addDays(date: Date, n: number): Date {
  const out = new Date(date.getTime());
  out.setDate(out.getDate() + n);
  return out;
}

function addMonths(date: Date, n: number): Date {
  const out = new Date(date.getTime());
  const day = out.getDate();
  out.setDate(1);
  out.setMonth(out.getMonth() + n);
  // 31 ianuarie + 1 lună = 28/29 februarie, nu 2/3 martie.
  const lastDay = new Date(out.getFullYear(), out.getMonth() + 1, 0).getDate();
  out.setDate(Math.min(day, lastDay));
  return out;
}

/**
 * Următoarea ocurență STRICT după `base`.
 *
 * Pentru `weekly` cu zile bifate, saltul e la următoarea zi bifată — nu
 * „+interval×7". Bifele existau în editor din prima zi, dar nimeni nu le citea:
 * un task „în fiecare vineri" pus pe o zi de marți rămânea marțea, la infinit.
 */
export function nextOccurrence(base: Date, rule: RecurrenceRule): Date {
  switch (rule.frequency) {
    case 'daily':
      return addDays(base, rule.interval);
    case 'monthly':
      return addMonths(base, rule.interval);
    case 'yearly':
      return addMonths(base, rule.interval * 12);
    default: {
      if (rule.days.length === 0) return addDays(base, rule.interval * 7);
      const wanted = rule.days.map((day) => WEEK_DAYS.indexOf(day));
      const current = WEEK_DAYS.indexOf(weekDayOf(base));
      const ahead = wanted.filter((index) => index > current);
      if (ahead.length > 0) return addDays(base, Math.min(...ahead) - current);
      // Am epuizat săptămâna: sărim peste `interval - 1` săptămâni întregi și
      // reluăm de la prima zi bifată.
      const first = Math.min(...wanted);
      return addDays(base, 7 - current + first + (rule.interval - 1) * 7);
    }
  }
}

function toIsoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Zilele (ISO `YYYY-MM-DD`) în care taskul ar mai pica, între `from` și `to`.
 *
 * Ocurențele viitoare NU există ca rânduri — cea următoare se naște abia la
 * finalizarea celei curente (trigger-ul `hr_task_spawn_recurrence`). Deci
 * calendarul nu are ce afișa decât dacă le calculează el, ca previzualizare.
 */
export function occurrencesBetween(
  dueDate: Date,
  rule: RecurrenceRule,
  from: Date,
  to: Date,
  maxSteps = 200,
): string[] {
  const out: string[] = [];
  const endsAt = rule.ends_at ? new Date(`${rule.ends_at}T23:59:59`) : null;
  if (endsAt && Number.isNaN(endsAt.getTime())) return out;

  let cursor = dueDate;
  for (let step = 0; step < maxSteps; step++) {
    cursor = nextOccurrence(cursor, rule);
    if (cursor > to) break;
    if (endsAt && cursor > endsAt) break;
    if (cursor >= from) out.push(toIsoDay(cursor));
  }
  return out;
}

/**
 * Cheia de traducere + valorile pentru rezumatul citibil („La fiecare 2
 * săptămâni, Lu Mi"). Întoarce date, nu text: traducerea se face la randare.
 */
export function describeRecurrence(rule: RecurrenceRule): {
  key: string;
  count: number;
  days: WeekDay[];
} {
  return {
    key: `board.recurrence.summary.${rule.frequency}`,
    count: rule.interval,
    days: rule.frequency === 'weekly' ? rule.days : [],
  };
}
