import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2, Plus } from 'lucide-react';
import {
  Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/tasks/ui';
import { useBoards, useCreateTask } from '@/hooks/useTaskBoards';
import { toast } from '@/lib/tasks/toast';
import { useTasksT } from '@/lib/tasks/useTasksT';
import type { BoardTask } from '@/lib/tasks/types';

/** Sentinela din Select pentru „fără board” — taskul rămâne personal. */
const PERSONAL = '__personal__';

interface TaskQuickAddBarProps {
  /** Pe „Taskurile mele” noul task trebuie să rămână vizibil după creare. */
  assigneeId?: string | null;
  /** Pe un board fix selectorul pornește de aici; utilizatorul îl poate schimba. */
  defaultBoardId?: string | null;
  onCreated?: (task: BoardTask) => void;
}

/**
 * Calea rapidă comună pentru „Taskurile mele” și „Toate taskurile”. Inputul
 * rămâne focusat după Enter, astfel încât introducerea unei liste să nu ceară
 * câte un click pentru fiecare rând.
 *
 * Boardul e opțional: dacă nu alegi niciunul, taskul rămâne personal
 * (`board_id: null`) — nu-l forțăm pe primul board din listă.
 */
export function TaskQuickAddBar({
  assigneeId,
  defaultBoardId = null,
  onCreated,
}: TaskQuickAddBarProps) {
  const { t } = useTasksT();
  const { data: boards = [] } = useBoards();
  const createTask = useCreateTask();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [boardId, setBoardId] = useState(defaultBoardId ?? PERSONAL);

  useEffect(() => {
    if (defaultBoardId && boards.some((board) => board.id === defaultBoardId)) {
      setBoardId(defaultBoardId);
    }
  }, [boards, defaultBoardId]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const clean = title.trim();
    if (!clean || createTask.isPending) return;
    try {
      const created = await createTask.mutateAsync({
        title: clean,
        board_id: boardId === PERSONAL ? null : boardId,
        assignees: assigneeId ? [assigneeId] : [],
      });
      setTitle('');
      onCreated?.(created);
      window.requestAnimationFrame(() => inputRef.current?.focus());
      toast.success(t('board.quickAdd.created'));
    } catch (error) {
      console.error('[tasks] quick add', error);
      toast.error((error as { message?: string })?.message || t('board.toast.saveFailed'));
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2 shadow-sm"
    >
      <input
        ref={inputRef}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        maxLength={300}
        placeholder={
          assigneeId ? t('board.quickAdd.forMePlaceholder') : t('board.quickAdd.placeholder')
        }
        aria-label={t('board.quickAdd.titleLabel')}
        className="h-8 w-full min-w-0 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground sm:w-auto sm:min-w-[220px] sm:flex-1"
      />
      {/*
        Selectorul spune UNDE se creează taskul nou — NU filtrează lista.
        Prefixul „în" singur nu a fost de ajuns: cât timp arăta ca un chip de
        filtru, imediat sub rândul de filtre, a fost citit a treia oară ca
        „filtrează după board" („schimb boardul și nu se întâmplă nimic",
        10-09-2026). Deci nu mai arată ca ele: text inline, fără chenar, iar
        filtrele de deasupra își scriu acum eticheta în trigger („Board: …").

        Pe telefon selectorul și butonul împart un rând: cu `w-full` bara
        creștea la trei rânduri suprapuse și împingea lista sub fold.
      */}
      <span className="shrink-0 text-xs text-muted-foreground">{t('board.quickAdd.into')}</span>
      <Select value={boardId} onValueChange={setBoardId}>
        <SelectTrigger
          className="h-8 min-w-0 flex-1 gap-1 rounded-md border-0 bg-transparent px-1.5 text-xs font-medium shadow-none hover:bg-muted focus:ring-0 focus:ring-offset-0 sm:w-auto sm:flex-none"
          aria-label={t('board.quickAdd.boardLabel')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PERSONAL}>{t('board.quickAdd.personal')}</SelectItem>
          {boards.map((board) => (
            <SelectItem key={board.id} value={board.id}>
              {board.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="submit"
        size="sm"
        className="h-8 gap-1.5"
        disabled={!title.trim() || createTask.isPending}
      >
        {createTask.isPending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
        {t('board.quickAdd.add')}
      </Button>
    </form>
  );
}
