// Conținutul modalului de detalii al unui task.
//
// Toate câmpurile salvează la `blur`/schimbare, fără buton „Salvează": un task
// manager în care trebuie să confirmi fiecare micro-editare devine obositor.
// Titlul și descrierea salvează doar dacă s-au schimbat efectiv, ca să nu umple
// istoricul cu intrări goale.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { format, parseISO } from 'date-fns';
import type { Locale } from 'date-fns';
import {
  CalendarIcon, Check, CheckCircle2, Circle, Diamond, History, Loader2, MessageSquare,
  CornerDownRight, Pencil, Plus, Repeat, Trash2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDateFnsLocale } from '@/lib/tasks/dateLocale';
import { useTasksT } from '@/lib/tasks/useTasksT';
import { toast } from '@/lib/tasks/toast';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  Calendar,
  Checkbox,
  Input,
  Label,
  Popover, PopoverContent, PopoverTrigger,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Separator,
  Textarea,
} from '@/components/tasks/ui';
import { AssigneePicker } from '@/components/tasks/AssigneePicker';
import { TaskActivityTimeline } from '@/components/tasks/TaskActivityTimeline';
import { CommentBody, MentionTextarea } from '@/components/tasks/TaskMentions';
import { canDeleteSubtask, canFullyEditTask } from '@/lib/tasks/permissions';
import {
  WEEK_DAYS,
  parseRecurrence,
  type RecurrenceRule,
} from '@/lib/tasks/recurrence';
import { TaskTagEditor } from '@/components/tasks/TaskTagEditor';
import { TaskDependencies } from '@/components/tasks/TaskDependencies';
import { AttachmentPicker, CommentAttachments } from '@/components/tasks/CommentAttachments';
import {
  useAddCommentWithAttachments, useAssignableIndex, useBoardTasks, useBoards,
  useCreateTask, useDeleteComment, useDeleteTask, useMoveTaskToBoard, useRestoreTask,
  useSetApprovers, useSubtasks, useTask, useTaskActivity, useTaskComments, useTasksAuth,
  useUpdateTask,
} from '@/hooks/useTaskBoards';
import { taskErrorMessage } from '@/lib/tasks/errors';
import { STATUS_META, PRIORITY_META, avatarClass, initialsOf, listTone } from '@/lib/tasks/meta';
import { moveStatusPatch } from '@/lib/tasks/board-status';
import { toDueDateIso } from '@/lib/tasks/grouping';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/tasks/types';
import type { BoardTask, TaskList, TaskPriority, TaskStatus } from '@/lib/tasks/types';

/** Sentinela Select-ului pentru „fără board" — `null` nu poate fi valoarea unei opțiuni. */
const PERSONAL_BOARD = '__personal__';

interface TaskDetailPanelProps {
  task: BoardTask;
  lists: TaskList[];
  boardId: string | null;
  onClose: () => void;
  /** Deschide alt task în același panou (click pe un subtask). */
  onOpenTask?: (taskId: string) => void;
  asModal?: boolean;
  /**
   * Are voie să scrie pe boardul ăsta. Până acum panoul era complet editabil
   * pentru oricine îl putea DESCHIDE, inclusiv pentru un `viewer` — care
   * descoperea una câte una că butoanele nu fac nimic.
   */
  canEdit?: boolean;
}

export function TaskDetailPanel({
  task: initialTask,
  lists,
  boardId,
  onClose,
  onOpenTask,
  asModal = false,
  canEdit = true,
}: TaskDetailPanelProps) {
  const { t, i18n } = useTasksT();
  const dateLocale = getDateFnsLocale(i18n.language);
  const { user, isHRAdmin, isSuperAdmin } = useTasksAuth();
  const { data: hydratedTask } = useTask(initialTask.id);
  const task = hydratedTask ?? initialTask;

  const updateTask = useUpdateTask(lists);
  const deleteTask = useDeleteTask();
  const restoreTask = useRestoreTask();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const createTask = useCreateTask();
  const assignableIndex = useAssignableIndex(boardId);

  const setApprovers = useSetApprovers();
  const moveToBoard = useMoveTaskToBoard();
  const { data: boards = [] } = useBoards();
  // Candidații pentru dependențe sunt task-urile aceluiași board — o dependență
  // pe un task din alt board ar fi invizibilă pentru cine se uită la board.
  const { data: boardTasks = [] } = useBoardTasks(boardId ?? undefined);

  const { data: subtasks = [] } = useSubtasks(task.id);
  // Un subtask deschis nu spunea nicăieri al cui e, deci omul nu avea cum să
  // se întoarcă la task-ul mare decât din memorie.
  const { data: parentTask } = useTask(task.parent_task_id ?? undefined);

  /**
   * Drept DEPLIN pe task (titlu, responsabili, ștergere) — oglinda regulii de pe
   * server. `canEdit` de mai sus spune doar dacă panoul e read-only; un RESPONSABIL
   * îl primea `true` și vedea coșul de ștergere, dar serverul îi refuză ștergerea
   * cu „Responsabilul poate schimba doar progresul". Deci butonul exista ca să
   * eșueze — pe propriul task.
   */
  const canManage = useMemo(
    () =>
      canEdit &&
      canFullyEditTask(task, {
        userId: user?.id,
        isHRAdmin,
        isSuperAdmin,
        board: boards.find((b) => b.id === task.board_id) ?? null,
      }),
    [canEdit, task, user?.id, isHRAdmin, isSuperAdmin, boards],
  );
  /**
   * Dreptul de ȘTERGERE nu e același cu dreptul de editare deplină: responsabilul
   * poate șterge un SUBTASK pe care e alocat. Rândul de subtask folosea deja
   * `canDeleteSubtask`, dar coșul din ANTET rămăsese legat doar de `canManage` —
   * deci deschideai subtaskul ca fișă proprie și butonul dispărea, deși serverul
   * îți permitea. Aceeași funcție de rezolvare în ambele locuri.
   */
  const canDelete = useMemo(
    () =>
      canEdit &&
      (canManage ||
        canDeleteSubtask(task, {
          userId: user?.id,
          isHRAdmin,
          isSuperAdmin,
          board: boards.find((b) => b.id === task.board_id) ?? null,
        })),
    [canEdit, canManage, task, user?.id, isHRAdmin, isSuperAdmin, boards],
  );

  const { data: comments = [] } = useTaskComments(task.id);
  const { data: activity = [] } = useTaskActivity(task.id);

  const [title, setTitle] = useState(task.title);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [description, setDescription] = useState(task.description ?? '');
  const [taskSet, setTaskSet] = useState(task.task_set ?? '');
  const [showOptional, setShowOptional] = useState(
    Boolean(
      task.start_date || task.tags?.length || task.task_set || task.is_milestone ||
      task.is_recurring || task.priority !== 'medium'
    ),
  );
  const [newSubtask, setNewSubtask] = useState('');
  // Subtaskul se putea DOAR deschide: nu se putea redenumi și nu se putea
  // scoate din task fără să treci prin cartonașul lui.
  const [editingSub, setEditingSub] = useState<string | null>(null);
  const [editingSubTitle, setEditingSubTitle] = useState('');
  /**
   * id → nume, pentru rezolvarea tokenurilor `@[uuid]` din comentarii.
   * Derivat cu `useMemo` din indexul deja cache-uit: un `Record`, nu un `Map` —
   * obiectele simple se compară și se clonează fără surprize în cache-ul React Query.
   */
  const assignableNames = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, person] of Object.entries(assignableIndex)) {
      if (person?.full_name) out[id] = person.full_name;
    }
    return out;
  }, [assignableIndex]);

  /** Candidații pentru selectorul de @mențiuni — aceiași colegi ca la alocare. */
  const mentionPeople = useMemo(() => Object.values(assignableIndex), [assignableIndex]);

  const [commentText, setCommentText] = useState('');
  const [showActivity, setShowActivity] = useState(false);

  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const addComment = useAddCommentWithAttachments(task.id);
  const deleteComment = useDeleteComment(task.id);

  const submitComment = () => {
    if ((!commentText.trim() && commentFiles.length === 0) || addComment.isPending) return;
    addComment.mutate(
      { content: commentText, files: commentFiles },
      {
        onSuccess: () => {
          setCommentText('');
          setCommentFiles([]);
        },
        onError: (error) => {
          console.error('[tasks] comment', error);
          toast.error(t('board.toast.saveFailed'));
        },
      },
    );
  };

  // `useUpdateTask` afișează singur toast-ul de eroare (în `onError`-ul hook-ului),
  // ca să fie imposibil de omis la un call-site nou. Aici rămâne doar logul.
  const patchFor = (
    taskId: string,
    p: Parameters<typeof updateTask.mutate>[0]['patch'],
  ) =>
    updateTask.mutate(
      { id: taskId, patch: p },
      { onError: (error) => console.error('[tasks] update', error) },
    );
  const patch = (p: Parameters<typeof updateTask.mutate>[0]['patch']) => patchFor(task.id, p);

  /**
   * Ce s-a tastat dar nu s-a trimis încă.
   *
   * Câmpurile se salvează la `blur`. Dar Escape și click-ul în afara modalului
   * demontează arborele FĂRĂ să emită blur, deci trei paragrafe scrise se
   * pierdeau tăcut. Ținem valorile într-un ref (citibil din cleanup, unde
   * state-ul e deja cel vechi) împreună cu id-ul task-ului lor — la ieșire le
   * trimitem. `taskId` e obligatoriu: la trecerea de la un task la altul,
   * closure-ul lui `patch` ar scrie pe task-ul GREȘIT.
   */
  const pendingRef = useRef<{ taskId: string; values: Record<string, unknown> } | null>(null);
  const patchForRef = useRef(patchFor);
  patchForRef.current = patchFor;

  const markPending = (field: string, value: unknown, serverValue: unknown) => {
    const current = pendingRef.current?.taskId === task.id ? pendingRef.current.values : {};
    if (value === serverValue) {
      delete current[field];
    } else {
      current[field] = value;
    }
    pendingRef.current = Object.keys(current).length
      ? { taskId: task.id, values: current }
      : null;
  };

  const flushPending = () => {
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending || Object.keys(pending.values).length === 0) return;
    patchForRef.current(pending.taskId, pending.values as Parameters<typeof patch>[0]);
  };

  // Panoul rămâne montat când treci de la un task la altul (același componentă,
  // alt `task.id`) — fără resincronizare, ai edita titlul task-ului precedent.
  //
  // Dependența e DOAR `task.id`. Cu `task.title`/`task.description`/`task.priority`
  // în listă, orice altă modificare a task-ului resincroniza câmpurile: cum
  // `useUpdateTask` patchează cache-urile sincron în `onMutate`, o simplă
  // schimbare de prioritate ștergea comentariul scris pe jumătate.
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description ?? '');
    setTaskSet(task.task_set ?? '');
    setShowOptional(
      Boolean(
        task.start_date || task.tags?.length || task.task_set || task.is_milestone ||
        task.is_recurring || task.priority !== 'medium'
      ),
    );
    setNewSubtask('');
    setCommentText('');
    // Cleanup-ul rulează și la schimbarea task-ului, și la demontare (Escape,
    // click-afară, butonul X) — deci e singurul loc care prinde toate ieșirile.
    return flushPending;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  useEffect(() => {
    const node = titleRef.current;
    if (!node) return;
    node.style.height = '0px';
    node.style.height = `${node.scrollHeight}px`;
  }, [title]);


  const isDone = task.status === 'done';
  const dueDate = task.due_date ? parseISO(task.due_date) : undefined;
  const startDate = task.start_date ? parseISO(task.start_date) : undefined;
  const subtaskProgress = useMemo(
    () => ({ done: subtasks.filter((s) => s.status === 'done').length, total: subtasks.length }),
    [subtasks],
  );

  const addSubtask = async () => {
    const value = newSubtask.trim();
    // Garda de re-intrare: două apăsări de Enter în timpul aceleiași cereri produceau două
    // subtaskuri identice. `createTask.isPending` e starea din React Query, deci se vede
    // imediat ce mutația a pornit — spre deosebire de un `useState` propriu.
    if (!value || createTask.isPending) return;
    // Golim ÎNAINTE de `await`, ca la `quickAdd` din StatusKanban: cât dura cererea, textul
    // rămânea în câmp, părea că n-a mers, iar al doilea Enter îl adăuga din nou.
    setNewSubtask('');
    try {
      await createTask.mutateAsync({
        title: value,
        board_id: task.board_id,
        list_id: task.list_id,
        parent_task_id: task.id,
      });
    } catch (error) {
      console.error('[tasks] subtask', error);
      // Textul se întoarce în câmp — altfel „nu-ți mai inventez rânduri" ar fi devenit
      // „ți-am pierdut ce scriseseși".
      setNewSubtask(value);
      toast.error(t('board.toast.saveFailed'));
    }
  };

  // Acțiunile de antet, definite o dată: pe telefon stau pe primul rand,
  // langa butonul de finalizare; de la `sm` in sus, la capatul randului unic.
  const actiuniAntet = (
    <>
        {/*
          Coșul stă lipit de butonul X, la aceeași mărime. Fără confirmare, un
          click greșit ștergea task-ul ȘI tot arborele lui de subtask-uri
          (cascada e pe server), iar recuperarea era imposibilă din UI.

          Cine nu poate șterge nu vede coșul DELOC, nu unul dezactivat: nu e o
          stare trecătoare (un responsabil nu va căpăta dreptul stând pe ecran),
          iar un buton stins pe propriul task se citește ca defecțiune. Dreptul
          real e al serverului — `canFullyEditTask` doar îl oglindește.
        */}
        {canDelete && (
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
              aria-label={t('board.actions.delete')}
              title={t('board.actions.delete')}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('board.delete.title')}</AlertDialogTitle>
              <AlertDialogDescription>
                {subtaskProgress.total > 0
                  ? t('board.delete.withSubtasks', { count: subtaskProgress.total })
                  : t('board.delete.description')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t('board.actions.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  const deletedId = task.id;
                  const deletedBoard = task.board_id;
                  deleteTask.mutate(
                    { id: deletedId, boardId: deletedBoard },
                    {
                      onSuccess: () => {
                        // Ștergerea e soft, dar serverul nu mai arată rândurile șterse
                        // absolut nimănui — deci fără butonul ăsta recuperarea însemna
                        // SQL manual în producție.
                        toast.success(t('board.toast.deleted'), {
                          action: {
                            label: t('board.actions.undo'),
                            onClick: () =>
                              restoreTask.mutate(
                                { id: deletedId, boardId: deletedBoard },
                                {
                                  onSuccess: () => toast.success(t('board.toast.restored')),
                                  onError: (error) => {
                                    console.error('[tasks] restore', error);
                                    toast.error(taskErrorMessage(error, t));
                                  },
                                },
                              ),
                          },
                        });
                        onClose();
                      },
                      onError: (error) => {
                        console.error('[tasks] delete', error);
                        toast.error(taskErrorMessage(error, t));
                      },
                    },
                  );
                }}
              >
                {t('board.actions.delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        )}
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label={t('board.actions.close')}>
          <X className="h-4 w-4" />
        </Button>
    </>
  );

  return (
    <aside
      className={cn(
        'flex h-full w-full flex-col bg-card',
        !asModal && 'border-l lg:w-[420px]',
      )}
    >
      {/*
        Pe telefon antetul se rupea in PATRU randuri suprapuse: `flex-wrap` cu
        trei controale de latime fixa (buton ~180px + doua selecturi de 145px)
        nu incape in 390px, iar butonul de inchidere ajungea singur pe ultimul
        rand. Doua randuri DELIBERATE: actiunile sus, cele doua selecturi
        dedesubt, impartind latimea. De la `sm` in sus ramane randul unic
        (`sm:contents` scoate wrapperele din calcul).
      */}
      {/*
        Capul cartonașului e TITLUL task-ului, nu bara de unelte.
        Înainte antetul purta butonul de finalizare + două selecturi late, iar coșul și
        închiderea cădeau pe un rând propriu — patru controale înaintea informației pentru
        care ai deschis cartonașul. Titlul urca abia sub ele, în corp.
        Acum: titlul sus (editabil pe loc), acțiunile compacte în dreapta lui, iar coloana
        și boardul coboară printre celelalte câmpuri, unde le e locul.
      */}
      <header className="flex items-start gap-2 border-b px-4 py-3 sm:px-6">
        <div className="min-w-0 flex-1">
          {task.parent_task_id && (
            <button
              type="button"
              onClick={() => onOpenTask?.(task.parent_task_id!)}
              disabled={!onOpenTask}
              className="mb-1 flex items-center gap-1.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:hover:text-muted-foreground"
            >
              <CornerDownRight className="h-3.5 w-3.5 shrink-0" />
              <span className="shrink-0">{t('board.detail.subtaskOf')}</span>
              <span className="min-w-0 truncate font-medium underline-offset-2 hover:underline">
                {parentTask?.title ?? '…'}
              </span>
            </button>
          )}
          <Textarea
            ref={titleRef}
            rows={1}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              markPending('title', e.target.value.trim() || task.title, task.title);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
            onBlur={() => {
              const next = title.trim();
              markPending('title', task.title, task.title);
              if (next && next !== task.title) patch({ title: next });
              else if (!next) setTitle(task.title);
            }}
            placeholder={t('board.detail.titlePlaceholder')}
            className={cn(
              'min-h-0 resize-none overflow-hidden border-0 bg-transparent px-0 py-0 text-lg font-bold leading-snug shadow-none focus-visible:ring-0 sm:text-xl',
              isDone && 'text-muted-foreground line-through',
            )}
            disabled={!canEdit}
          />
        </div>

        {/* Compacte: iconițe, pe același rând cu titlul. Erau un rând întreg pentru două. */}
        <div className="flex shrink-0 items-center gap-1">
          {/*
            Doar iconița, nu propoziția. „Marchează finalizat" ocupa jumătate din antet,
            lângă titlu — iar titlul e motivul pentru care ai deschis cartonașul. Verdele
            spune ce face butonul; textul rămâne în `title`/`aria-label` pentru cine
            citește cu tastatura sau cu cititor de ecran.
            Tonuri PASTEL, ca restul produsului: verde plin doar când e chiar finalizat.
          */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'h-8 w-8',
              isDone
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-950/40',
            )}
            onClick={() => patch({ status: isDone ? 'todo' : 'done' })}
            title={isDone ? t('board.detail.completed') : t('board.detail.markComplete')}
            aria-label={isDone ? t('board.detail.completed') : t('board.detail.markComplete')}
          >
            <CheckCircle2 className="h-4 w-4" />
          </Button>
          {actiuniAntet}
        </div>
      </header>

      {/*
        `min-h-0`: un copil de flex are implicit `min-height: auto`, deci nu
        se contractă sub conținutul lui — `flex-1` singur n-ar plafona
        niciodată înălțimea, iar câmpurile ar fi tăiate de `overflow-hidden`
        al dialogului în loc să se deruleze.

        Derulare NATIVĂ (`overflow-y-auto`), NU `ScrollArea`: în interiorul unui
        `Dialog`, `react-remove-scroll` face `preventDefault()` pe wheel dacă nu
        recunoaște un strămoș derulabil, iar viewportul lui Radix ScrollArea nu
        e recunoscut (copilul lui e `display: table`). Rezultat: conținutul
        depășea vizibilul — `scrollHeight 515 > clientHeight 375` — dar
        `scrollTop` rămânea 0 la rotiță, deci restul câmpurilor erau
        inaccesibile. Reprodus în browser (09-09-2026). Un `div` simplu cu
        `overflow-y-auto` e derulat corect în același dialog.
      */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="space-y-6 p-4 sm:px-6">
          {/*
            Un subtask deschis arăta exact ca un task de sine stătător: nimic nu
            spunea că e parte dintr-un task mai mare, deci nu exista nici drum de
            întoarcere. Linia apare doar când există părinte.
          */}
          <div className="grid gap-3">
            {/*
            Coloana și boardul stau printre câmpuri, nu în antet: sunt proprietăți ale
            task-ului, ca termenul sau responsabilul, nu acțiuni.
          */}
          <Field label={t('board.detail.stateAndBoard')}>
            <div className="flex min-w-0 flex-wrap items-center gap-2 [&>*]:min-w-0">
        {lists.length > 0 ? (
          <Select
            value={task.list_id ?? 'none'}
            onValueChange={(value) => {
              const target = value === 'none' ? null : lists.find((list) => list.id === value) ?? null;
              patch({ list_id: target?.id ?? null, ...moveStatusPatch(task.status, target) });
            }}
          >
            {/* Coloana poartă culoarea ei, ca antetul de pe board: pe un board coloana
                E statusul, deci trebuie să se distingă la fel de repede. */}
            <SelectTrigger
              className={cn(
                'h-8 w-[145px] border-transparent text-xs font-medium',
                listTone(lists.find((list) => list.id === task.list_id)?.color).headerChip,
              )}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  <span className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', listTone(list.color).columnBg)} />
                    {list.name}
                  </span>
                </SelectItem>
              ))}
              <SelectItem value="none">{t('board.detail.noList')}</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <Select value={task.status} onValueChange={(value) => patch({ status: value as TaskStatus })}>
            {/* Statusul poartă culoarea lui, ca pe carduri: „În lucru" și „Gata" trebuie
                să se distingă dintr-o privire, nu după citit. */}
            <SelectTrigger className={cn('h-8 w-[145px] border-transparent text-xs font-medium', STATUS_META[task.status].chip)}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TASK_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  <span className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_META[status].dot)} />
                    {t(`status.${status}`)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {/* „Personal" e o opțiune reală, nu absența uneia: un task fără board
            trebuie să-și poată spune numele și să se poată întoarce acolo. */}
        <Select
          value={task.board_id ?? PERSONAL_BOARD}
          onValueChange={(value) =>
            moveToBoard.mutate(
              {
                taskId: task.id,
                toBoardId: value === PERSONAL_BOARD ? null : value,
                fromBoardId: task.board_id,
              },
              {
                onSuccess: () => toast.success(t('board.moveToBoard.done')),
                onError: (error) => {
                  console.error('[tasks] move to board', error);
                  toast.error(taskErrorMessage(error, t));
                },
              },
            )
          }
        >
          <SelectTrigger className="h-8 min-w-[140px] max-w-[190px] border-transparent bg-muted/50 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={PERSONAL_BOARD}>{t('board.quickAdd.personal')}</SelectItem>
            {/*
              Doar boardurile pe care apelantul le poate EDITA. Lista venea
              filtrată pe „poate vedea", deci conținea și boarduri pe care
              serverul le refuză ca țintă (`forbidden`): alegeai un board, nu
              se întâmpla nimic și primeai un toast generic — un dropdown care
              „nu lucrează".
              `!== false` ca lista să nu se golească dacă serverul nu trimite
              câmpul; boardul curent rămâne mereu, altfel selectorul n-ar avea
              ce afișa.
            */}
            {boards
              .filter((board) => board.can_edit !== false || board.id === task.board_id)
              .map((board) => (
                <SelectItem key={board.id} value={board.id}>{board.name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
            </div>
          </Field>

          <Field label={t('board.detail.assignees')}>
              <AssigneePicker
                boardId={boardId}
                value={task.assignees ?? []}
                onChange={(ids) => patch({ assignees: ids })}
                inDialog={asModal}
              />
            </Field>

            <Field label={t('board.approvals.approvers')}>
              {/*
                Aceeași randare ca la responsabili: NUMELE, nu doar inițialele.
                Cu `variant="chip"` câmpul arăta două litere într-un cerc, iar
                cine trebuia să aprobe se ghicea din avatar (raportat 10-09-2026).
              */}
              <AssigneePicker
                boardId={boardId}
                inDialog={asModal}
                placeholder={t('board.approvals.noApprovers')}
                value={task.approver_ids ?? []}
                onChange={(ids) =>
                  setApprovers.mutate(
                    { taskId: task.id, approverIds: ids },
                    {
                      onError: (error) => {
                        console.error('[tasks] approvers', error);
                        toast.error(t('board.toast.saveFailed'));
                      },
                    },
                  )
                }
              />
              {(task.approver_ids ?? []).length > 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {task.approved_at
                    ? t('board.approvals.approvedOn', {
                        date: format(parseISO(task.approved_at), 'd MMM yyyy', { locale: dateLocale }),
                      })
                    : t('board.approvals.needsApproval')}
                </p>
              )}
            </Field>

            <Field label={t('board.detail.dueDate')}>
              <DateField
                value={dueDate}
                locale={dateLocale}
                placeholder={t('board.detail.noDate')}
                onChange={(date) => patch({ due_date: date ? toDueDateIso(date) : null })}
              />
            </Field>

            {showOptional && (
              <>
                <Field label={t('board.detail.startDate')}>
                  <DateField
                    value={startDate}
                    locale={dateLocale}
                    placeholder={t('board.detail.noDate')}
                    onChange={(date) => patch({ start_date: date ? toDueDateIso(date) : null })}
                  />
                </Field>

                <Field label={t('board.recurrence.label')}>
                  <RecurrenceEditor
                    enabled={task.is_recurring}
                    rule={task.recurrence_rule}
                    onChange={(enabled, rule) => patch({ is_recurring: enabled, recurrence_rule: rule })}
                  />
                </Field>
              </>
            )}

            {!showOptional && (
              <Button
                variant="ghost"
                size="sm"
                className="w-fit gap-1.5 text-muted-foreground"
                onClick={() => setShowOptional(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                {t('board.detail.addOptional')}
              </Button>
            )}

            {showOptional && (
              <>
                <Field label={t('board.detail.priority')}>
                  <Select value={task.priority} onValueChange={(value) => patch({ priority: value as TaskPriority })}>
                    <SelectTrigger className="h-9 border-transparent bg-transparent px-2 shadow-none hover:bg-muted">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITIES.map((priority) => (
                        <SelectItem key={priority} value={priority}>
                          <span className={cn('rounded px-1.5 py-0.5 text-xs', PRIORITY_META[priority].chip)}>
                            {t(`priority.${priority}`)}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field label={t('board.detail.tags')}>
                  <TaskTagEditor value={task.tags ?? []} onChange={(tags) => patch({ tags })} />
                </Field>

                <Field label={t('board.taskSets.single')}>
                  <Input
                    value={taskSet}
                    maxLength={120}
                    onChange={(event) => {
                      setTaskSet(event.target.value);
                      markPending('task_set', event.target.value.trim() || null, task.task_set ?? null);
                    }}
                    onBlur={() => {
                      const next = taskSet.trim();
                      markPending('task_set', task.task_set ?? null, task.task_set ?? null);
                      if (next !== (task.task_set ?? '')) patch({ task_set: next || null });
                    }}
                    placeholder={t('board.taskSets.placeholder')}
                    className="h-9 border-transparent bg-transparent px-2 shadow-none hover:bg-muted focus-visible:bg-background"
                  />
                </Field>

                <Field label={t('board.gantt.isMilestone')}>
                  <label className="flex min-h-8 items-center gap-2 px-2 text-sm">
                    <Checkbox
                      checked={task.is_milestone === true}
                      onCheckedChange={(value) => patch({ is_milestone: value === true })}
                    />
                    <Diamond className="h-3.5 w-3.5 text-violet-600" />
                    {t('board.gantt.isMilestone')}
                  </label>
                </Field>

              </>
            )}
          </div>

          <Separator />

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">{t('board.detail.description')}</Label>
            <Textarea
              rows={4}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                markPending('description', e.target.value.trim() || null, task.description ?? null);
              }}
              onBlur={() => {
                markPending('description', task.description ?? null, task.description ?? null);
                if (description !== (task.description ?? '')) {
                  patch({ description: description.trim() || null });
                }
              }}
              placeholder={t('board.detail.descriptionPlaceholder')}
              className="resize-none text-sm"
            />
          </div>


          <Section
            title={t('board.detail.subtasks')}
            count={
              subtaskProgress.total > 0
                ? `${subtaskProgress.done}/${subtaskProgress.total}`
                : undefined
            }
          >
            <div className="space-y-1">
              {subtasks.map((sub) => (
                <div key={sub.id} className="group/sub flex items-start gap-2 rounded-md px-1 py-1 hover:bg-accent">
                  <button
                    type="button"
                    onClick={() =>
                      updateTask.mutate({
                        id: sub.id,
                        patch: { status: sub.status === 'done' ? 'todo' : 'done' },
                      })
                    }
                    className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-emerald-600"
                    aria-label={sub.status === 'done' ? t('board.detail.completed') : t('board.detail.markComplete')}
                  >
                    {sub.status === 'done' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </button>
                  {editingSub === sub.id ? (
                    <Input
                      autoFocus
                      value={editingSubTitle}
                      onChange={(event) => setEditingSubTitle(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                        if (event.key === 'Escape') {
                          setEditingSub(null);
                          setEditingSubTitle('');
                        }
                      }}
                      onBlur={() => {
                        const curat = editingSubTitle.trim();
                        if (curat && curat !== sub.title) {
                          updateTask.mutate({ id: sub.id, patch: { title: curat } });
                        }
                        setEditingSub(null);
                        setEditingSubTitle('');
                      }}
                      className="h-7 min-w-0 flex-1 text-sm"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onOpenTask?.(sub.id)}
                      className={cn(
                        // Se rupe pe rânduri, nu se taie cu „…": un subtask e o
                        // propoziție întreagă („internalizarea căutării inteligente
                        // (presupune curățarea bazei de duplicate)"), iar din primele
                        // 40 de caractere nu se înțelege ce e de făcut.
                        'min-w-0 flex-1 whitespace-normal break-words text-left text-sm hover:underline',
                        sub.status === 'done' && 'text-muted-foreground line-through',
                      )}
                    >
                      {sub.title}
                    </button>
                  )}

                  {/*
                    Redenumire pe loc și scoatere din task, fără să deschizi
                    cartonașul subtaskului. Pe desktop apar la hover; pe telefon
                    rămân vizibile, fiindcă hover-ul nu există.
                  */}
                  {(canManage || canDeleteSubtask(sub, {
                    userId: user?.id,
                    isHRAdmin,
                    isSuperAdmin,
                    board: boards.find((b) => b.id === sub.board_id) ?? null,
                  })) && editingSub !== sub.id && (
                    <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/sub:opacity-100 sm:focus-within:opacity-100">
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingSub(sub.id);
                            setEditingSubTitle(sub.title);
                          }}
                          className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                          aria-label={t('board.detail.renameSubtask')}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const subId = sub.id;
                          deleteTask.mutate(
                            { id: subId, boardId: task.board_id },
                            {
                              onSuccess: () =>
                                toast.success(t('board.toast.deleted'), {
                                  action: {
                                    label: t('board.actions.undo'),
                                    onClick: () =>
                                      restoreTask.mutate({ id: subId, boardId: task.board_id }),
                                  },
                                }),
                              onError: (error) => {
                                console.error('[tasks] delete subtask', error);
                                toast.error(taskErrorMessage(error, t));
                              },
                            },
                          );
                        }}
                        className="rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                        aria-label={t('board.detail.removeSubtask')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {/*
                    Un subtask e tot un task, deci poate avea alt responsabil
                    decât părintele — de multe ori exact ăsta e rostul lui.
                  */}
                  <AssigneePicker
                    boardId={boardId}
                    value={sub.assignees ?? []}
                    onChange={(ids) =>
                      updateTask.mutate({ id: sub.id, patch: { assignees: ids } })
                    }
                    variant="chip"
                    inDialog={asModal}
                    className="mt-0.5 shrink-0"
                  />
                </div>
              ))}
              <InlineAdd
                value={newSubtask}
                onValueChange={setNewSubtask}
                placeholder={t('board.detail.addSubtask')}
                onSubmit={addSubtask}
              />
            </div>
          </Section>

          <Section title={t('board.deps.label')}>
            <TaskDependencies
              task={task}
              candidates={boardTasks}
              canEdit={canEdit}
              onOpenTask={onOpenTask}
              inDialog={asModal}
            />
          </Section>

          <Separator />

          <Section title={t('board.detail.comments')} count={comments.length || undefined}>
            <div className="space-y-3">
              {comments.length === 0 && (
                <p className="text-sm text-muted-foreground">{t('board.detail.noComments')}</p>
              )}
              {comments.map((comment) => {
                // Autorul poate lipsi (cont șters): comentariul rămâne, cu „Utilizator".
                const author = comment.user_id ? assignableIndex[comment.user_id] : undefined;
                return (
                  <div key={comment.id} className="group flex gap-2.5">
                    <span
                      className={cn(
                        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                        avatarClass(comment.user_id ?? 'necunoscut'),
                      )}
                    >
                      {initialsOf(author?.full_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs font-medium">
                          {author?.full_name ?? t('board.detail.unknownUser')}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {format(parseISO(comment.created_at), 'd MMM, HH:mm', { locale: dateLocale })}
                        </span>
                        {comment.user_id === user?.id && (
                          <button
                            type="button"
                            onClick={() => deleteComment.mutate(comment.id)}
                            // Vizibil și la focus din tastatură, nu doar la hover — altfel Tab ajunge pe un buton invizibil.
                            className="ml-auto opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                            aria-label={t('board.detail.deleteComment', { defaultValue: 'Șterge comentariul' })}
                          >
                            <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                          </button>
                        )}
                      </div>
                      <CommentBody
                        content={comment.content}
                        names={assignableNames}
                        meId={user?.id}
                      />
                      <CommentAttachments taskId={task.id} attachments={comment.attachments ?? []} />
                    </div>
                  </div>
                );
              })}

            </div>
          </Section>

          <div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground"
              onClick={() => setShowActivity((v) => !v)}
            >
              <History className="h-3.5 w-3.5" />
              {showActivity ? t('board.detail.hideActivity') : t('board.detail.showActivity')}
            </Button>

            {showActivity && (
              <div className="mt-3">
                {/*
                  Jurnalul arăta doar verbul: „a schimbat responsabilii", fără să
                  spună PE CINE, „a schimbat statusul", fără din ce în ce. Datele
                  erau acolo de la început (`from_value`/`to_value`, scrise de
                  server la fiecare schimbare); afișarea le arunca.
                */}
                <TaskActivityTimeline
                  entries={activity}
                  people={assignableIndex}
                  lists={lists}
                  boards={boards}
                  locale={dateLocale}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="z-10 shrink-0 space-y-1.5 border-t bg-card/95 p-3 backdrop-blur">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              'mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
              avatarClass(user?.id ?? 'me'),
            )}
          >
            {initialsOf(assignableIndex[user?.id ?? '']?.full_name)}
          </span>
          <MentionTextarea
            rows={2}
            value={commentText}
            onValueChange={setCommentText}
            people={mentionPeople}
            onSubmit={submitComment}
            onPaste={(event) => {
              const pasted: File[] = [];
              for (const item of Array.from(event.clipboardData?.items ?? [])) {
                if (item.kind !== 'file') continue;
                const raw = item.getAsFile();
                if (!raw) continue;
                const file = raw.name && raw.name !== 'image.png'
                  ? raw
                  : new File([raw], `screenshot-${Date.now()}.png`, {
                      type: raw.type || 'image/png',
                    });
                if (file.size <= 10 * 1024 * 1024) pasted.push(file);
              }
              if (pasted.length === 0) return;
              event.preventDefault();
              setCommentFiles((current) => [...current, ...pasted].slice(0, 10));
              toast.success(t('board.attachments.pasted', { count: pasted.length }));
            }}
            placeholder={t('board.detail.commentPlaceholder')}
            className="min-h-9 flex-1 resize-none text-sm"
          />
          <Button
            size="sm"
            className="h-9 shrink-0 gap-1.5 self-end"
            disabled={
              (!commentText.trim() && commentFiles.length === 0) || addComment.isPending
            }
            onClick={submitComment}
          >
            {addComment.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="h-4 w-4" />
            )}
            {t('board.detail.sendComment')}
          </Button>
        </div>
        <AttachmentPicker
          files={commentFiles}
          onChange={setCommentFiles}
          disabled={addComment.isPending}
          className="pl-9"
        />
      </div>
    </aside>
  );
}

interface RecurrenceEditorProps {
  enabled: boolean;
  rule: string | null;
  onChange: (enabled: boolean, rule: string | null) => void;
}

function RecurrenceEditor({
  enabled,
  rule,
  onChange,
}: RecurrenceEditorProps) {
  const { t } = useTasksT();
  const parsed = parseRecurrence(rule);
  const commit = (next: RecurrenceRule) => onChange(true, JSON.stringify(next));

  return (
    <div className="space-y-2 rounded-lg bg-muted/30 p-2">
      <label className="flex min-h-8 items-center gap-2 text-sm">
        <Checkbox
          checked={enabled}
          onCheckedChange={(value) =>
            onChange(
              value === true,
              value === true ? JSON.stringify(parsed) : null,
            )
          }
        />
        <Repeat className="h-3.5 w-3.5 text-muted-foreground" />
        {t('board.recurrence.label')}
      </label>
      {enabled && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('board.recurrence.every')}</span>
            <Input
              type="number"
              min={1}
              max={99}
              value={parsed.interval}
              onChange={(event) => commit({
                ...parsed,
                interval: Math.max(1, Math.min(99, Number(event.target.value) || 1)),
              })}
              aria-label={t('board.recurrence.every')}
              className="h-8 w-16 text-xs"
            />
            <Select
              value={parsed.frequency}
              onValueChange={(frequency) => commit({
                ...parsed,
                frequency: frequency as RecurrenceRule['frequency'],
              })}
            >
              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['daily', 'weekly', 'monthly', 'yearly'] as const).map((frequency) => (
                  <SelectItem key={frequency} value={frequency} className="text-xs">
                    {t(`board.recurrence.${frequency}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {parsed.frequency === 'weekly' && (
            <div className="flex flex-wrap gap-1">
              {WEEK_DAYS.map((day) => {
                const active = parsed.days.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => commit({
                      ...parsed,
                      days: active
                        ? parsed.days.filter((value) => value !== day)
                        : [...parsed.days, day],
                    })}
                    className={cn(
                      'h-7 w-8 rounded-md border text-[11px] font-medium transition-colors',
                      active
                        ? 'border-foreground bg-foreground text-background'
                        : 'bg-background text-muted-foreground hover:border-foreground/40',
                    )}
                  >
                    {t(`board.recurrence.days.${day}`)}
                  </button>
                );
              })}
            </div>
          )}
          <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {t('board.recurrence.endsAt')}
            <Input
              type="date"
              value={parsed.ends_at ?? ''}
              onChange={(event) => commit({ ...parsed, ends_at: event.target.value || null })}
              className="h-8 w-[155px] text-xs"
            />
          </label>
        </>
      )}
    </div>
  );
}

interface FieldProps {
  label: string;
  children: ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div className="grid gap-1 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-start sm:gap-3">
      <Label className="block pt-2 text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

interface SectionProps {
  title: string;
  count?: string | number;
  children: ReactNode;
}

function Section({
  title,
  count,
  children,
}: SectionProps) {
  return (
    <div className="space-y-3.5">
      <div className="flex items-center gap-2">
        {/* Titluri normale, apăsate — nu majuscule mici gri. Majusculele
            făceau secțiunile („SUBTASK-URI", „DEPINDE DE") să pară etichete de
            formular, nu capitole ale task-ului. */}
        <Label className="text-sm font-semibold text-foreground">{title}</Label>
        {count !== undefined && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

interface InlineAddProps {
  value: string;
  onValueChange: (v: string) => void;
  placeholder: string;
  onSubmit: () => void;
}

function InlineAdd({
  value,
  onValueChange,
  placeholder,
  onSubmit,
}: InlineAddProps) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder={placeholder}
        className="h-7 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
      />
      {value.trim() && (
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onSubmit} aria-label={placeholder}>
          <Check className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

interface DateFieldProps {
  value: Date | undefined;
  onChange: (d: Date | undefined) => void;
  placeholder: string;
  locale: Locale;
}

function DateField({
  value,
  onChange,
  placeholder,
  locale,
}: DateFieldProps) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-9 w-full justify-start gap-2 px-2 font-normal hover:bg-muted">
          <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
          {value ? (
            format(value, 'd MMM yyyy', { locale })
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
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
              {placeholder}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
