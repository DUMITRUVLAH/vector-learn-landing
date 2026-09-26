// Vederea Listă — aceleași task-uri ca pe Kanban, grupate pe coloană, cu
// editare inline pe rând (bifă, responsabil, termen, prioritate).
//
// Sub-taskurile apar sub părinte, indentate, nu ca rânduri separate: altfel un
// task cu opt subtaskuri ar umple lista și ar ascunde restul boardului.

import { Fragment, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import type { Locale } from 'date-fns';
import {
  CalendarIcon, CheckCircle2, ChevronDown, ChevronRight, Circle, CornerDownRight, Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDateFnsLocale } from '@/lib/tasks/dateLocale';
import { toast } from '@/lib/tasks/toast';
import { useTasksT } from '@/lib/tasks/useTasksT';
import {
  Button,
  Calendar,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/tasks/ui';
import { AssigneePicker } from './AssigneePicker';
import { useIsPhone } from '@/hooks/useIsPhone';
import { AssigneeAvatars } from './AssigneeAvatars';
import { useCreateTask, useUpdateTask } from '@/hooks/useTaskBoards';
import { OVERDUE_TEXT, PRIORITY_META } from '@/lib/tasks/meta';
import { isOverdue, todayIso, toDueDateIso } from '@/lib/tasks/grouping';
import { DEFAULT_SORT, sortTasks, type GroupKey, type SortState } from '@/lib/tasks/sorting';
import { TASK_PRIORITIES } from '@/lib/tasks/types';
import type { AssignableUser, BoardTask, TaskList, TaskPriority } from '@/lib/tasks/types';

interface BoardListViewProps {
  boardId: string;
  tasks: BoardTask[];
  lists: TaskList[];
  assignableIndex: Record<string, AssignableUser>;
  onOpenTask: (taskId: string) => void;
  canEdit: boolean;
  /** Ordinea din interiorul fiecărei coloane. Implicit: aranjarea manuală. */
  sort?: SortState;
  /** Benzi peste coloane. `'none'` păstrează gruparea pe coloane a boardului. */
  group?: GroupKey;
}

export function BoardListView({
  boardId,
  tasks,
  lists,
  assignableIndex,
  onOpenTask,
  canEdit,
  sort = DEFAULT_SORT,
}: BoardListViewProps) {
  const { t, i18n } = useTasksT();
  const dateLocale = getDateFnsLocale(i18n.language);
  const today = todayIso();

  const updateTask = useUpdateTask(lists);
  const createTask = useCreateTask();

  const isMobile = useIsPhone();
  /*
    Rândul „cald" — singurul care poartă controale REALE (selector de colegi,
    calendar, prioritate). Fiecare dintre ele e o rădăcină cu context, refs și
    portal: la 330 de rânduri însemnau ~1000 de rădăcini montate deodată,
    adică ~630 ms de ecran înghețat la intrarea în vedere (măsurat 11-09-2026),
    pentru trei controale din care se folosește unul.
    Restul rândurilor arată exact la fel, dar din markup simplu.
  */
  const [hotRow, setHotRow] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addingIn, setAddingIn] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');

  /** id → nume, pentru sortarea/gruparea pe responsabil. */
  const names = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, person] of Object.entries(assignableIndex)) {
      if (person?.full_name) out[id] = person.full_name;
    }
    return out;
  }, [assignableIndex]);

  const { byList, subtasksByParent, unsorted } = useMemo(() => {
    const subs: Record<string, BoardTask[]> = {};
    const tops: BoardTask[] = [];
    for (const task of tasks) {
      if (task.parent_task_id) (subs[task.parent_task_id] ??= []).push(task);
      else tops.push(task);
    }
    const grouped: Record<string, BoardTask[]> = {};
    const loose: BoardTask[] = [];
    for (const task of tops) {
      if (task.list_id && lists.some((l) => l.id === task.list_id)) {
        (grouped[task.list_id] ??= []).push(task);
      } else {
        loose.push(task);
      }
    }
    // Sortarea aleasă de utilizator se aplică ÎN INTERIORUL fiecărei coloane:
    // coloana e o decizie a boardului (starea muncii), ordinea e o preferință
    // de citire. `sortTasks` e stabil, deci pe `manual` iese exact ordinea
    // manuală de dinainte.
    const ctx = { names };
    for (const key of Object.keys(grouped)) grouped[key] = sortTasks(grouped[key], sort, ctx);
    // Subtaskurile se sortau ÎN `renderRow`, deci o sortare nouă per rând la
    // FIECARE randare. Aici se face o dată, cu restul grupării.
    for (const key of Object.keys(subs)) subs[key] = sortTasks(subs[key], sort, ctx);
    return {
      byList: grouped,
      subtasksByParent: subs,
      unsorted: sortTasks(loose, sort, ctx),
    };
  }, [tasks, lists, sort, names]);

  const quickAdd = async (listId: string | null) => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      setNewTitle('');
      await createTask.mutateAsync({ title, board_id: boardId, list_id: listId });
    } catch (error) {
      console.error('[tasks] quick add', error);
      toast.error((error as { message?: string })?.message || t('board.toast.saveFailed'));
    }
  };

  const renderRow = (task: BoardTask, depth = 0) => {
    const overdue = isOverdue(task, today);
    const isDone = task.status === 'done';
    const due = task.due_date ? parseISO(task.due_date) : undefined;

    return (
      <Fragment key={task.id}>
        <div
          className={cn(
            'group flex items-center gap-2 border-b px-3 py-2 transition-colors last:border-0 hover:bg-accent',
            depth > 0 && 'bg-muted/20',
          )}
          style={{ paddingLeft: `${12 + depth * 24}px` }}
          /* Mouse-ul ajunge pe rând înaintea clicului, deci controalele reale
             sunt deja acolo când apeși. `focus` acoperă navigarea din tastatură. */
          onPointerEnter={() => !isMobile && setHotRow(task.id)}
          onFocusCapture={() => !isMobile && setHotRow(task.id)}
        >
          {depth > 0 && <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />}

          <button
            type="button"
            onClick={() =>
              updateTask.mutate({ id: task.id, patch: { status: isDone ? 'todo' : 'done' } })
            }
            className="-m-2 shrink-0 rounded p-2 text-muted-foreground transition-colors hover:text-emerald-600"
            aria-label={t(
              isDone ? 'board.card.toggleUndone' : 'board.card.toggleDone',
              { title: task.title },
            )}
          >
            {isDone ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            ) : (
              <Circle className="h-4 w-4" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onOpenTask(task.id)}
            className={cn(
              'min-w-0 flex-1 truncate text-left text-sm hover:underline',
              isDone && 'text-muted-foreground line-through',
            )}
          >
            {task.title}
          </button>

          {/*
            Pe mobil rândul rămânea DOAR cu titlul: termenul, responsabilul și
            prioritatea erau ascunse (`hidden sm:flex`), deci lista era inutilă
            exact acolo unde ecranul e mic. Acum informația coboară pe a doua
            linie, compactă, în loc să dispară.
          */}
          {/*
            Pe telefon clusterul ăsta e ascuns (`sm:flex`) — dar React îl monta
            oricum, cu tot cu rădăcinile controalelor, pentru fiecare rând.
            `md:hidden` ASCUNDE, dar montează: comutăm MONTAREA, nu vizibilitatea.
          */}
          {!isMobile && (
            <div className="hidden shrink-0 items-center gap-2 sm:flex">
              {canEdit && hotRow === task.id ? (
                <AssigneePicker
                  boardId={boardId}
                  value={task.assignees ?? []}
                  onChange={(ids) => updateTask.mutate({ id: task.id, patch: { assignees: ids } })}
                  variant="chip"
                />
              ) : (
                <span className="inline-flex min-h-[26px] items-center rounded-full border border-dashed border-transparent px-2 py-1">
                  <AssigneeAvatars userIds={task.assignees ?? []} index={assignableIndex} size="xs" max={3} />
                </span>
              )}

              {canEdit && hotRow === task.id ? (
                <DueCell
                  value={due}
                  overdue={overdue}
                  locale={dateLocale}
                  disabled={false}
                  emptyLabel={t('board.detail.noDate')}
                  onChange={(d) =>
                    updateTask.mutate({
                      id: task.id,
                      patch: { due_date: d ? toDueDateIso(d) : null },
                    })
                  }
                />
              ) : (
                <span
                  className={cn(
                    'flex h-6 w-[92px] items-center gap-1 px-1.5 text-[11px]',
                    overdue ? OVERDUE_TEXT : 'text-muted-foreground',
                  )}
                >
                  <CalendarIcon className="h-3 w-3 shrink-0" />
                  <span className="truncate">
                    {due ? format(due, 'd MMM', { locale: dateLocale }) : t('board.detail.noDate')}
                  </span>
                </span>
              )}

              {canEdit && hotRow === task.id ? (
                <Select
                  value={task.priority}
                  onValueChange={(v) =>
                    updateTask.mutate({ id: task.id, patch: { priority: v as TaskPriority } })
                  }
                >
                  <SelectTrigger
                    className={cn(
                      'h-6 w-[92px] border px-1.5 text-[11px]',
                      PRIORITY_META[task.priority].chip,
                    )}
                    aria-label={t('board.detail.priority')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TASK_PRIORITIES.map((priority) => (
                      <SelectItem key={priority} value={priority} className="text-xs">
                        {t(`priority.${priority}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <span
                  className={cn(
                    'flex h-6 w-[92px] items-center rounded-md border px-1.5 text-[11px]',
                    PRIORITY_META[task.priority].chip,
                  )}
                >
                  {t(`priority.${task.priority}`)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* A doua linie, doar pe telefon: aceleași date, în formă compactă. */}
        {isMobile && (
          <div
            className="flex flex-wrap items-center gap-2 pb-2 text-[11px] text-muted-foreground"
            style={{ paddingLeft: `${36 + depth * 24}px` }}
          >
            <AssigneeAvatars userIds={task.assignees ?? []} index={assignableIndex} size="xs" max={2} />
            {due && (
              <span className={cn('tabular-nums', overdue && 'font-medium text-red-700')}>
                {format(due, 'd MMM', { locale: dateLocale })}
              </span>
            )}
            <span className={cn('rounded px-1.5 py-0.5', PRIORITY_META[task.priority].chip)}>
              {t(`priority.${task.priority}`)}
            </span>
          </div>
        )}

        {(subtasksByParent[task.id] ?? []).map((sub) => renderRow(sub, depth + 1))}
      </Fragment>
    );
  };

  const renderGroup = (key: string, name: string, items: BoardTask[], listId: string | null) => {
    const isCollapsed = collapsed[key];
    const doneCount = items.filter((task) => task.status === 'done').length;

    return (
      <div key={key} className="overflow-hidden rounded-2xl border bg-card">
        <button
          type="button"
          onClick={() => setCollapsed((c) => ({ ...c, [key]: !c[key] }))}
          className="flex w-full items-center gap-2 border-b bg-muted/30 px-3 py-2.5 text-left"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <h3 className="flex-1 text-sm font-semibold">{name}</h3>
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {doneCount}/{items.length}
          </span>
        </button>

        {!isCollapsed && (
          <>
            {items.length === 0 && (
              <p className="px-4 py-3 text-xs text-muted-foreground">{t('board.list.emptyGroup')}</p>
            )}
            {items.map((task) => renderRow(task))}

            {canEdit && (
              addingIn === key ? (
                <div className="border-t px-3 py-2">
                  <Input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        quickAdd(listId);
                      }
                      if (e.key === 'Escape') {
                        setAddingIn(null);
                        setNewTitle('');
                      }
                    }}
                    /*
                      Blur-ul PĂSTREAZĂ ce ai scris, NU creează rândul. Varianta veche
                      (`if (newTitle.trim()) quickAdd(...)`) adăuga un task la orice click
                      în altă parte — pe dialog, pe alt buton, pe fereastră — iar după un
                      Enter ieșeau DOUĂ: Enter scria unul, blur-ul îl scria pe al doilea.
                      Composerul rămâne deschis cu textul în el; se închide doar gol.
                    */
                    onBlur={() => {
                      if (!newTitle.trim()) setAddingIn(null);
                    }}
                    placeholder={t('board.card.newPlaceholder')}
                    aria-label={t('board.card.newPlaceholder')}
                    className="h-8 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setAddingIn(key);
                    setNewTitle('');
                  }}
                  className="flex w-full items-center gap-1.5 border-t px-4 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t('board.card.add')}
                </button>
              )
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {unsorted.length > 0 && renderGroup('__unsorted__', t('board.unsorted'), unsorted, null)}
      {lists.map((list) => renderGroup(list.id, list.name, byList[list.id] ?? [], list.id))}
    </div>
  );
}

interface DueCellProps {
  value: Date | undefined;
  overdue: boolean;
  locale: Locale;
  disabled: boolean;
  emptyLabel: string;
  onChange: (d: Date | undefined) => void;
}

function DueCell({
  value,
  overdue,
  locale,
  disabled,
  emptyLabel,
  onChange,
}: DueCellProps) {
  const [open, setOpen] = useState(false);

  if (disabled) {
    return (
      <span className={cn('w-[86px] text-[11px]', overdue ? OVERDUE_TEXT : 'text-muted-foreground')}>
        {value ? format(value, 'd MMM', { locale }) : '—'}
      </span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-6 w-[92px] justify-start gap-1 px-1.5 text-[11px] font-normal',
            overdue ? OVERDUE_TEXT : 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="h-3 w-3" />
          {value ? format(value, 'd MMM', { locale }) : emptyLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => {
            onChange(d);
            setOpen(false);
          }}
          initialFocus
          locale={locale}
        />
        {value && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-xs"
              onClick={() => {
                onChange(undefined);
                setOpen(false);
              }}
            >
              {emptyLabel}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
