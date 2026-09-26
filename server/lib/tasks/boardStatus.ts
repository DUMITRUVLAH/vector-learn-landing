/**
 * Sincronizarea status ↔ coloană și pozițiile fracționate — partea de server.
 *
 * E aceeași regulă ca în `src/lib/tasks/board-status.ts` + `positions.ts` (clientul o folosește
 * pentru mutarea optimistă a cardului). Serverul nu importă din `src/` (tsconfig separat), deci
 * funcțiile sunt copiate; `src/lib/tasks/__tests__/board-status-parity.test.ts` le compară pe o
 * matrice de cazuri, ca cele două copii să nu poată diverge tăcut.
 *
 * Regula: coloana marcată `is_done_list` e autoritatea pentru „gata"; `maps_to_status` e
 * statusul impus de coloană; pentru coloanele fără el, statusul se ghicește tolerant din nume
 * (diacritice și majuscule ignorate), fiindcă oamenii își redenumesc coloanele.
 */

export const TASK_STATUSES = ["todo", "in_progress", "pending", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** Coloanele cu care se naște un board, când clientul nu le trimite traduse. */
export const DEFAULT_LISTS: {
  name: string;
  position: number;
  is_done_list: boolean;
  color: string;
  maps_to_status: TaskStatus;
}[] = [
  { name: "De făcut", position: 1024, is_done_list: false, color: "pastel-sky", maps_to_status: "todo" },
  { name: "În lucru", position: 2048, is_done_list: false, color: "pastel-lavender", maps_to_status: "in_progress" },
  { name: "În așteptare", position: 3072, is_done_list: false, color: "pastel-peach", maps_to_status: "pending" },
  { name: "Gata", position: 4096, is_done_list: true, color: "pastel-mint", maps_to_status: "done" },
];

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function statusFromListName(name: string | null | undefined): TaskStatus | null {
  if (!name) return null;
  const n = normalize(name);
  if (["de facut", "backlog", "todo", "de realizat", "nou"].includes(n)) return "todo";
  if (["in lucru", "in progres", "in progress", "in curs"].includes(n)) return "in_progress";
  if (["in asteptare", "asteptare", "pending", "blocat", "review", "de revizuit"].includes(n)) return "pending";
  if (["gata", "done", "finalizat", "terminat", "complet"].includes(n)) return "done";
  return null;
}

export interface ListLike {
  id: string;
  name: string;
  is_done_list: boolean;
  maps_to_status?: TaskStatus | string | null;
}

function mappedStatus(list: Pick<ListLike, "name" | "maps_to_status">): TaskStatus | null {
  const explicit = list.maps_to_status;
  if (explicit && (TASK_STATUSES as readonly string[]).includes(explicit)) return explicit as TaskStatus;
  return statusFromListName(list.name);
}

export interface MovePatch {
  status?: TaskStatus;
  completed_at?: string | null;
}

/** Ce se schimbă la mutarea unui card în `targetList`. */
export function moveStatusPatch(
  currentStatus: TaskStatus,
  targetList: { is_done_list: boolean; name?: string; maps_to_status?: TaskStatus | string | null } | null,
  now: () => string = () => new Date().toISOString(),
): MovePatch {
  const wasDone = currentStatus === "done";
  if (targetList?.is_done_list) {
    return wasDone ? {} : { status: "done", completed_at: now() };
  }
  const mapped = targetList ? mappedStatus({ name: targetList.name ?? "", maps_to_status: targetList.maps_to_status }) : null;
  if (mapped && mapped !== currentStatus) {
    return { status: mapped, completed_at: mapped === "done" ? now() : null };
  }
  if (wasDone && targetList && !targetList.is_done_list) {
    return { status: "in_progress", completed_at: null };
  }
  return {};
}

/** Perechea inversă: schimbarea statusului mută cardul în coloana potrivită. */
export function listIdForStatus(
  nextStatus: TaskStatus,
  currentStatus: TaskStatus,
  currentListId: string | null,
  lists: ListLike[],
): string | undefined {
  if (lists.length === 0) return undefined;
  const doneList = lists.find((l) => l.is_done_list);
  const firstNonDone = lists.find((l) => !l.is_done_list);
  if (nextStatus === "done") {
    if (doneList && currentListId !== doneList.id) return doneList.id;
    return undefined;
  }
  const named = lists.find((l) => !l.is_done_list && mappedStatus(l) === nextStatus);
  if (named && currentListId !== named.id) return named.id;
  if (currentStatus === "done" && doneList && currentListId === doneList.id && firstNonDone) {
    return firstNonDone.id;
  }
  return undefined;
}

// ─── Poziții fracționate ───────────────────────────────────────────────────────

export const POSITION_STEP = 1024;

export function positionBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return POSITION_STEP;
  if (prev === null) return (next as number) / 2;
  if (next === null) return prev + POSITION_STEP;
  return (prev + next) / 2;
}

export function positionAtEnd(positions: number[]): number {
  return positions.reduce((max, p) => Math.max(max, p), 0) + POSITION_STEP;
}
