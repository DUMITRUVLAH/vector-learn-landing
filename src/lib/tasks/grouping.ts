// Gruparea „Taskurile mele" pe secțiuni de termen.
//
// Aritmetica e pur pe stringuri ISO „YYYY-MM-DD" și UTC: un `new Date()` local
// urmat de `toISOString()` mută granița zilei cu 24h în fusurile non-UTC, iar
// „Azi" devine „Restant" pentru jumătate din utilizatori.

import type { BoardTask } from "./types";

export const DUE_BUCKETS = ["overdue", "today", "week", "later", "unscheduled"] as const;
export type DueBucket = (typeof DUE_BUCKETS)[number];

/** „YYYY-MM-DD" pentru ziua locală curentă (fără deplasare de fus). */
export function todayIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Partea de dată dintr-un timestamp (hr_tasks.due_date e `timestamptz`). */
export function dueDay(task: Pick<BoardTask, "due_date">): string | null {
  return task.due_date ? task.due_date.slice(0, 10) : null;
}

/**
 * O dată aleasă dintr-un date-picker (miezul nopții local) → ISO timestamptz
 * ancorat la ora 12:00 local. Fără asta, `.toISOString()` direct pe o dată la
 * 00:00 local traversează granița UTC și `dueDay()` citește ziua precedentă
 * în fusurile cu offset pozitiv (România/Moldova).
 */
export function toDueDateIso(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return new Date(`${y}-${m}-${d}T12:00:00`).toISOString();
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Restante / Azi / Săptămâna asta / Mai târziu / Fără termen.
 * Ca în Asana, task-urile gata nu apar deloc — „Taskurile mele" e o listă de
 * lucru, nu un istoric.
 */
export function groupTasksByDue(tasks: BoardTask[], today: string): Record<DueBucket, BoardTask[]> {
  const weekEnd = addDaysIso(today, 7);
  const out: Record<DueBucket, BoardTask[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    unscheduled: [],
  };

  for (const t of tasks) {
    if (t.status === "done") continue;
    const day = dueDay(t);
    if (!day) out.unscheduled.push(t);
    else if (day < today) out.overdue.push(t);
    else if (day === today) out.today.push(t);
    else if (day <= weekEnd) out.week.push(t);
    else out.later.push(t);
  }
  return out;
}

/** Restant = are termen depășit și nu e gata. Folosit pentru accentul roșu. */
export function isOverdue(task: BoardTask, today: string): boolean {
  const day = dueDay(task);
  return !!day && day < today && task.status !== "done";
}

/** Progresul unui set de task-uri, pentru barele de pe board/prezentare. */
export function progressOf(tasks: BoardTask[]): {
  total: number;
  done: number;
  pct: number;
  byStatus: Record<string, number>;
} {
  const byStatus: Record<string, number> = {};
  let done = 0;
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] ?? 0) + 1;
    if (t.status === "done") done++;
  }
  return {
    total: tasks.length,
    done,
    pct: tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0,
    byStatus,
  };
}

/**
 * Câte subtask-uri are fiecare părinte și câte sunt gata.
 *
 * Se DERIVĂ din setul deja încărcat (`parent_task_id`), nu se cere separat:
 * board-ul, „Taskurile mele" și „Toate task-urile" citesc oricum și
 * subtask-urile — le ascund doar din listele plate. O interogare de contorizare
 * ar fi însemnat o a doua sursă pentru același fapt (CLAUDE.md #20) și un
 * roundtrip în plus pe fiecare ecran.
 *
 * Cheia lipsește pentru task-urile fără subtask-uri: apelantul afișează
 * indicatorul doar când există, deci `?? null` e răspunsul corect, nu `{0,0}`.
 */
export function subtaskCounts(
  tasks: Pick<BoardTask, "id" | "parent_task_id" | "status">[],
): Record<string, { done: number; total: number }> {
  const out: Record<string, { done: number; total: number }> = {};
  for (const task of tasks) {
    const parent = task.parent_task_id;
    if (!parent) continue;
    const entry = (out[parent] ??= { done: 0, total: 0 });
    entry.total++;
    if (task.status === "done") entry.done++;
  }
  return out;
}
