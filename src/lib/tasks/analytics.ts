// Calculele dashboardului de task-uri.
//
// Tot ce e aici e pur: primește lista de task-uri deja încărcată și întoarce
// cifre. Nicio interogare, deci putem verifica în teste exact ce ne interesează
// (ex.: „rata de finalizare nu se raportează la task-uri care nici nu existau
// în perioada aleasă").

import { dueDay } from './grouping';
import type { BoardTask, TaskStatus } from './types';

export interface TaskKpis {
  total: number;
  done: number;
  open: number;
  overdue: number;
  unassigned: number;
  completionPct: number;
  /** Câte s-au finalizat în ultimele `windowDays` zile. */
  recentlyCompleted: number;
  /** Durata medie, în zile, de la creare la finalizare (doar cele finalizate). */
  avgCycleDays: number | null;
}

function isoDay(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function diffDays(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

export function computeKpis(
  tasks: BoardTask[],
  today: string,
  windowDays = 30,
): TaskKpis {
  const top = tasks.filter((task) => !task.parent_task_id);
  const windowStart = addDaysIso(today, -windowDays);

  let done = 0;
  let overdue = 0;
  let unassigned = 0;
  let recentlyCompleted = 0;
  let cycleSum = 0;
  let cycleCount = 0;

  for (const task of top) {
    const isDone = task.status === 'done';
    if (isDone) {
      done++;
      const completed = isoDay(task.completed_at);
      if (completed && completed >= windowStart && completed <= today) recentlyCompleted++;
      const created = isoDay(task.created_at);
      if (created && completed) {
        // Negativele apar doar din date inconsistente (import, backfill); le
        // ignorăm ca să nu tragă media în jos.
        const delta = diffDays(created, completed);
        if (delta >= 0) {
          cycleSum += delta;
          cycleCount++;
        }
      }
    } else {
      const due = dueDay(task);
      if (due && due < today) overdue++;
      if ((task.assignees ?? []).length === 0) unassigned++;
    }
  }

  return {
    total: top.length,
    done,
    open: top.length - done,
    overdue,
    unassigned,
    completionPct: top.length > 0 ? Math.round((done / top.length) * 100) : 0,
    recentlyCompleted,
    avgCycleDays: cycleCount > 0 ? Math.round((cycleSum / cycleCount) * 10) / 10 : null,
  };
}

export interface TrendPoint {
  /** „YYYY-MM-DD" */
  day: string;
  created: number;
  completed: number;
}

/** Serie zilnică creat/finalizat pentru graficul de tendință. */
export function completionTrend(
  tasks: BoardTask[],
  today: string,
  days = 30,
): TrendPoint[] {
  const series: Record<string, TrendPoint> = {};
  for (let i = days - 1; i >= 0; i--) {
    const day = addDaysIso(today, -i);
    series[day] = { day, created: 0, completed: 0 };
  }

  for (const task of tasks) {
    if (task.parent_task_id) continue;
    const created = isoDay(task.created_at);
    if (created && series[created]) series[created].created++;
    const completed = isoDay(task.completed_at);
    if (completed && series[completed]) series[completed].completed++;
  }

  return Object.values(series);
}

export interface PersonLoad {
  userId: string;
  open: number;
  overdue: number;
  done: number;
}

/**
 * Încărcarea fiecărei persoane. Un task cu doi responsabili se numără la
 * amândoi — e muncă pe care o au amândoi în cap, nu jumătate fiecare.
 */
export function loadByPerson(tasks: BoardTask[], today: string): PersonLoad[] {
  const map: Record<string, PersonLoad> = {};

  for (const task of tasks) {
    if (task.parent_task_id) continue;
    const people = task.assignees ?? [];
    if (people.length === 0) continue;
    const due = dueDay(task);
    const isDone = task.status === 'done';

    for (const userId of people) {
      const row = (map[userId] ??= { userId, open: 0, overdue: 0, done: 0 });
      if (isDone) row.done++;
      else {
        row.open++;
        if (due && due < today) row.overdue++;
      }
    }
  }

  return Object.values(map).sort((a, b) => b.open - a.open || b.overdue - a.overdue);
}

export interface BoardStat {
  boardId: string;
  total: number;
  done: number;
  overdue: number;
  pct: number;
}

export function statsByBoard(tasks: BoardTask[], today: string): BoardStat[] {
  const map: Record<string, BoardStat> = {};

  for (const task of tasks) {
    if (task.parent_task_id || !task.board_id) continue;
    const row = (map[task.board_id] ??= {
      boardId: task.board_id,
      total: 0,
      done: 0,
      overdue: 0,
      pct: 0,
    });
    row.total++;
    if (task.status === 'done') row.done++;
    else {
      const due = dueDay(task);
      if (due && due < today) row.overdue++;
    }
  }

  for (const row of Object.values(map)) {
    row.pct = row.total > 0 ? Math.round((row.done / row.total) * 100) : 0;
  }
  return Object.values(map).sort((a, b) => b.total - a.total);
}

export function countByStatus(tasks: BoardTask[]): Record<TaskStatus, number> {
  const out: Record<TaskStatus, number> = { todo: 0, in_progress: 0, pending: 0, done: 0 };
  for (const task of tasks) {
    if (task.parent_task_id) continue;
    if (out[task.status] !== undefined) out[task.status]++;
  }
  return out;
}

/** Ce expiră în următoarele `days` zile — panoul „la risc". */
export function dueSoon(tasks: BoardTask[], today: string, days = 7): BoardTask[] {
  const limit = addDaysIso(today, days);
  return tasks
    .filter((task) => {
      if (task.parent_task_id || task.status === 'done') return false;
      const due = dueDay(task);
      return !!due && due >= today && due <= limit;
    })
    .sort((a, b) => (dueDay(a) ?? '').localeCompare(dueDay(b) ?? ''));
}

/**
 * Task-urile care așteaptă semnătura cuiva anume. Filtrul e pe APROBATOR, nu pe
 * responsabil — sunt două roluri diferite pe același task, iar cine execută nu
 * poate închide singur un task cu aprobatori (gardul e în DB).
 */
export function pendingApprovalsFor(tasks: BoardTask[], userId: string): BoardTask[] {
  return tasks.filter(
    (task) =>
      task.status !== 'done' &&
      !task.parent_task_id &&
      (task.approver_ids ?? []).includes(userId),
  );
}
