// Filtrare + sortare pentru vederile de task-uri (Toate task-urile, Taskurile
// mele, board). Totul e pur și client-side peste setul deja încărcat, ca să
// putem testa comportamentul fără DB și ca schimbarea unui filtru să nu coste
// un roundtrip.
//
// Etichetele NU stau aici — se traduc în UI prin `t()`; aici rămân doar cheile.

import { dueDay } from './grouping';
import type { BoardTask, TaskPriority, TaskStatus } from './types';

export const PERIOD_PRESETS = [
  'all',
  'overdue',
  'today',
  'tomorrow',
  'week',
  'month',
  'nodate',
  'custom',
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

/**
 * Sentinelă pentru „doar task-urile personale" (`board_id IS NULL`).
 *
 * `boardId: null` înseamnă deja „toate boardurile", deci absența unui board nu
 * se putea exprima: un om cu task-uri personale nu avea cum să le izoleze, iar
 * selectorul nici măcar nu oferea opțiunea.
 */
export const PERSONAL_BOARD_FILTER = '__personal__';

export interface TaskFilterState {
  /** id de board, `PERSONAL_BOARD_FILTER` pentru cele fără board, `null` = toate. */
  boardId?: string | null;
  /** user_id al responsabilului (caută și în `assignees`). */
  person?: string | null;
  status?: TaskStatus | null;
  priority?: TaskPriority | null;
  /** eticheta, comparată case-insensitive pe partea de label. */
  tag?: string | null;
  period?: PeriodPreset;
  /** doar pentru `period === 'custom'`, ISO „YYYY-MM-DD", inclusive. */
  from?: string | null;
  to?: string | null;
  search?: string | null;
  /** implicit ascundem sub-taskurile din listele plate (apar sub părinte). */
  includeSubtasks?: boolean;
  /** implicit ascundem ce e gata în vederile de lucru. */
  includeDone?: boolean;
}

export const EMPTY_FILTERS: TaskFilterState = { period: 'all' };

export function activeFilterCount(f: TaskFilterState): number {
  let n = 0;
  if (f.boardId) n++;
  if (f.person) n++;
  if (f.status) n++;
  if (f.priority) n++;
  if (f.tag) n++;
  if (f.period && f.period !== 'all') n++;
  if (f.search && f.search.trim()) n++;
  return n;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function matchesPeriod(task: BoardTask, f: TaskFilterState, today: string): boolean {
  const period = f.period ?? 'all';
  if (period === 'all') return true;

  const day = dueDay(task);
  if (period === 'nodate') return !day;
  if (!day) return false;

  switch (period) {
    case 'overdue':
      return day < today && task.status !== 'done';
    case 'today':
      return day === today;
    case 'tomorrow':
      return day === addDaysIso(today, 1);
    case 'week':
      return day >= today && day <= addDaysIso(today, 7);
    case 'month':
      return day.slice(0, 7) === today.slice(0, 7);
    case 'custom':
      if (f.from && day < f.from) return false;
      if (f.to && day > f.to) return false;
      return true;
    default:
      return true;
  }
}

function matchesPerson(task: BoardTask, person: string): boolean {
  if (task.assigned_to === person) return true;
  return Array.isArray(task.assignees) && task.assignees.includes(person);
}

/**
 * Cheia de căutare: minuscule ȘI fără diacritice. Produsul e în română, iar
 * oamenii tastează fără diacritice — „plata" trebuie să găsească „plată".
 * NFD desparte litera de semnul combinant, apoi îl aruncăm.
 */
export function searchKey(raw: string): string {
  return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

/** Eticheta stocată e „label" sau „label|culoare" — comparăm doar label-ul. */
function tagLabel(raw: string): string {
  const i = raw.lastIndexOf('|');
  return (i === -1 ? raw : raw.slice(0, i)).trim().toLowerCase();
}

export function filterTasks(
  tasks: BoardTask[],
  f: TaskFilterState,
  today: string,
): BoardTask[] {
  const wantedTag = f.tag ? tagLabel(f.tag) : null;
  const needle = f.search?.trim() ? searchKey(f.search.trim()) : '';

  return tasks.filter((t) => {
    if (!f.includeSubtasks && t.parent_task_id) return false;
    if (!f.includeDone && t.status === 'done' && f.status !== 'done') return false;
    if (f.boardId === PERSONAL_BOARD_FILTER) {
      if (t.board_id) return false;
    } else if (f.boardId && t.board_id !== f.boardId) return false;
    if (f.person && !matchesPerson(t, f.person)) return false;
    if (f.status && t.status !== f.status) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (wantedTag && !(t.tags ?? []).some((raw) => tagLabel(raw) === wantedTag)) return false;
    if (needle) {
      const haystack = searchKey(`${t.title} ${t.description ?? ''} ${t.task_set ?? ''}`);
      if (!haystack.includes(needle)) return false;
    }
    if (!matchesPeriod(t, f, today)) return false;
    return true;
  });
}

// Sortarea a fost mutată în `./sorting.ts`, ca sursă UNICĂ.
//
// Varianta care stătea aici nu avea direcție (doar crescător), nu putea sorta pe
// responsabil, avea un parametru mort (`boardNameById`, terminat cu `void`) și
// — mai grav — compara titlurile cu `localeCompare(…, 'ro')` hardcodat, deci
// ordona alfabetul rusesc după regulile românei. Două funcții care răspund la
// aceeași întrebare înseamnă că una va fi folosită cu înțelesul celeilalte
// (CLAUDE.md #20), așa că a rămas una singură.

/** Câte task-uri are fiecare responsabil — bara de încărcare a echipei. */
export function workloadByAssignee(tasks: BoardTask[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of tasks) {
    if (t.status === 'done') continue;
    const people = t.assignees?.length ? t.assignees : t.assigned_to ? [t.assigned_to] : [];
    if (people.length === 0) {
      out.__unassigned = (out.__unassigned ?? 0) + 1;
      continue;
    }
    for (const p of people) out[p] = (out[p] ?? 0) + 1;
  }
  return out;
}

/**
 * Curăță textul înainte de a ajunge într-un filtru PostgREST. Virgulele și
 * parantezele au înțeles în sintaxa de filtru: o căutare după „raport (Q3)"
 * nu întoarce zero rezultate, ci o eroare 400. Sub două caractere nu căutăm
 * deloc — un singur caracter ar aduce jumătate din bază.
 */
export function sanitizeSearchQuery(raw: string): string | null {
  const clean = raw.trim().replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length >= 2 ? clean : null;
}

/**
 * Câte task-uri au fost PLANIFICATE (generate dintr-un șablon) și câte au apărut
 * ad-hoc. E raportarea pe care o cere managerul: cât din muncă e prevăzută și
 * cât apare pe parcurs. Sub-taskurile nu se numără — moștenesc contextul
 * părintelui și ar dubla cifrele.
 */
export function plannedAdhocCounts(tasks: BoardTask[]): { planned: number; adhoc: number } {
  let planned = 0;
  let adhoc = 0;
  for (const task of tasks) {
    if (task.parent_task_id) continue;
    if (task.source_template_id || task.source_module === 'template') planned++;
    else adhoc++;
  }
  return { planned, adhoc };
}

export interface TaskSetProgress {
  name: string;
  done: number;
  total: number;
  percent: number;
}

/** Progresul sub-inițiativelor unui board; subtaskurile nu dublează totalul. */
export function taskSetProgress(tasks: BoardTask[]): TaskSetProgress[] {
  const groups: Record<string, { done: number; total: number }> = {};
  for (const task of tasks) {
    const name = task.task_set?.trim();
    if (!name || task.parent_task_id) continue;
    const group = (groups[name] ??= { done: 0, total: 0 });
    group.total++;
    if (task.status === 'done') group.done++;
  }
  return Object.entries(groups)
    .map(([name, value]) => ({
      name,
      ...value,
      percent: value.total === 0 ? 0 : Math.round((value.done / value.total) * 100),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
