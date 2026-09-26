import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RECURRENCE,
  nextOccurrence,
  occurrencesBetween,
  parseRecurrence,
  weekDayOf,
} from '../recurrence';

// Ancoră: 11 septembrie 2026 e o VINERI.
const vineri = () => new Date(2026, 8, 11, 12, 0, 0);
const zi = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('parseRecurrence', () => {
  it('întoarce implicitul pentru null, JSON rupt sau frecvență necunoscută', () => {
    expect(parseRecurrence(null)).toEqual(DEFAULT_RECURRENCE);
    expect(parseRecurrence('{ nu e json')).toEqual(DEFAULT_RECURRENCE);
    expect(parseRecurrence('{"frequency":"la doi ani"}').frequency).toBe('weekly');
  });

  it('mărginește intervalul și curăță zilele necunoscute', () => {
    const r = parseRecurrence('{"frequency":"weekly","interval":999,"days":["fri","luni",""]}');
    expect(r.interval).toBe(99);
    expect(r.days).toEqual(['fri']);
    expect(parseRecurrence('{"interval":0}').interval).toBe(1);
  });

  it('normalizează ordinea zilelor, ca două UI-uri să producă aceeași regulă', () => {
    expect(parseRecurrence('{"days":["fri","mon"]}').days).toEqual(['mon', 'fri']);
    expect(parseRecurrence('{"days":["mon","fri"]}').days).toEqual(['mon', 'fri']);
  });
});

describe('nextOccurrence', () => {
  it('zilnic și lunar respectă intervalul', () => {
    expect(zi(nextOccurrence(vineri(), { frequency: 'daily', interval: 3, days: [] }))).toBe('2026-09-14');
    expect(zi(nextOccurrence(vineri(), { frequency: 'monthly', interval: 1, days: [] }))).toBe('2026-10-11');
  });

  it('lunar nu sare peste februarie: 31 ian + 1 lună = 28 feb', () => {
    const ian31 = new Date(2027, 0, 31, 12);
    expect(zi(nextOccurrence(ian31, { frequency: 'monthly', interval: 1, days: [] }))).toBe('2027-02-28');
  });

  it('săptămânal fără zile bifate păstrează ziua săptămânii', () => {
    const next = nextOccurrence(vineri(), { frequency: 'weekly', interval: 1, days: [] });
    expect(zi(next)).toBe('2026-09-18');
    expect(weekDayOf(next)).toBe('fri');
  });

  it('săptămânal CU zile bifate sare pe ziua bifată, nu peste 7 zile', () => {
    // Bug real: bifele existau în editor, dar motorul aduna doar interval × 7,
    // deci „în fiecare luni" pus pe o vineri rămânea vineri la infinit.
    const next = nextOccurrence(vineri(), { frequency: 'weekly', interval: 1, days: ['mon'] });
    expect(zi(next)).toBe('2026-09-14');
    expect(weekDayOf(next)).toBe('mon');
  });

  it('mai multe zile bifate dau mai multe ocurențe pe săptămână', () => {
    const rule = { frequency: 'weekly' as const, interval: 1, days: ['mon' as const, 'wed' as const] };
    const luni = nextOccurrence(vineri(), rule);
    const miercuri = nextOccurrence(luni, rule);
    expect([zi(luni), zi(miercuri)]).toEqual(['2026-09-14', '2026-09-16']);
    expect(zi(nextOccurrence(miercuri, rule))).toBe('2026-09-21');
  });

  it('la interval > 1 sare săptămânile întregi, dar nu în interiorul aceleiași săptămâni', () => {
    const rule = { frequency: 'weekly' as const, interval: 2, days: ['mon' as const, 'wed' as const] };
    expect(zi(nextOccurrence(new Date(2026, 8, 14, 12), rule))).toBe('2026-09-16');
    expect(zi(nextOccurrence(new Date(2026, 8, 16, 12), rule))).toBe('2026-09-28');
  });
});

describe('occurrencesBetween', () => {
  it('listează zilele viitoare din interval, fără ziua de pornire', () => {
    const zile = occurrencesBetween(
      vineri(),
      { frequency: 'weekly', interval: 1, days: ['fri'] },
      new Date(2026, 8, 1),
      new Date(2026, 8, 30),
    );
    expect(zile).toEqual(['2026-09-18', '2026-09-25']);
  });

  it('se oprește la `ends_at`', () => {
    const zile = occurrencesBetween(
      vineri(),
      { frequency: 'weekly', interval: 1, days: ['fri'], ends_at: '2026-09-18' },
      new Date(2026, 8, 1),
      new Date(2026, 11, 31),
    );
    expect(zile).toEqual(['2026-09-18']);
  });

  it('are o plasă de siguranță: o regulă densă nu blochează randarea calendarului', () => {
    const zile = occurrencesBetween(
      vineri(),
      { frequency: 'daily', interval: 1, days: [] },
      new Date(2026, 8, 1),
      new Date(2030, 0, 1),
      10,
    );
    expect(zile).toHaveLength(10);
  });
});
