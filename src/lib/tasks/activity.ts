// Citirea unei intrări din jurnalul de activitate.
//
// Triggerul `hr_task_record_activity` scrie de la început `from_value` și
// `to_value` pentru fiecare schimbare — dar interfața le arunca și afișa doar
// verbul: „a schimbat responsabilii", fără să spună PE CINE a adăugat, sau
// „a schimbat statusul", fără din ce în ce. Adică jurnalul exista, dar nu
// răspundea la întrebarea pentru care există un jurnal.
//
// Funcția e pură și întoarce DATE, nu text: numele de oameni, de coloane și de
// boarduri se rezolvă la randare, ca traducerea (regula #15 din CLAUDE.md —
// identificator stabil în date, etichetă la afișare).

import type { TaskActivity, TaskActivityAction } from './types';

export interface ActivityReading {
  /** Sufixul cheii de traducere: `board.activity.<key>`. */
  key: string;
  /** Pentru `assignees_changed`: cine a intrat și cine a ieșit. */
  added: string[];
  removed: string[];
  /** Valorile brute, normalizate. Pentru coloane/boarduri sunt id-uri. */
  from: string | null;
  to: string | null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function asScalar(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

const PLAIN: TaskActivityAction[] = ['created', 'deleted', 'description_changed'];

export function readActivity(entry: Pick<TaskActivity, 'action' | 'from_value' | 'to_value'>): ActivityReading {
  const gol: ActivityReading = { key: entry.action, added: [], removed: [], from: null, to: null };

  if (entry.action === 'assignees_changed') {
    const inainte = asStringArray(entry.from_value);
    const dupa = asStringArray(entry.to_value);
    const added = dupa.filter((id) => !inainte.includes(id));
    const removed = inainte.filter((id) => !dupa.includes(id));
    // Trei propoziții diferite, nu una singură cu „a schimbat": cel mai des se
    // adaugă o singură persoană, iar aceea e chiar informația căutată.
    const key =
      added.length > 0 && removed.length === 0
        ? 'assignees_added'
        : removed.length > 0 && added.length === 0
          ? 'assignees_removed'
          : 'assignees_changed';
    return { ...gol, key, added, removed };
  }

  if (PLAIN.includes(entry.action)) return gol;

  const from = asScalar(entry.from_value);
  const to = asScalar(entry.to_value);

  if (entry.action === 'due_date_changed') {
    const key = !from && to ? 'due_date_set' : from && !to ? 'due_date_cleared' : 'due_date_changed';
    return { ...gol, key, from, to };
  }

  return { ...gol, from, to };
}

/**
 * Grupează intrările pe zi, ca timeline-ul să aibă capete de secțiune în loc de
 * o listă plată în care fiecare rând își repetă data. Ordinea rămâne cea primită.
 */
export function groupActivityByDay<T extends { created_at: string }>(
  entries: T[],
): { day: string; entries: T[] }[] {
  const out: { day: string; entries: T[] }[] = [];
  for (const entry of entries) {
    const day = entry.created_at.slice(0, 10);
    const last = out[out.length - 1];
    if (last && last.day === day) last.entries.push(entry);
    else out.push({ day, entries: [entry] });
  }
  return out;
}
