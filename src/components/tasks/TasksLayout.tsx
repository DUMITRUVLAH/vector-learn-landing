/**
 * Layout-ul modulului de task-uri — portat din HR365 (`TasksLayout.tsx`), montat în shell-ul
 * FinFlow (`BusinessShell`) în loc de un al doilea chrome.
 *
 * Ce vine din sursă, neschimbat ca structură:
 * - secțiunile modulului, filtrate pe rol (angajatul vede doar ce-i folosește; Gantt, „Toate
 *   task-urile" și Dashboard sunt instrumente de planificare, pentru manageri și administratori);
 * - „Aprobări" cu numărul celor care te așteaptă;
 * - boardurile tale în meniu, cele cu stea deasupra, plus „Board nou";
 * - căutarea globală în task-uri, cu deschiderea directă a task-ului găsit;
 * - `fullBleed` pentru vederile late (Kanban, Calendar).
 *
 * Ce e nou aici: rândul „Echipe" (echipele workspace-ului, comune cu PAR).
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  GanttChartSquare,
  KanbanSquare,
  Layers,
  ListChecks,
  Plus,
  Search,
  ShieldCheck,
  Star,
  UserRound,
  Users,
} from "lucide-react";
import { BusinessShell, type NavGroup, type NavItem } from "@/components/business/BusinessShell";
import { Link } from "@/router/HashRouter";
import { cn } from "@/lib/utils";
import { boardDotClass, STATUS_META } from "@/lib/tasks/meta";
import { TASKS_BOARDS, taskPath, useNavigate, useTasksPathname } from "@/lib/tasks/router";
import { useTasksT, type TasksT } from "@/lib/tasks/useTasksT";
import { useBoards, usePendingApprovalsCount, useTaskSearch, useTasksAuth } from "@/hooks/useTaskBoards";
import type { ChipTone } from "@/components/ds";

interface TasksLayoutProps {
  children: ReactNode;
  /** Vederile late (Kanban, Calendar) renunță la containerul centrat. */
  fullBleed?: boolean;
  /** Acțiunea principală a paginii, arătată sus pe telefon (ex. „+ Task"). */
  mobileAction?: ReactNode;
}

type NavAudience = "everyone" | "manager" | "admin";

interface TasksNavEntry {
  to: string;
  key: string;
  icon: NavItem["icon"];
  tone: ChipTone;
  audience: NavAudience;
}

// Angajatul obișnuit vede doar ce-i folosește. Cine deschide Gantt-ul sau dashboard-ul cu
// trei task-uri proprii trage concluzia că modulul e gol.
const NAV_ITEMS: TasksNavEntry[] = [
  { to: `${TASKS_BOARDS}/me`, key: "myTasks", icon: UserRound, tone: "rose", audience: "everyone" },
  { to: TASKS_BOARDS, key: "boards", icon: KanbanSquare, tone: "violet", audience: "everyone" },
  { to: `${TASKS_BOARDS}/all`, key: "allTasks", icon: Layers, tone: "sky", audience: "manager" },
  { to: `${TASKS_BOARDS}/gantt`, key: "gantt", icon: GanttChartSquare, tone: "teal", audience: "manager" },
  { to: `${TASKS_BOARDS}/dashboard`, key: "dashboard", icon: BarChart3, tone: "emerald", audience: "manager" },
  { to: `${TASKS_BOARDS}/teams`, key: "teams", icon: Users, tone: "indigo", audience: "everyone" },
  { to: `${TASKS_BOARDS}/access`, key: "access", icon: ShieldCheck, tone: "amber", audience: "admin" },
];

function visibleNavFor(isAdmin: boolean, isManager: boolean): TasksNavEntry[] {
  return NAV_ITEMS.filter((item) =>
    item.audience === "everyone" ? true : item.audience === "admin" ? isAdmin : isAdmin || isManager,
  );
}

function GlobalTaskSearch({ onNavigate, t }: { onNavigate: (to: string) => void; t: TasksT }) {
  const [raw, setRaw] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Debounce: fără el, „raport" ar trimite șase interogări.
  useEffect(() => {
    const id = window.setTimeout(() => setQuery(raw), 250);
    return () => window.clearTimeout(id);
  }, [raw]);

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const { data: results = [], isFetching } = useTaskSearch(query);

  return (
    <div ref={boxRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <label htmlFor="tasks-global-search" className="sr-only">
        {t("board.search.placeholder")}
      </label>
      <Search
        className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/40"
        aria-hidden="true"
      />
      <input
        id="tasks-global-search"
        type="search"
        value={raw}
        onChange={(e) => {
          setRaw(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={t("board.search.placeholder")}
        className="h-9 w-full rounded-md border border-sidebar-border bg-sidebar-accent/50 pl-8 pr-3 text-xs text-sidebar-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />

      {open && query.trim().length >= 2 && (
        <div
          role="listbox"
          aria-label={t("board.search.placeholder")}
          className="absolute left-0 right-0 top-10 z-50 max-h-72 overflow-y-auto rounded-xl border bg-popover p-1 shadow-lg"
        >
          {isFetching && <p className="px-2 py-3 text-center text-xs text-muted-foreground">{t("board.loading")}</p>}
          {!isFetching && results.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">{t("board.search.noResults")}</p>
          )}
          {results.map((task) => (
            <button
              key={task.id}
              type="button"
              role="option"
              aria-selected={false}
              onClick={() => {
                setOpen(false);
                setRaw("");
                onNavigate(taskPath(task));
              }}
              className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", STATUS_META[task.status].dot)} aria-hidden="true" />
              <span className="truncate">{task.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Boardurile din meniu: căutarea, cele cu stea, toate, și „Board nou". */
function SidebarBoards({ t }: { t: TasksT }) {
  const navigate = useNavigate();
  const pathname = useTasksPathname();
  const { user } = useTasksAuth();
  const { data: boards = [] } = useBoards();
  const me = user?.id ?? "";
  const starred = boards.filter((b) => (b.starred_by ?? []).includes(me));

  const boardLink = (board: (typeof boards)[number], showStar: boolean) => {
    const href = `${TASKS_BOARDS}/${board.id}`;
    const active = pathname === href;
    return (
      <Link
        key={board.id}
        to={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium no-underline transition-all hover:no-underline",
          active
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
        )}
      >
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded", boardDotClass(board.id))} aria-hidden="true" />
        <span className="flex-1 truncate">{board.name}</span>
        {showStar && (board.starred_by ?? []).includes(me) && (
          <Star className="h-3 w-3 shrink-0 fill-current opacity-60" aria-label={t("board.star")} />
        )}
      </Link>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <GlobalTaskSearch onNavigate={navigate} t={t} />

      {starred.length > 0 && (
        <div>
          <p className="mb-2 px-3 text-3xs font-semibold uppercase tracking-group text-sidebar-foreground/35">
            {t("board.nav.starred")}
          </p>
          <div className="space-y-0.5">{starred.map((b) => boardLink(b, false))}</div>
        </div>
      )}

      <div>
        <p className="mb-2 px-3 text-3xs font-semibold uppercase tracking-group text-sidebar-foreground/35">
          {t("board.nav.boards")}
        </p>
        <div className="space-y-0.5">
          {boards.map((b) => boardLink(b, true))}
          <Link
            to={`${TASKS_BOARDS}?new=1`}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-sidebar-foreground/50 no-underline transition-all hover:bg-sidebar-accent/60 hover:text-sidebar-foreground hover:no-underline"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            {t("board.newBoard")}
          </Link>
        </div>
      </div>
    </div>
  );
}

export function TasksLayout({ children, fullBleed = false, mobileAction }: TasksLayoutProps) {
  const { t } = useTasksT();
  const { isHRAdmin, isManager } = useTasksAuth();
  const { data: pendingApprovals = 0 } = usePendingApprovalsCount();

  const moduleNav = useMemo(() => {
    const items: NavItem[] = visibleNavFor(isHRAdmin, isManager).map((item) => ({
      label: t(`board.nav.${item.key}`),
      href: item.to,
      icon: item.icon,
      tone: item.tone,
      exact: true,
    }));
    // „Aprobări" apare doar cui îi folosește: are ceva de aprobat, sau administrează workspace-ul.
    if (pendingApprovals > 0 || isHRAdmin) {
      items.splice(items.findIndex((i) => i.href.endsWith("/teams")), 0, {
        label: t("board.nav.approvals"),
        href: `${TASKS_BOARDS}/approvals`,
        icon: ShieldCheck,
        tone: "amber",
        exact: true,
        count: pendingApprovals || undefined,
      });
    }
    const groups: NavGroup[] = [{ section: null, prefix: TASKS_BOARDS, items }];
    return {
      groups,
      extra: <SidebarBoards t={t} />,
      mobileItems: [
        { label: t("board.nav.myTasks"), href: `${TASKS_BOARDS}/me`, icon: UserRound, exact: true },
        { label: t("board.nav.boards"), href: TASKS_BOARDS, icon: KanbanSquare, exact: true },
        ...(isHRAdmin || isManager
          ? [{ label: t("board.nav.allTasks"), href: `${TASKS_BOARDS}/all`, icon: Layers, exact: true }]
          : []),
        ...(pendingApprovals > 0
          ? [{ label: t("board.nav.approvals"), href: `${TASKS_BOARDS}/approvals`, icon: ShieldCheck, exact: true }]
          : []),
        { label: t("board.nav.teams"), href: `${TASKS_BOARDS}/teams`, icon: ListChecks, exact: true },
      ],
    };
  }, [t, isHRAdmin, isManager, pendingApprovals]);

  return (
    <BusinessShell pageTitle="" moduleNav={moduleNav} fullBleed={fullBleed}>
      {mobileAction && <div className="mb-3 flex justify-end md:hidden">{mobileAction}</div>}
      {children}
    </BusinessShell>
  );
}
