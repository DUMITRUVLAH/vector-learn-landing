// Sortarea și gruparea task-urilor — pur, deci testabil.
//
// Până acum TOATE vederile sortau pe `position` (ordinea manuală din Kanban) și
// nimic altceva: nu se putea răspunde la „ce e cel mai urgent" fără să citești
// tot ecranul. `position` rămâne ordinea IMPLICITĂ — e singura pe care o
// controlează omul cu mâna — dar acum e una dintre opțiuni, nu singura.
//
// Regula care ține totul: sortarea NU are voie să depindă de limba interfeței.
// Prioritatea se ordonează după rangul ei din `PRIORITY_RANK`, nu alfabetic
// după eticheta tradusă — altfel „urgent/ridicat/mediu/scăzut" ar ieși în altă
// ordine în rusă decât în română, pe aceleași date (aceeași lecție ca la
// simbolurile de pontaj, CLAUDE.md #18).

import type { BoardTask, TaskPriority, TaskStatus } from './types';
import { dueDay } from './grouping';

export const SORT_KEYS = [
  'manual',
  'due_date',
  'priority',
  'title',
  'status',
  'assignee',
  'created_at',
] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export type SortDir = 'asc' | 'desc';

export interface SortState {
  key: SortKey;
  dir: SortDir;
}

export const DEFAULT_SORT: SortState = { key: 'manual', dir: 'asc' };

/**
 * Curăță o stare de sortare venită dintr-o VEDERE SALVATĂ.
 *
 * Preferințele se salvează în DB și supraviețuiesc schimbărilor de formă: o vedere scrisă
 * înainte ca sortarea să existe (sau cu o cheie scoasă de-atunci) se întorcea ca
 * `{ dir: 'asc' }`, iar butonul afișa literal `sort.undefined` — i18next nu găsea cheia
 * și a scris-o pe ecran (raportat 10-09-2026).
 *
 * Regula generală: o valoare persistată se VALIDEAZĂ la citire, nu se presupune. Aici e
 * ieftin — două verificări de apartenență la o listă.
 */
export function normalizeSort(raw: unknown): SortState {
  const value = (raw ?? {}) as Partial<SortState>;
  const key = SORT_KEYS.includes(value.key as SortKey) ? (value.key as SortKey) : DEFAULT_SORT.key;
  const dir = value.dir === 'asc' || value.dir === 'desc' ? value.dir : DEFAULT_SORT.dir;
  return { key, dir };
}


/** Urgent primul. Rang numeric, nu etichetă — vezi nota de sus. */
const PRIORITY_RANK: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** Ordinea firească a fluxului de lucru, nu cea alfabetică. */
const STATUS_RANK: Record<TaskStatus, number> = {
  todo: 0,
  in_progress: 1,
  pending: 2,
  done: 3,
};

export interface SortContext {
  /** id → nume, pentru sortarea pe responsabil. */
  names?: Record<string, string>;
}

/**
 * Cheia de comparație a unui task pentru o coloană dată.
 *
 * `null` înseamnă „lipsește valoarea" și e tratat separat: un task FĂRĂ termen
 * nu e „cel mai devreme", ci ultimul, în ambele direcții de sortare. Altfel,
 * inversând ordinea, utilizatorul ar primi în capul listei exact task-urile
 * despre care nu se știe nimic — și ar crede că a stricat filtrul.
 */
function sortValue(task: BoardTask, key: SortKey, ctx: SortContext): string | number | null {
  switch (key) {
    case 'manual':
      return task.position ?? 0;
    case 'due_date':
      return dueDay(task);
    case 'priority':
      return PRIORITY_RANK[task.priority] ?? 99;
    case 'status':
      return STATUS_RANK[task.status] ?? 99;
    case 'title':
      // `localeCompare` se aplică mai jos; aici doar normalizăm pentru „gol".
      return task.title?.trim() ? task.title : null;
    case 'assignee': {
      const first = (task.assignees ?? [])[0];
      if (!first) return null;
      return ctx.names?.[first] ?? null;
    }
    case 'created_at':
      return task.created_at ?? null;
    default:
      return null;
  }
}

/**
 * Sortare stabilă.
 *
 * `Array.prototype.sort` e stabil în toate motoarele moderne, deci la valori
 * egale se păstrează ordinea de intrare — care e `position`, adică aranjarea
 * manuală. Sortând pe prioritate, cardurile de aceeași prioritate rămân în
 * ordinea în care le-a pus omul pe board; e exact ce se așteaptă și e gratis.
 */
export function sortTasks(
  tasks: BoardTask[],
  sort: SortState,
  ctx: SortContext = {},
): BoardTask[] {
  const sign = sort.dir === 'desc' ? -1 : 1;

  return [...tasks].sort((a, b) => {
    const va = sortValue(a, sort.key, ctx);
    const vb = sortValue(b, sort.key, ctx);

    // Valorile lipsă cad mereu la coadă, indiferent de direcție.
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;

    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sign;
    // `localeCompare` fără forțarea unei limbi: folosește locale-ul rulării, deci
    // „Ș" se așază unde trebuie și în română, și în rusă.
    return String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' }) * sign;
  });
}

/** Direcția implicită a fiecărei coloane, la primul clic pe antet. */
export function defaultDirFor(key: SortKey): SortDir {
  // Pentru termen și prioritate, „cel mai presant întâi" e ce vrea oricine —
  // adică ascendent pe rang. Pentru „creat", cel mai nou întâi.
  return key === 'created_at' ? 'desc' : 'asc';
}

/** Următoarea stare la clic pe antetul unei coloane. */
export function toggleSort(current: SortState, key: SortKey): SortState {
  if (current.key !== key) return { key, dir: defaultDirFor(key) };
  if (current.dir === defaultDirFor(key)) {
    return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  }
  // Al treilea clic scoate sortarea și readuce ordinea manuală.
  return { ...DEFAULT_SORT };
}

// ═══════════════════════════════════════════════════════════════════════════
// Grupare (swimlanes)
// ═══════════════════════════════════════════════════════════════════════════

export const GROUP_KEYS = ['none', 'assignee', 'priority', 'tag'] as const;
export type GroupKey = (typeof GROUP_KEYS)[number];

export interface TaskGroup {
  /** Cheia stabilă a benzii: id de utilizator, cod de prioritate, etichetă. */
  id: string;
  /**
   * Ce se afișează. Pentru responsabil e numele rezolvat; pentru prioritate e
   * CODUL (`urgent`), pe care apelantul îl traduce — banda nu trebuie să
   * conțină text netradus (CLAUDE.md #15).
   */
  label: string;
  /** Banda „fără" (fără responsabil / fără etichetă) — se afișează ultima. */
  isUnassigned: boolean;
  tasks: BoardTask[];
}

/**
 * Împarte task-urile în benzi.
 *
 * Un task cu DOI responsabili apare în AMÂNDOUĂ benzile — la fel ca în Asana.
 * Alternativa (doar primul responsabil) ar face ca munca partajată să dispară
 * din vederea celuilalt, exact tipul de bug tăcut pe care nu-l reclamă nimeni,
 * fiindcă lipsa nu se vede. Numărul total afișat pe band trebuie deci citit ca
 * „câte îl privesc pe el", nu ca o partiție.
 */
export function groupTasks(
  tasks: BoardTask[],
  key: GroupKey,
  ctx: SortContext & { unassignedLabel?: string } = {},
): TaskGroup[] {
  if (key === 'none') {
    return [{ id: 'all', label: '', isUnassigned: false, tasks }];
  }

  const unassignedLabel = ctx.unassignedLabel ?? '—';
  const groups = new Map<string, TaskGroup>();
  const push = (id: string, label: string, isUnassigned: boolean, task: BoardTask) => {
    let g = groups.get(id);
    if (!g) {
      g = { id, label, isUnassigned, tasks: [] };
      groups.set(id, g);
    }
    g.tasks.push(task);
  };

  for (const task of tasks) {
    if (key === 'assignee') {
      const people = task.assignees ?? [];
      if (people.length === 0) push('__none__', unassignedLabel, true, task);
      else for (const uid of people) push(uid, ctx.names?.[uid] ?? unassignedLabel, false, task);
    } else if (key === 'priority') {
      push(task.priority, task.priority, false, task);
    } else if (key === 'tag') {
      const tags = task.tags ?? [];
      if (tags.length === 0) push('__none__', unassignedLabel, true, task);
      else for (const tag of tags) push(tag, tag, false, task);
    }
  }

  const out = [...groups.values()];
  out.sort((a, b) => {
    // Banda „fără" e ultima, întotdeauna.
    if (a.isUnassigned !== b.isUnassigned) return a.isUnassigned ? 1 : -1;
    if (key === 'priority') {
      return (PRIORITY_RANK[a.id as TaskPriority] ?? 99) - (PRIORITY_RANK[b.id as TaskPriority] ?? 99);
    }
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
  });
  return out;
}
