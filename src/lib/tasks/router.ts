/**
 * Rutarea modulului de task-uri peste routerul pe hash al aplicației.
 *
 * Componentele portate din HR365 foloseau `react-router-dom` (`useSearchParams`, `useNavigate`,
 * `useParams`). Aici le dăm aceleași forme, cu o diferență de comportament care contează:
 *
 * **Parametrii de query nu declanșează navigare.** `?task=<id>` deschide panoul unui task, iar
 * `?view=kanban` schimbă vederea — dacă le-am scrie prin `location.hash`, routerul ar trata
 * fiecare clic ca pe o pagină nouă și ar sări la începutul paginii (vezi `HashRouter.jumpToTop`).
 * Le rescriem cu `history.replaceState`/`pushState`, la fel ca Pipeline-ul CRM
 * (`src/lib/crm/pipelineUrl.ts`), și le facem reactive printr-un store mic.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useRouter } from "@/router/HashRouter";

/** Rădăcina modulului. Sursa trăia la `/tasks/boards/*`; aici, sub `/business`. */
export const TASKS_BASE = "/business/tasks";
export const TASKS_BOARDS = `${TASKS_BASE}/boards`;

const listeners = new Set<() => void>();

function readHashPath(): string {
  return window.location.hash.replace(/^#/, "") || "/";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

/** Calea completă din hash (cu query), reactivă și la rescrierile fără navigare. */
export function useHashPath(): string {
  return useSyncExternalStore(subscribe, readHashPath, () => "/");
}

function split(full: string): [string, string] {
  const index = full.indexOf("?");
  return index === -1 ? [full, ""] : [full.slice(0, index), full.slice(index + 1)];
}

/** Partea de cale, fără query — pentru meniul activ și pentru parametrii de rută. */
export function useTasksPathname(): string {
  return split(useHashPath())[0];
}

type ParamsInit = URLSearchParams | Record<string, string>;

/**
 * `[params, setParams]`, ca în react-router. `params` e o copie nouă la fiecare schimbare, deci
 * tiparul din sursă — `params.set(…); setParams(params, { replace: true })` — rămâne valabil.
 */
export function useSearchParams(): [URLSearchParams, (next: ParamsInit, options?: { replace?: boolean }) => void] {
  const full = useHashPath();
  const [pathname, search] = split(full);
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const setParams = useCallback(
    (next: ParamsInit, options?: { replace?: boolean }) => {
      const query = (next instanceof URLSearchParams ? next : new URLSearchParams(next)).toString();
      const target = `#${pathname}${query ? `?${query}` : ""}`;
      if (window.location.hash === target) return;
      if (options?.replace) window.history.replaceState(window.history.state, "", target);
      else window.history.pushState(window.history.state, "", target);
      notify();
    },
    [pathname],
  );
  return [params, setParams];
}

/** `navigate(to)` cu căi din modul (`/business/tasks/…`) sau din aplicație. */
export function useNavigate(): (to: string, options?: { replace?: boolean }) => void {
  const { navigate } = useRouter();
  return useCallback(
    (to: string, options?: { replace?: boolean }) => {
      if (options?.replace) window.location.replace(`#${to}`);
      else navigate(to);
    },
    [navigate],
  );
}

/** `/business/tasks/boards/<boardId>` → `boardId`; orice altă rută a modulului → `undefined`. */
export function boardIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/business\/tasks\/boards\/([^/?#]+)/);
  if (!match) return undefined;
  const id = decodeURIComponent(match[1]);
  // Secțiunile fixe ale modulului stau sub același prefix — nu sunt id-uri de board.
  return RESERVED_SEGMENTS.has(id) ? undefined : id;
}

export const RESERVED_SEGMENTS = new Set(["me", "all", "gantt", "approvals", "dashboard", "access", "teams"]);

/** `const { boardId } = useParams()` din sursă. */
export function useParams(): { boardId?: string } {
  return { boardId: boardIdFromPath(useTasksPathname()) };
}

/** Adresa unui board, opțional cu task-ul deschis. */
export function boardPath(boardId: string, taskId?: string | null): string {
  return `${TASKS_BOARDS}/${boardId}${taskId ? `?task=${encodeURIComponent(taskId)}` : ""}`;
}

/** Adresa unui task: pe boardul lui, sau în „Task-urile mele" dacă e personal. */
export function taskPath(task: { id: string; board_id: string | null }): string {
  return task.board_id ? boardPath(task.board_id, task.id) : `${TASKS_BOARDS}/me?task=${encodeURIComponent(task.id)}`;
}
