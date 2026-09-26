// Sincronizarea status ↔ coloană, în ambele direcții.
//
// Un task manager cu Kanban are două afirmații despre același lucru: coloana în
// care stă cardul și `status`-ul din rând. Dacă nu se sincronizează, aceeași
// sarcină apare „Gata" în Listă și „În lucru" pe board. Regula: coloana marcată
// `is_done_list` e autoritatea pentru „gata", iar numele coloanelor standard se
// mapează la statusuri (mapare tolerantă la diacritice și majuscule, fiindcă
// utilizatorii își redenumesc coloanele).

import type { TaskStatus } from './types';

/** Numele coloanelor create implicit pe fiecare board nou. */
export const DEFAULT_LISTS: {
  name: string;
  position: number;
  is_done_list: boolean;
  color: string;
  maps_to_status: TaskStatus;
}[] = [
  { name: 'De făcut', position: 1024, is_done_list: false, color: 'pastel-sky', maps_to_status: 'todo' },
  { name: 'În lucru', position: 2048, is_done_list: false, color: 'pastel-lavender', maps_to_status: 'in_progress' },
  { name: 'În așteptare', position: 3072, is_done_list: false, color: 'pastel-peach', maps_to_status: 'pending' },
  { name: 'Gata', position: 4096, is_done_list: true, color: 'pastel-mint', maps_to_status: 'done' },
];

/**
 * Cheile de traducere pentru coloanele implicite ale unui board nou. Numele
 * ajunge în DB în limba celui care creează boardul; statusul călătorește separat,
 * în `maps_to_status`, ca redenumirea sau traducerea să nu rupă sincronizarea.
 */
export const DEFAULT_LIST_KEYS: {
  key: string;
  is_done_list: boolean;
  color: string;
  maps_to_status: TaskStatus;
}[] = [
  { key: 'board.defaultLists.todo', is_done_list: false, color: 'pastel-sky', maps_to_status: 'todo' },
  { key: 'board.defaultLists.inProgress', is_done_list: false, color: 'pastel-lavender', maps_to_status: 'in_progress' },
  { key: 'board.defaultLists.pending', is_done_list: false, color: 'pastel-peach', maps_to_status: 'pending' },
  { key: 'board.defaultLists.done', is_done_list: true, color: 'pastel-mint', maps_to_status: 'done' },
];

function normalize(name: string): string {
  // NFD desparte diacriticele în literă + semn combinant, apoi le eliminăm:
  // „În așteptare" și „In asteptare" devin același lucru.
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Statusul dedus din NUMELE unei coloane. Coloanele custom întorc `null` —
 * acolo păstrăm statusul curent (dar `is_done_list` rămâne autoritar).
 */
export function statusFromListName(name: string | null | undefined): TaskStatus | null {
  if (!name) return null;
  const n = normalize(name);
  if (['de facut', 'backlog', 'todo', 'de realizat', 'nou'].includes(n)) return 'todo';
  if (['in lucru', 'in progres', 'in progress', 'in curs'].includes(n)) return 'in_progress';
  if (['in asteptare', 'asteptare', 'pending', 'blocat', 'review', 'de revizuit'].includes(n))
    return 'pending';
  if (['gata', 'done', 'finalizat', 'terminat', 'complet'].includes(n)) return 'done';
  return null;
}

export interface MovePatch {
  status?: TaskStatus;
  completed_at?: string | null;
}

/**
 * Ce se schimbă la mutarea unui card în `targetList`. Funcție pură ca să poată
 * fi testată fără DB — aici trăiește toată regula, nu împrăștiată prin UI.
 */
export function moveStatusPatch(
  currentStatus: TaskStatus,
  targetList: { is_done_list: boolean; name?: string; maps_to_status?: TaskStatus | null } | null,
  now: () => string = () => new Date().toISOString(),
): MovePatch {
  const wasDone = currentStatus === 'done';

  if (targetList?.is_done_list) {
    return wasDone ? {} : { status: 'done', completed_at: now() };
  }

  // `maps_to_status` (migrația v13) e sursa de adevăr. Numele coloanei e text
  // liber, traductibil — ghicitul din nume mergea doar în RO/EN, deci o companie
  // care lucra în rusă pierdea tăcut sincronizarea Kanban ↔ status.
  const mapped = targetList?.maps_to_status ?? statusFromListName(targetList?.name);
  if (mapped && mapped !== currentStatus) {
    return { status: mapped, completed_at: mapped === 'done' ? now() : null };
  }

  // Scos din coloana terminală, dar în una fără nume cunoscut: nu mai e gata.
  if (wasDone && targetList && !targetList.is_done_list) {
    return { status: 'in_progress', completed_at: null };
  }

  return {};
}

/**
 * Perechea inversă: schimbarea statusului din Listă/panoul de detalii mută
 * cardul în coloana potrivită. Întoarce `list_id`-ul țintă sau `undefined` dacă
 * nu e nevoie de mutare.
 */
export function listIdForStatus(
  nextStatus: TaskStatus,
  currentStatus: TaskStatus,
  currentListId: string | null,
  lists: { id: string; name: string; is_done_list: boolean; maps_to_status?: TaskStatus | null }[],
): string | undefined {
  if (lists.length === 0) return undefined;
  const doneList = lists.find((l) => l.is_done_list);
  const firstNonDone = lists.find((l) => !l.is_done_list);

  if (nextStatus === 'done') {
    if (doneList && currentListId !== doneList.id) return doneList.id;
    return undefined;
  }

  // Un status cu coloană proprie pe board → cardul se duce acolo.
  const named = lists.find(
    (l) => !l.is_done_list && (l.maps_to_status ?? statusFromListName(l.name)) === nextStatus,
  );
  if (named && currentListId !== named.id) return named.id;

  // Ieșirea din „Gata" fără coloană dedicată: revine în prima coloană activă.
  if (currentStatus === 'done' && doneList && currentListId === doneList.id && firstNonDone) {
    return firstNonDone.id;
  }
  return undefined;
}
