// Aranjarea barelor pe axa Gantt.
//
// Toată aritmetica e pe stringuri ISO „YYYY-MM-DD" în UTC, ca peste tot în
// modul: un `new Date()` local ar deplasa barele cu o zi în funcție de fusul
// celui care se uită la ele.
//
// Un task intră pe axă dacă are cel puțin o dată. Cu ambele → bară de la start
// la termen. Cu una singură → bară de o zi (nu presupunem durata). Milestone →
// romb, fără lățime.

import { dueDay } from "./grouping";
import type { BoardTask } from "./types";

export interface GanttRow {
  task: BoardTask;
  /** „YYYY-MM-DD" */
  from: string;
  to: string;
  /** poziția și lățimea în COLOANE (zile) față de începutul intervalului */
  offsetDays: number;
  spanDays: number;
  isMilestone: boolean;
}

export interface GanttLayout {
  /** Intervalul acoperit, inclusiv la ambele capete. */
  from: string;
  to: string;
  totalDays: number;
  rows: GanttRow[];
  /** Task-urile fără nicio dată — nu au ce căuta pe axă, dar nu le pierdem. */
  undated: BoardTask[];
}

export function isoOf(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Construiește layout-ul. `padDays` lărgește intervalul la capete ca barele să
 * nu fie lipite de marginile graficului.
 */
export function buildGanttLayout(
  tasks: BoardTask[],
  opts: {
    padDays?: number;
    today?: string;
    /**
     * Păstrează ordinea în care au venit task-urile, în loc s-o impună pe cea
     * cronologică. Se folosește când utilizatorul a ales explicit o sortare:
     * altfel ar apăsa „sortează după prioritate" și n-ar vedea nicio schimbare,
     * fiindcă Ganttul își rearanja singur rândurile.
     */
    preserveOrder?: boolean;
  } = {},
): GanttLayout {
  const pad = opts.padDays ?? 2;
  const dated: { task: BoardTask; from: string; to: string }[] = [];
  const undated: BoardTask[] = [];

  for (const task of tasks) {
    if (task.parent_task_id) continue;
    const start = isoOf(task.start_date);
    const due = dueDay(task);
    if (!start && !due) {
      undated.push(task);
      continue;
    }
    // O singură dată = reper de o zi. A inventa o durată („o săptămână de la
    // start") ar desena un plan pe care nimeni nu l-a stabilit.
    const from = start ?? (due as string);
    const to = due ?? (start as string);
    dated.push({ task, from: from <= to ? from : to, to: from <= to ? to : from });
  }

  if (dated.length === 0) {
    const today = opts.today ?? new Date().toISOString().slice(0, 10);
    return { from: today, to: today, totalDays: 1, rows: [], undated };
  }

  let min = dated[0].from;
  let max = dated[0].to;
  for (const item of dated) {
    if (item.from < min) min = item.from;
    if (item.to > max) max = item.to;
  }
  const from = addDays(min, -pad);
  const to = addDays(max, pad);

  const rows: GanttRow[] = dated
    .map(({ task, from: f, to: t }) => ({
      task,
      from: f,
      to: t,
      offsetDays: daysBetween(from, f),
      spanDays: daysBetween(f, t) + 1,
      isMilestone: task.is_milestone === true,
    }))
    .sort((a, b) =>
      opts.preserveOrder ? 0 : a.from.localeCompare(b.from) || a.task.title.localeCompare(b.task.title),
    );

  return { from, to, totalDays: daysBetween(from, to) + 1, rows, undated };
}

/** Marcajele de lună de pe antet: prima zi vizibilă a fiecărei luni. */
export function monthTicks(from: string, totalDays: number): { iso: string; offsetDays: number }[] {
  const ticks: { iso: string; offsetDays: number }[] = [];
  let seen = "";
  for (let i = 0; i < totalDays; i++) {
    const iso = addDays(from, i);
    const month = iso.slice(0, 7);
    if (month !== seen) {
      ticks.push({ iso, offsetDays: i });
      seen = month;
    }
  }
  return ticks;
}
