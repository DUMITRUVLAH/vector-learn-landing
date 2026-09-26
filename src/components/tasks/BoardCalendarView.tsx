// Calendar lunar — restilizat după referința crm-vector: card rotunjit cu
// header pastel, chip-uri tintate cu iconiță de prioritate + cerculeț de
// „gata” la hover, și un sertar lateral care arată taskurile zilei selectate
// (sau „Fără termen” dacă nu e nimic selectat), exact ca-n referință.
//
// Tragerea unui chip pe altă zi mută termenul (`due_date`). Folosim dnd-kit, ca
// pe Kanban, nu drag&drop nativ (cum face referința): un re-render din React
// Query în timpul tragerii ar anula-o, iar pe touch nu ar funcționa deloc.
//
// Task-urile fără termen nu dispar — stau în sertarul lateral (implicit), de
// unde pot fi trase direct pe o zi.

import { useMemo, useState, type ReactNode } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, pointerWithin, useDraggable, useDroppable,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday,
  getDay, parseISO, startOfMonth, startOfWeek, subMonths,
} from 'date-fns';
import {
  CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Circle, Eye, EyeOff, Flag, Plus, Repeat, Star, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTasksT } from '@/lib/tasks/useTasksT';
import { toast } from '@/lib/tasks/toast';
import { occurrencesBetween, parseRecurrence } from '@/lib/tasks/recurrence';
import { RecurrenceBadge, useRecurrenceLabel } from '@/components/tasks/RecurrenceBadge';
import { getDateFnsLocale } from '@/lib/tasks/dateLocale';
import {
  Button,
  Input,
  Popover, PopoverContent, PopoverTrigger,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/tasks/ui';
import {
  InlineAssigneesChip, InlineDueChip, InlinePriorityChip, InlineStatusChip,
} from '@/components/tasks/TaskInlineEdits';
import { useIsPhone } from '@/hooks/useIsPhone';
import {
  useAssignableIndex, useBoardNames, useBoards, useCreateTask, useMaterializedOccurrences, useMaterializeOccurrence, useUpdateTask,
} from '@/hooks/useTaskBoards';
import { taskErrorMessage } from '@/lib/tasks/errors';
import { OVERDUE_TEXT, PRIORITY_META, STATUS_META } from '@/lib/tasks/meta';
import { dueDay, isOverdue, todayIso } from '@/lib/tasks/grouping';
import type { BoardTask, TaskList } from '@/lib/tasks/types';

interface BoardCalendarViewProps {
  boardId: string | null;
  tasks: BoardTask[];
  lists?: TaskList[];
  onOpenTask: (taskId: string) => void;
  canEdit: boolean;
  /** Ca în Kanbanul pe status: în „Taskurile mele” task-ul nou trebuie să-mi
   *  fie atribuit, altfel îl scrii într-o zi și dispare pe loc din vedere. */
  quickAddAssignees?: string[];
}

const UNSCHEDULED = '__unscheduled__';

/** Boardul preferat pentru creare rapidă din calendar (per utilizator). */
const DEFAULT_BOARD_KEY = 'tasks_calendar_default_board';
const readDefaultBoard = () => {
  try {
    return localStorage.getItem(DEFAULT_BOARD_KEY) ?? '';
  } catch {
    return '';
  }
};
const writeDefaultBoard = (id: string) => {
  try {
    localStorage.setItem(DEFAULT_BOARD_KEY, id);
  } catch {
    // localStorage indisponibil (mod privat) — preferința rămâne pe sesiune
  }
};

/** Sentinela Select-ului pentru „fără board" (task personal). */
const PERSONAL = '__personal__';

export function BoardCalendarView({
  boardId,
  tasks,
  lists = [],
  onOpenTask,
  canEdit,
  quickAddAssignees,
}: BoardCalendarViewProps) {
  const { t, i18n } = useTasksT();
  const locale = getDateFnsLocale(i18n.language);
  const today = todayIso();
  // Breakpoint-ul hook-ului (768px) e chiar `md`, unde ascundem „+"-ul din celulă.
  const isMobile = useIsPhone();

  const updateTask = useUpdateTask(lists);
  const materializeOccurrence = useMaterializeOccurrence();

  /**
   * Un click pe ocurența viitoare o face task real și îl DESCHIDE pe loc.
   *
   * Deschiderea nu e un bonus: dacă ai apăsat pe ziua de 18, vrei să scrii ceva acolo.
   * Un chip care doar „devine plin" te-ar lăsa să cauți singur ce s-a întâmplat.
   */
  const materialize = (task: BoardTask, iso: string) => {
    if (!canEdit || materializeOccurrence.isPending) return;
    materializeOccurrence.mutate(
      { taskId: task.id, date: iso, boardId: task.board_id },
      {
        onSuccess: (id) => onOpenTask?.(id),
        onError: (error) => {
          console.error('[tasks] materialize occurrence', error);
          toast.error(taskErrorMessage(error, t, 'board.toast.saveFailed'));
        },
      },
    );
  };
  const createTask = useCreateTask();
  const boardNames = useBoardNames();
  // Doar încălzește cache-ul cu oamenii workspace-ului (rezultatul nu se citește aici).
  useAssignableIndex(boardId);

  const [month, setMonth] = useState(() => new Date());
  const [hideWeekend, setHideWeekend] = useState(false);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [defaultBoardId, setDefaultBoardId] = useState(() => readDefaultBoard());
  // Pe un board anume creăm acolo; în vederile transversale alegem la creare.
  const [createBoardId, setCreateBoardId] = useState(
    () => boardId ?? readDefaultBoard() ?? PERSONAL,
  );

  const toggleDefaultBoard = () => {
    const next = defaultBoardId === createBoardId ? '' : createBoardId;
    writeDefaultBoard(next);
    setDefaultBoardId(next);
    toast.success(next ? t('board.calendar.defaultBoardSet') : t('board.calendar.defaultBoardCleared'));
  };

  // Pe telefon `PointerSensor` singur nu ajunge: browserul consumă gestul ca
  // scroll înainte să pornească tragerea. `TouchSensor` cu `delay` pornește
  // tragerea abia după apăsare lungă, deci scroll-ul peste calendar rămâne
  // posibil, iar `tolerance` iartă tremurul degetului în cele 200ms.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const days = useMemo(() => {
    // Grila începe luni și acoperă săptămâni întregi, ca zilele din lunile
    // vecine să nu lase găuri în rânduri.
    const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    const result = eachDayOfInterval({ start, end });
    return hideWeekend ? result.filter((day) => ![0, 6].includes(getDay(day))) : result;
  }, [month, hideWeekend]);

  const { byDay, unscheduled } = useMemo(() => {
    const grouped: Record<string, BoardTask[]> = {};
    const loose: BoardTask[] = [];
    for (const task of tasks) {
      if (task.parent_task_id) continue;
      const day = dueDay(task);
      if (!day) loose.push(task);
      else (grouped[day] ??= []).push(task);
    }
    return { byDay: grouped, unscheduled: loose };
  }, [tasks]);

  /**
   * Ocurențele VIITOARE ale taskurilor recurente, ca previzualizare.
   *
   * Ele nu există ca rânduri: următoarea se naște abia când o finalizezi pe cea
   * curentă (o creează serverul, la finalizare). Deci un task „săptămânal"
   * apărea în calendar exact o dată, la termenul lui — adică nicăieri unde s-ar
   * vedea că se repetă. Le desenăm palid, nu se pot trage și nu se pot bifa:
   * sunt o promisiune, nu un task.
   */
  /** Seriile recurente vizibile — pentru care întrebăm ce zile au deja rând real. */
  const serii = useMemo(
    () => tasks.filter((task) => task.is_recurring && !task.parent_task_id).map((task) => task.id),
    [tasks],
  );
  const { data: perechi = [] } = useMaterializedOccurrences(serii);
  const materializate = useMemo(
    () => new Set(perechi.map((r) => `${r.recurrence_parent_id}|${r.occurrence_date}`)),
    [perechi],
  );

  const ghostsByDay = useMemo(() => {
    const grouped: Record<string, BoardTask[]> = {};
    const from = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
    const to = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
    // Zilele deja materializate au un task REAL, deci nu mai primesc și fantoma —
    // altfel aceeași zi ar apărea de două ori, o dată punctat și o dată plin.
    for (const task of tasks) {
      if (!task.is_recurring || task.parent_task_id) continue;
      const day = dueDay(task);
      if (!day) continue;
      const rule = parseRecurrence(task.recurrence_rule);
      for (const iso of occurrencesBetween(parseISO(day), rule, from, to)) {
        if (materializate.has(`${task.id}|${iso}`)) continue;
        (grouped[iso] ??= []).push(task);
      }
    }
    return grouped;
  }, [tasks, month, materializate]);

  const hiddenWeekendCount = useMemo(() => {
    if (!hideWeekend) return 0;
    let n = 0;
    for (const task of tasks) {
      const day = dueDay(task);
      if (!day) continue;
      const d = parseISO(day);
      if (isSameMonth(d, month) && [0, 6].includes(getDay(d))) n++;
    }
    return n;
  }, [hideWeekend, tasks, month]);

  const draggedTask = draggedId ? tasks.find((task) => task.id === draggedId) ?? null : null;
  const selectedTasks = selectedIso ? byDay[selectedIso] ?? [] : [];
  const railIso = selectedIso ?? UNSCHEDULED;

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedId(null);
    const { active, over } = event;
    if (!over || !canEdit) return;

    const task = tasks.find((item) => item.id === active.id);
    if (!task) return;

    // Celula zilei și sertarul lateral sunt două zone de drop DIFERITE pentru
    // aceeași zi (`day-` / `rail-`) — cu același id, dnd-kit ar păstra doar
    // ultima înregistrată, iar la deselectarea zilei celula rămânea moartă.
    const targetDay = String(over.id).replace(/^(day|rail)-/, '');
    if (targetDay === UNSCHEDULED) {
      if (task.due_date) updateTask.mutate({ id: task.id, patch: { due_date: null } });
      return;
    }

    if (dueDay(task) !== targetDay) {
      // Ora 12:00 local, nu miezul nopții: un termen la 00:00 se afișează în
      // ziua precedentă în fusurile cu offset negativ.
      // Toast-ul de eroare (+ rollback-ul optimist) stă în `useUpdateTask`;
      // aici rămâne doar urma pentru consolă.
      updateTask.mutate(
        { id: task.id, patch: { due_date: new Date(`${targetDay}T12:00:00`).toISOString() } },
        { onError: (error) => console.error('[tasks] reschedule', error) },
      );
    }
    // Confirmă vizual unde a ajuns task-ul — exact ca-n referință.
    setSelectedIso(targetDay);
  };

  const toggleDone = (task: BoardTask) => {
    updateTask.mutate({
      id: task.id,
      patch: { status: task.status === 'done' ? 'todo' : 'done' },
    });
  };

  const quickAdd = async (day: string) => {
    const title = newTitle.trim();
    if (!title) return;
    // Închidem inputul imediat: dacă rămâne deschis până se termină cererea,
    // un al doilea Enter creează același task de două ori.
    setNewTitle('');
    setAddingDay(null);
    try {
      await createTask.mutateAsync({
        title,
        // Pe un board fix rămâne acolo; altfel merge unde ai ales (implicit personal).
        board_id: boardId ?? (createBoardId === PERSONAL ? null : createBoardId || null),
        due_date: new Date(`${day}T12:00:00`).toISOString(),
        assignees: quickAddAssignees ?? [],
      });
    } catch (error) {
      console.error('[tasks] calendar add', error);
      toast.error(taskErrorMessage(error, t, 'board.toast.saveFailed'));
    }
  };

  const weekdays = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    const result = eachDayOfInterval({ start, end: endOfWeek(start, { weekStartsOn: 1 }) });
    return (hideWeekend ? result.slice(0, 5) : result).map((day) => format(day, 'EEEEEE', { locale }));
  }, [locale, hideWeekend]);

  const chipFor = (task: BoardTask, big: boolean) => (
    <CalendarChip
      key={task.id}
      big={big}
      task={task}
      boardId={boardId}
      canEdit={canEdit}
      overdue={isOverdue(task, today)}
      onOpen={() => onOpenTask(task.id)}
      onToggleDone={() => toggleDone(task)}
      boardName={task.board_id ? boardNames[task.board_id] : undefined}
    />
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e) => setDraggedId(String(e.active.id))}
      onDragCancel={() => setDraggedId(null)}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full flex-col gap-4 lg:flex-row">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Navigare lună */}
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-base font-semibold capitalize text-foreground sm:text-lg">
              {format(month, 'LLLL yyyy', { locale })}
            </h3>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" aria-label={t('board.calendar.previous')} onClick={() => setMonth(subMonths(month, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" className="h-9 rounded-lg" onClick={() => setMonth(new Date())}>
                {t('board.calendar.today')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1.5 rounded-lg px-2 sm:px-3"
                onClick={() => setHideWeekend((v) => !v)}
                aria-label={hideWeekend ? t('board.calendar.showWeekend') : t('board.calendar.hideWeekend')}
              >
                {hideWeekend ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                <span className="hidden sm:inline">
                  {hideWeekend ? t('board.calendar.showWeekend') : t('board.calendar.hideWeekend')}
                </span>
              </Button>
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg" aria-label={t('board.calendar.next')} onClick={() => setMonth(addMonths(month, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Grila 6×7 (sau 6×5 cu weekendul ascuns), într-un card rotunjit */}
          <div className="overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm">
            <div className={cn('grid border-b border-border/60 bg-muted/40', hideWeekend ? 'grid-cols-5' : 'grid-cols-7')}>
              {weekdays.map((day, i) => (
                <div key={`${day}-${i}`} className="px-2 py-2 text-center text-xs font-semibold capitalize text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>
            <div className={cn('grid', hideWeekend ? 'grid-cols-5' : 'grid-cols-7')}>
              {days.map((day) => {
                const iso = format(day, 'yyyy-MM-dd');
                const items = byDay[iso] ?? [];
                const outside = !isSameMonth(day, month);
                return (
                  <CalendarCell
                    key={iso}
                    iso={iso}
                    outside={outside}
                    selected={selectedIso === iso}
                    hideWeekend={hideWeekend}
                    onSelect={() => setSelectedIso((prev) => (prev === iso ? null : iso))}
                  >
                    <div className="flex items-center gap-1">
                      <span
                        className={cn(
                          'inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular-nums',
                          isToday(day) ? 'bg-foreground font-semibold text-background' : outside ? 'text-muted-foreground/50' : 'text-foreground',
                        )}
                      >
                        {format(day, 'd')}
                      </span>
                    </div>

                    {/* „+" doar de la `md` în sus: pe telefon celula are ~47px,
                        iar butonul îi mânca jumătate. Acolo se adaugă din sertar. */}
                    {canEdit && !isMobile && (
                      <Popover
                        open={addingDay === iso}
                        onOpenChange={(o) => {
                          setAddingDay(o ? iso : null);
                          if (o) setNewTitle('');
                        }}
                      >
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            aria-label={t('board.calendar.addOnDate', { date: format(day, 'd MMMM yyyy', { locale }) })}
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              'absolute right-1 top-1 z-10 hidden h-5 w-5 items-center justify-center rounded-md border border-border/60 bg-card text-muted-foreground shadow-sm transition-opacity hover:text-foreground md:flex',
                              'md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100',
                              addingDay === iso && 'md:opacity-100',
                            )}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-64 p-3"
                          // Click/Enter din popover urcă prin portalul React în
                          // `onClick`-ul celulei de dedesubt dacă nu-l oprim.
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <p className="mb-2 text-xs font-semibold capitalize text-foreground">
                            {format(day, 'EEEE, d MMM', { locale })}
                          </p>
                          <DayCreateForm
                            title={newTitle}
                            onTitleChange={setNewTitle}
                            boardId={boardId}
                            pickedBoardId={createBoardId}
                            onPickBoard={setCreateBoardId}
                            defaultBoardId={defaultBoardId}
                            onToggleDefaultBoard={toggleDefaultBoard}
                            onSubmit={() => quickAdd(iso)}
                            onCancel={() => setAddingDay(null)}
                          />
                        </PopoverContent>
                      </Popover>
                    )}

                    {/*
                      Pe telefon o celulă are ~47px: un chip cu text devine „D…"
                      și nu spune nimic. Acolo arătăm doar buline colorate pe
                      status, iar lista propriu-zisă se citește în sertar, la
                      atingerea zilei. De la `sm` în sus rămân chip-urile.
                    */}
                    {(items.length > 0 || (ghostsByDay[iso] ?? []).length > 0) && (
                      <div className="flex flex-wrap items-center gap-0.5 sm:hidden" aria-hidden="true">
                        {items.slice(0, 4).map((task) => (
                          <span
                            key={task.id}
                            className={cn(
                              'h-1.5 w-1.5 rounded-full',
                              isOverdue(task, today) && task.status !== 'done'
                                ? 'bg-red-500'
                                : STATUS_META[task.status].dot,
                            )}
                          />
                        ))}
                        {(ghostsByDay[iso] ?? []).slice(0, 2).map((task) => (
                          <span
                            key={`gd-${task.id}`}
                            className="h-1.5 w-1.5 rounded-full border border-dashed border-muted-foreground/60"
                          />
                        ))}
                        {items.length > 4 && (
                          <span className="text-[9px] leading-none text-muted-foreground">
                            +{items.length - 4}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="hidden flex-col gap-1 sm:flex">
                      {items.map((task) => chipFor(task, false))}
                      {(ghostsByDay[iso] ?? []).map((task) => (
                        <GhostChip
                          key={`ghost-${task.id}-${iso}`}
                          task={task}
                          iso={iso}
                          onMaterialize={materialize}
                          pending={materializeOccurrence.isPending}
                        />
                      ))}
                    </div>
                  </CalendarCell>
                );
              })}
            </div>
          </div>
          {hideWeekend && hiddenWeekendCount > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              {t('board.calendar.weekendHidden', { count: hiddenWeekendCount })}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">{t('board.calendar.dragHint')}</p>
        </div>

        {/* Sertar lateral — ziua selectată sau „Fără termen” */}
        <CalendarRail
          iso={railIso}
          label={selectedIso
            ? format(parseISO(selectedIso), 'EEEE, d MMM', { locale })
            : t('board.calendar.unscheduled')}
        >
          {selectedIso ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <span className="capitalize">{format(parseISO(selectedIso), 'EEEE, d MMM', { locale })}</span>
                  <span className="text-xs font-medium text-muted-foreground">{selectedTasks.length}</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setSelectedIso(null)}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label={t('board.calendar.close')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {selectedTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('board.calendar.emptyDay')}</p>
              ) : (
                <div className="flex flex-col gap-1.5">{selectedTasks.map((task) => chipFor(task, true))}</div>
              )}

              {/* Pe telefon „+"-ul din celulă e ascuns (nu încape), deci calea de
                  adăugare pe ziua selectată trăiește aici. */}
              {canEdit && isMobile && (
                addingDay === selectedIso ? (
                  <div className="mt-2">
                    <DayCreateForm
                      title={newTitle}
                      onTitleChange={setNewTitle}
                      boardId={boardId}
                      pickedBoardId={createBoardId}
                      onPickBoard={setCreateBoardId}
                      defaultBoardId={defaultBoardId}
                      onToggleDefaultBoard={toggleDefaultBoard}
                      onSubmit={() => quickAdd(selectedIso)}
                      onCancel={() => setAddingDay(null)}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingDay(selectedIso);
                      setNewTitle('');
                    }}
                    className="mt-2 flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {t('board.card.add')}
                  </button>
                )
              )}
            </>
          ) : (
            <>
              {/* Fără termen = semnal roșu, nu neutru: e informația care altfel se pierde. */}
              <h4 className={cn('mb-2 flex items-center gap-2 text-sm font-semibold', OVERDUE_TEXT)}>
                <CalendarDays className="h-4 w-4" />
                {t('board.calendar.unscheduled')}
                <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-950/60 dark:text-red-300">
                  {unscheduled.length}
                </span>
              </h4>
              {unscheduled.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('board.calendar.allScheduled')}</p>
              ) : (
                <div className="flex flex-col gap-1.5">{unscheduled.map((task) => chipFor(task, true))}</div>
              )}
            </>
          )}
        </CalendarRail>
      </div>

      <DragOverlay dropAnimation={null}>
        {draggedTask && (
          <div className="rounded-md border bg-card px-2 py-1.5 text-xs shadow-lg">
            {draggedTask.title}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface CalendarCellProps {
  iso: string;
  outside: boolean;
  selected: boolean;
  hideWeekend: boolean;
  onSelect: () => void;
  children: ReactNode;
}

function CalendarCell({
  iso,
  outside,
  selected,
  hideWeekend,
  onSelect,
  children,
}: CalendarCellProps) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${iso}` });
  return (
    // Celula e un div cu role="button" (nu <button>) ca să poată conține
    // butonul „+” de creare rapidă fără nesting invalid.
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        // Doar Enter direct pe celulă — nu Enter venit din inputul de creare.
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'group relative flex min-h-[72px] sm:min-h-[100px] cursor-pointer flex-col gap-1 overflow-y-auto border-b border-r border-border/40 p-1.5 text-left transition-colors hover:bg-muted/40',
        hideWeekend ? '[&:nth-child(5n)]:border-r-0' : '[&:nth-child(7n)]:border-r-0',
        outside && 'bg-muted/20',
        selected && 'bg-primary/5 ring-2 ring-inset ring-primary/40',
        isOver && 'ring-2 ring-inset ring-primary/50',
      )}
    >
      {children}
    </div>
  );
}

interface CalendarRailProps {
  iso: string;
  label: string;
  children: ReactNode;
}

function CalendarRail({
  iso,
  label,
  children,
}: CalendarRailProps) {
  // Prefix propriu: sertarul arată aceeași zi ca o celulă din grilă, iar un id
  // identic ar fi suprascris înregistrarea celulei în dnd-kit.
  const { setNodeRef, isOver } = useDroppable({ id: `rail-${iso}` });
  return (
    <aside
      ref={setNodeRef}
      aria-label={label}
      className={cn(
        'w-full shrink-0 rounded-2xl border border-border/60 bg-card p-3 shadow-sm lg:w-56',
        isOver && 'ring-2 ring-inset ring-primary/40',
      )}
    >
      {children}
    </aside>
  );
}

interface CalendarChipProps {
  task: BoardTask;
  boardId: string | null;
  canEdit: boolean;
  overdue: boolean;
  onOpen: () => void;
  onToggleDone: () => void;
  boardName?: string;
  big: boolean;
}

function CalendarChip({
  task,
  boardId,
  canEdit,
  overdue,
  onOpen,
  onToggleDone,
  boardName,
  big,
}: CalendarChipProps) {
  const { t } = useTasksT();
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({ id: task.id });
  const isDone = task.status === 'done';
  const prio = task.priority;
  const showFlag = prio === 'high' || prio === 'urgent';

  return (
    <div className="group/chip relative">
      {/*
        Click pe chip = editare pe loc (status / responsabil / termen /
        prioritate), nu un salt în panoul mare. Panoul rămâne la un click
        distanță, prin „Deschide detalii →".
      */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            ref={setNodeRef}
            {...attributes}
            {...listeners}
            type="button"
            onClick={(e) => e.stopPropagation()}
            title={task.title}
            className={cn(
              // `touch-none` e cerut de dnd-kit pe elementul tras: fără el,
              // browserul preia gestul ca scroll și tragerea se anulează.
              // Padding-ul stâng stă în clasa de MĂRIME, nu separat: `cn()` e tailwind-merge,
              // iar un `px-2` scris DUPĂ `pl-5` îl elimină (px acoperă și padding-left).
              // Deci locul rezervat bifei dispărea, iar iconița cădea peste steagul de
              // prioritate și peste text (raportat 10-09-2026).
              'flex w-full cursor-grab touch-none items-start gap-1 rounded-md text-left font-medium transition-shadow hover:shadow-sm active:cursor-grabbing',
              big ? 'py-1.5 pr-2 pl-6 text-xs' : 'py-1 pr-1.5 pl-5 text-[11px] leading-tight',
              STATUS_META[task.status].chip,
              overdue && !isDone && 'ring-1 ring-red-400/60',
              prio === 'urgent' && 'ring-1 ring-red-500/70',
              isDragging && 'opacity-40',
            )}
          >
            {showFlag && <Flag className={cn('mt-0.5 h-3 w-3 shrink-0', PRIORITY_META[prio].flag)} />}
            {task.is_recurring && <RecurrenceBadge rule={task.recurrence_rule} className="mt-0.5" />}
            <span className="min-w-0 flex-1">
              {/* Ca în referință, textul trece pe rândul următor în loc să fie
                  tăiat: pe desktop celula are loc, iar un titlu „De revenit la
                  mik…" nu spune nimic. */}
              <span className={cn('block whitespace-normal break-words', isDone && 'line-through')}>
                {task.title}
              </span>
              {boardName && (
                <span className="mt-0.5 block truncate text-[10px] font-medium opacity-70">{boardName}</span>
              )}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-64 p-2"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <QuickEdit task={task} boardId={boardId} canEdit={canEdit} onOpen={onOpen} />
        </PopoverContent>
      </Popover>
      <button
        type="button"
        aria-label={isDone ? t('board.calendar.reopen', { title: task.title }) : t('board.calendar.markDone', { title: task.title })}
        onClick={(e) => {
          e.stopPropagation();
          onToggleDone();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        className={cn(
          /*
            Aliniată cu PRIMUL rând de text, nu centrată pe chip. Cu `top-1/2` pe un titlu
            de trei rânduri bifa cădea fix în mijlocul textului și se suprapunea peste el
            (raportat 10-09-2026). `pl-5` de pe chip rezervă locul doar pe primul rând, deci
            acolo trebuie să stea și iconița.
          */
          'absolute left-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:text-emerald-600 group-hover/chip:opacity-100 focus-visible:opacity-100',
          big ? 'top-1.5' : 'top-[3px]',
          isDone && 'opacity-100 text-emerald-600',
        )}
      >
        {isDone ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

interface QuickEditProps {
  task: BoardTask;
  boardId: string | null;
  canEdit: boolean;
  onOpen: () => void;
}

/**
 * Panoul de editare rapidă al unui chip din calendar — status / responsabil /
 * termen / prioritate, toate schimbabile fără să părăsești calendarul. Panoul
 * complet (comentarii, subtaskuri, dependențe) rămâne la un click distanță.
 */
function QuickEdit({
  task,
  boardId,
  canEdit,
  onOpen,
}: QuickEditProps) {
  const { t } = useTasksT();
  return (
    <div className="flex flex-col gap-2">
      <div className="text-sm font-medium leading-snug text-foreground">{task.title}</div>
      {canEdit && (
        <div className="flex flex-col gap-1.5 text-xs">
          <Row label={t('board.detail.status')}>
            <InlineStatusChip task={task} />
          </Row>
          <Row label={t('board.detail.assignees')}>
            <InlineAssigneesChip task={task} boardId={boardId} />
          </Row>
          <Row label={t('board.detail.dueDate')}>
            <InlineDueChip task={task} />
          </Row>
          <Row label={t('board.detail.priority')}>
            <InlinePriorityChip task={task} />
          </Row>
        </div>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 justify-start px-2 text-xs"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        {t('board.calendar.openDetails')}
      </Button>
    </div>
  );
}

interface RowProps {
  label: string;
  children: ReactNode;
}

function Row({ label, children }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

interface DayCreateFormProps {
  title: string;
  onTitleChange: (v: string) => void;
  /** Non-null = suntem pe un board anume, deci nu se alege nimic. */
  boardId: string | null;
  pickedBoardId: string;
  onPickBoard: (v: string) => void;
  defaultBoardId: string;
  onToggleDefaultBoard: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}

/**
 * Formularul de creare pe o zi: titlu + (în vederile transversale) boardul
 * țintă, cu o steluță care ține minte alegerea pentru data viitoare.
 * Folosit și în popoverul de pe celulă (desktop), și în sertar (telefon), ca să
 * nu existe două forme diferite ale aceluiași lucru.
 */
function DayCreateForm({
  title,
  onTitleChange,
  boardId,
  pickedBoardId,
  onPickBoard,
  defaultBoardId,
  onToggleDefaultBoard,
  onSubmit,
  onCancel,
}: DayCreateFormProps) {
  const { t } = useTasksT();
  const { data: boards = [] } = useBoards();
  const showBoardPicker = boardId === null;

  return (
    <div className="flex flex-col gap-2">
      <Input
        autoFocus
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          }
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={t('board.card.newPlaceholder')}
        aria-label={t('board.quickAdd.titleLabel')}
        className="h-9 text-sm"
      />

      {showBoardPicker && (
        <div className="flex items-center gap-1">
          <Select value={pickedBoardId} onValueChange={onPickBoard}>
            <SelectTrigger className="h-9 flex-1 text-xs" aria-label={t('board.filters.board')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PERSONAL}>{t('board.quickAdd.personal')}</SelectItem>
              {boards.map((board) => (
                <SelectItem key={board.id} value={board.id}>{board.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 rounded-lg"
            aria-label={t('board.calendar.defaultBoardToggle')}
            title={t('board.calendar.defaultBoardToggle')}
            onClick={onToggleDefaultBoard}
          >
            <Star
              className={cn(
                'h-4 w-4',
                defaultBoardId === pickedBoardId ? 'fill-amber-400 text-amber-500' : 'text-muted-foreground',
              )}
            />
          </Button>
        </div>
      )}

      <Button type="button" size="sm" className="h-9 rounded-lg" disabled={!title.trim()} onClick={onSubmit}>
        {t('board.quickAdd.add')}
      </Button>
    </div>
  );
}

interface GhostChipProps {
  task: BoardTask;
  iso: string;
  onMaterialize: (task: BoardTask, iso: string) => void;
  pending: boolean;
}

/**
 * Ocurența viitoare a unui task recurent: aceeași formă ca un chip, dar punctată
 * și inertă. Deschide detaliul taskului-sursă — acolo se schimbă regula.
 */
/**
 * Ocurența viitoare a unei serii.
 *
 * Nu e un rând în bază — se calculează din regulă. Dar un click o FACE rând: din clipa
 * aia ziua are un task ca oricare altul (comentarii, responsabil, subtaskuri), legat de
 * serie. Până acum chipul era inert, deci „adaugă un comentariu pe 18 septembrie" nu se
 * putea (cerut 10-09-2026).
 *
 * Rămâne punctat cât timp e doar o promisiune; după materializare dispare de aici, fiindcă
 * ziua are deja un chip REAL — filtrarea se face în `ghostsByDay`, nu aici.
 */
function GhostChip({
  task,
  iso,
  onMaterialize,
  pending,
}: GhostChipProps) {
  const { t } = useTasksT();
  const label = useRecurrenceLabel(task.recurrence_rule);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={(event) => {
        event.stopPropagation();
        onMaterialize(task, iso);
      }}
      title={`${task.title} — ${t('board.recurrence.materializeHint')} (${label})`}
      className="flex w-full items-start gap-1 rounded-md border border-dashed border-muted-foreground/40 px-1.5 py-1 text-left text-[11px] leading-tight text-muted-foreground/70 transition-colors hover:border-primary/50 hover:text-foreground disabled:opacity-50"
    >
      <Repeat className="mt-0.5 h-2.5 w-2.5 shrink-0" />
      <span className="min-w-0 flex-1 whitespace-normal break-words">{task.title}</span>
    </button>
  );
}
