// Limbajul vizual comun al modulului de task-uri: statusuri, priorități,
// culori de coloană, avatare. Un singur loc, ca un card din Kanban, un rând din
// Listă și un chip din Calendar să arate la fel.
//
// Culorile de coloană folosesc paleta pastel din `index.css` (tokens semantice,
// nu hex hardcodat) — aceeași convenție ca restul produsului.

import type { TaskPriority, TaskStatus } from "./types";

/**
 * Limbajul vizual al statusurilor.
 *
 * `columnBg` tintează COLOANA ÎNTREAGĂ, nu doar bulina din antet: la o privire
 * peste board vezi imediat unde se adună munca, fără să citești titlurile.
 * `headerChip` e pastila colorată cu numele coloanei — numărul stă în afara ei,
 * gri, ca să nu concureze cu numele.
 *
 * Nuanțele sunt foarte deschise intenționat (`-50`): cardurile sunt albe și
 * trebuie să rămână ele elementul citit, nu fundalul.
 */
export const STATUS_META: Record<
  TaskStatus,
  { dot: string; chip: string; bar: string; columnBg: string; headerChip: string }
> = {
  todo: {
    dot: "bg-slate-400",
    chip: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    bar: "bg-slate-400",
    columnBg: "bg-sky-50/70 dark:bg-sky-950/25",
    headerChip: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
  },
  in_progress: {
    dot: "bg-blue-500",
    chip: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
    bar: "bg-blue-500",
    columnBg: "bg-amber-50/70 dark:bg-amber-950/25",
    headerChip: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  },
  pending: {
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
    bar: "bg-amber-500",
    columnBg: "bg-violet-50/70 dark:bg-violet-950/25",
    headerChip: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200",
  },
  done: {
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
    bar: "bg-emerald-500",
    columnBg: "bg-emerald-50/70 dark:bg-emerald-950/25",
    headerChip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
  },
};

/**
 * Aceleași două fețe pentru coloanele definite de utilizator pe un board.
 * Culoarea aleasă la crearea coloanei (`hr_task_lists.color`) era folosită
 * până acum doar pentru o bulină de 10px — acum îmbracă toată coloana.
 */
const LIST_TONES: Record<string, { columnBg: string; headerChip: string }> = {
  "pastel-sky": {
    columnBg: "bg-sky-50/70 dark:bg-sky-950/25",
    headerChip: "bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-200",
  },
  "pastel-mint": {
    columnBg: "bg-emerald-50/70 dark:bg-emerald-950/25",
    headerChip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200",
  },
  "pastel-lavender": {
    columnBg: "bg-violet-50/70 dark:bg-violet-950/25",
    headerChip: "bg-violet-100 text-violet-800 dark:bg-violet-950/60 dark:text-violet-200",
  },
  "pastel-peach": {
    columnBg: "bg-orange-50/70 dark:bg-orange-950/25",
    headerChip: "bg-orange-100 text-orange-900 dark:bg-orange-950/60 dark:text-orange-200",
  },
  "pastel-rose": {
    columnBg: "bg-rose-50/70 dark:bg-rose-950/25",
    headerChip: "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200",
  },
  "pastel-lemon": {
    columnBg: "bg-amber-50/70 dark:bg-amber-950/25",
    headerChip: "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200",
  },
  "pastel-teal": {
    columnBg: "bg-teal-50/70 dark:bg-teal-950/25",
    headerChip: "bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-200",
  },
};

export function listTone(color: string | null | undefined): {
  columnBg: string;
  headerChip: string;
} {
  return LIST_TONES[color ?? ""] ?? LIST_TONES["pastel-sky"];
}

// Nuanțele de text sunt 700, nu 600: pe fundalurile pastel de aici, `600` dă
// 3,35 (portocaliu) și 4,41 (roșu) — sub pragul WCAG AA de 4,5 pentru text mic.
// Găsit cu auditul de contrast din simularea E2E (09-09-2026).
export const PRIORITY_META: Record<TaskPriority, { chip: string; flag: string; rank: number }> = {
  low: {
    chip: "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700",
    flag: "text-slate-400",
    rank: 3,
  },
  medium: {
    chip: "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900",
    flag: "text-blue-500",
    rank: 2,
  },
  high: {
    chip: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-900",
    flag: "text-orange-500",
    rank: 1,
  },
  urgent: {
    chip: "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900",
    flag: "text-red-500",
    rank: 0,
  },
};

/** Culorile disponibile pentru coloane și boarduri (tokens din index.css). */
export const BOARD_COLORS = [
  "pastel-sky",
  "pastel-mint",
  "pastel-lavender",
  "pastel-peach",
  "pastel-rose",
  "pastel-lemon",
  "pastel-teal",
] as const;
export type BoardColor = (typeof BOARD_COLORS)[number];

export function boardColorClass(color: string | null | undefined): string {
  return (BOARD_COLORS as readonly string[]).includes(color ?? "") ? (color as string) : "pastel-sky";
}

/** Culoarea unui board în listele compacte — derivată stabil din id. */
const DOT_PALETTE = [
  "bg-sky-400",
  "bg-emerald-400",
  "bg-violet-400",
  "bg-amber-400",
  "bg-rose-400",
  "bg-teal-400",
  "bg-indigo-400",
  "bg-orange-400",
];

function hash(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return h;
}

export function boardDotClass(boardId: string): string {
  return DOT_PALETTE[hash(boardId) % DOT_PALETTE.length];
}

const AVATAR_PALETTE = [
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300",
  "bg-pink-100 text-pink-700 dark:bg-pink-950/60 dark:text-pink-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300",
  "bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300",
  "bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300",
];

export function avatarClass(userId: string): string {
  return AVATAR_PALETTE[hash(userId) % AVATAR_PALETTE.length];
}

export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Accentul pentru termene depășite — folosit identic în toate vederile. */
// `red-600` pe fundalul roșu-pastel al grupului „Restante" dă 4,41 — sub pragul
// WCAG AA. `red-700` urcă la 5,91 și rămâne lizibil și pe alb.
export const OVERDUE_TEXT = "text-red-700 dark:text-red-400";
