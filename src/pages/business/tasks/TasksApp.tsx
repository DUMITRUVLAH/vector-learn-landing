/**
 * Intrarea modulului de task-uri: `/business/tasks/*`.
 *
 * Un singur punct montat în `App.tsx` (lazy), care ține ce e comun tuturor paginilor:
 * - clientul React Query — SINGLETON la nivel de modul, nu în stare React: `App` remontează ruta
 *   la fiecare navigare (`<Suspense key={path}>`), iar un client nou ar fi aruncat cache-ul, deci
 *   fiecare clic între „Task-urile mele" și un board ar fi reîncărcat totul de la zero;
 * - toaster-ul modulului (`@/lib/tasks/toast`);
 * - rutarea internă, cu paginile încărcate separat (fiecare pagină e chunk-ul ei);
 * - refuzul explicit când modulul e oprit pentru workspace — altfel fiecare pagină ar fi arătat
 *   propriul „nu s-a putut încărca", fără să spună de ce.
 */
import { lazy, Suspense, useEffect, type ComponentType } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2, ListChecks } from "lucide-react";
import { ApiError } from "@/lib/api";
import { BusinessShell } from "@/components/business/BusinessShell";
import { EmptyState } from "@/components/ds";
import { TasksToaster, TooltipProvider } from "@/components/tasks/ui";
import { useTasksMe } from "@/hooks/useTaskBoards";
import { RESERVED_SEGMENTS, TASKS_BOARDS, boardIdFromPath, useTasksPathname } from "@/lib/tasks/router";
import { useTasksT } from "@/lib/tasks/useTasksT";

export const tasksQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // O singură reîncercare: un refuz de drept (403) nu devine acceptat la a treia încercare.
      retry: (failureCount, error) => {
        const status = (error as { status?: number }).status;
        if (status && status >= 400 && status < 500) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    },
    mutations: { retry: 0 },
  },
});

function page<T extends Record<string, ComponentType>>(loader: () => Promise<T>, name: keyof T) {
  return lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })));
}

const MyTasksPage = page(() => import("./MyTasksPage"), "MyTasksPage");
const TaskBoardsPage = page(() => import("./TaskBoardsPage"), "TaskBoardsPage");
const TaskBoardDetailPage = page(() => import("./TaskBoardDetailPage"), "TaskBoardDetailPage");
const AllTasksPage = page(() => import("./AllTasksPage"), "AllTasksPage");
const TaskGanttPage = page(() => import("./TaskGanttPage"), "TaskGanttPage");
const TaskApprovalsPage = page(() => import("./TaskApprovalsPage"), "TaskApprovalsPage");
const TaskDashboardPage = page(() => import("./TaskDashboardPage"), "TaskDashboardPage");
const TaskAccessRulesPage = page(() => import("./TaskAccessRulesPage"), "TaskAccessRulesPage");
const TaskTeamsPage = page(() => import("./TaskTeamsPage"), "TaskTeamsPage");

const SECTIONS: Record<string, ComponentType> = {
  me: MyTasksPage,
  all: AllTasksPage,
  gantt: TaskGanttPage,
  approvals: TaskApprovalsPage,
  dashboard: TaskDashboardPage,
  access: TaskAccessRulesPage,
  teams: TaskTeamsPage,
};

function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Se încarcă…</span>
    </div>
  );
}

/** `/business/tasks` și orice cale necunoscută duc în „Task-urile mele", ca în sursă (`/tasks`). */
function RedirectToMyTasks() {
  useEffect(() => {
    window.location.replace(`#${TASKS_BOARDS}/me`);
  }, []);
  return null;
}

function ModuleDisabled() {
  const { t } = useTasksT();
  return (
    <BusinessShell pageTitle={t("board.moduleTitle")}>
      <EmptyState
        icon={<ListChecks className="h-6 w-6" aria-hidden="true" />}
        title={t("board.moduleDisabled.title")}
        description={t("board.moduleDisabled.description")}
      />
    </BusinessShell>
  );
}

function TasksRoutes() {
  const pathname = useTasksPathname();
  const me = useTasksMe();

  if (me.error instanceof ApiError && me.error.code === "module_disabled") return <ModuleDisabled />;

  if (pathname === TASKS_BOARDS || pathname === `${TASKS_BOARDS}/`) return <TaskBoardsPage />;
  const section = pathname.match(/^\/business\/tasks\/boards\/([^/?#]+)/)?.[1];
  if (section && RESERVED_SEGMENTS.has(section)) {
    const Section = SECTIONS[section];
    return <Section />;
  }
  if (boardIdFromPath(pathname)) return <TaskBoardDetailPage />;
  return <RedirectToMyTasks />;
}

export function TasksApp() {
  return (
    <QueryClientProvider client={tasksQueryClient}>
      <TooltipProvider delayDuration={300}>
        <Suspense fallback={<PageFallback />}>
          <TasksRoutes />
        </Suspense>
        <TasksToaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
