// Bara de filtre — aceeași pe board, pe „Taskurile mele" și pe „Toate
// task-urile", ca să nu înveți trei UI-uri pentru același lucru.
//
// Filtrarea rulează local, peste task-urile deja încărcate (vezi
// `lib/tasks/filters.ts`), deci schimbarea unui filtru e instantanee.

import { useEffect, useMemo, useState } from 'react';
import { Filter, Search, X } from 'lucide-react';
import {
  Button,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/tasks/ui';
import { useAssignableUsers, useBoards } from '@/hooks/useTaskBoards';
import { useTasksT } from '@/lib/tasks/useTasksT';
import {
  EMPTY_FILTERS,
  PERSONAL_BOARD_FILTER, PERIOD_PRESETS, activeFilterCount,
  type TaskFilterState,
} from '@/lib/tasks/filters';
import { distinctTags } from '@/lib/tasks/tags';
import { TASK_PRIORITIES, TASK_STATUSES } from '@/lib/tasks/types';
import type { BoardTask, TaskPriority, TaskStatus } from '@/lib/tasks/types';

interface TaskFilterBarProps {
  filters: TaskFilterState;
  onChange: (filters: TaskFilterState) => void;
  tasks: BoardTask[];
  boardId?: string | null;
  showBoardFilter?: boolean;
  showPersonFilter?: boolean;
  /**
   * Desfășurat: dropdown-urile stau în rând, direct sub titlu, ca să vezi din
   * start pe ce ești filtrat. Popoverul rămâne pentru ecranele înguste, unde
   * șase controale unul lângă altul nu încap.
   */
  variant?: 'popover' | 'expanded';
  /**
   * Ce se pune la capătul rândului de unelte (în practică: butonul de sortare).
   * Sortarea stătea pe rândul ei, aliniată la dreapta, la doi centimetri de filtre —
   * două butoane care fac același fel de lucru, pe două rânduri diferite.
   */
  trailing?: React.ReactNode;
}

/** `'all'` e valoarea sentinelă a Select-ului; în starea filtrelor devine `null`. */
const ALL = 'all';

export function TaskFilterBar({
  filters,
  onChange,
  tasks,
  boardId,
  showBoardFilter = true,
  showPersonFilter = true,
  variant = 'popover',
  trailing,
}: TaskFilterBarProps) {
  const { t } = useTasksT();
  const { data: boards = [] } = useBoards();
  const { data: people = [] } = useAssignableUsers(boardId);
  const tags = useMemo(() => distinctTags(tasks), [tasks]);
  const count = activeFilterCount(filters);

  const set = (patch: Partial<TaskFilterState>) => onChange({ ...filters, ...patch });

  /**
   * Căutarea, debounced.
   *
   * Fiecare tastă declanșa o schimbare de filtre, iar preferința de vizualizare
   * se salvează la schimbarea filtrelor — deci o scriere în DB per caracter.
   * Inputul rămâne controlat local ca să nu „sară" cursorul, și se resincronizează
   * când filtrele se schimbă din altă parte (ex. „Resetează filtrele").
   */
  const [searchDraft, setSearchDraft] = useState(filters.search ?? '');
  useEffect(() => {
    setSearchDraft(filters.search ?? '');
  }, [filters.search]);
  useEffect(() => {
    const current = filters.search ?? '';
    if (searchDraft === current) return;
    const id = window.setTimeout(() => onChange({ ...filters, search: searchDraft }), 250);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft]);


  /**
   * Câmpurile de filtrare — o singură definiție, două locuri de afișare.
   *
   * Erau scrise de DOUĂ ori: o dată în rândul desfășurat, o dată în popover. Două copii
   * ale aceleiași liste înseamnă că următorul filtru se adaugă doar într-una din ele —
   * exact ce s-a întâmplat cu „Etichetă", care lipsea din popover când lista de
   * etichete era goală, dar apărea în rândul desfășurat.
   */
  const filterFields = (
    <>
    {showBoardFilter && (
      <FilterRow label={t('board.filters.board')}>
        <Select
          value={filters.boardId ?? ALL}
          onValueChange={(v) => set({ boardId: v === ALL ? null : v })}
        >
          <SelectTrigger className="h-8 text-xs" aria-label={t('board.filters.board')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('board.filters.allBoards')}</SelectItem>
            {/* „Personal" e un board ca oricare pentru filtrare: fără el,
                task-urile fără board nu se puteau izola niciodată. */}
            <SelectItem value={PERSONAL_BOARD_FILTER}>
              {t('board.quickAdd.personal')}
            </SelectItem>
            {boards.map((board) => (
              <SelectItem key={board.id} value={board.id}>
                {board.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
    )}

    {showPersonFilter && (
      <FilterRow label={t('board.filters.person')}>
        <Select
          value={filters.person ?? ALL}
          onValueChange={(v) => set({ person: v === ALL ? null : v })}
        >
          <SelectTrigger className="h-8 text-xs" aria-label={t('board.filters.person')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('board.filters.anyPerson')}</SelectItem>
            {people.map((person) => (
              <SelectItem key={person.user_id} value={person.user_id}>
                {person.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
    )}

    <FilterRow label={t('board.filters.status')}>
      <Select
        value={filters.status ?? ALL}
        onValueChange={(v) => set({ status: v === ALL ? null : (v as TaskStatus) })}
      >
        <SelectTrigger className="h-8 text-xs" aria-label={t('board.filters.status')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('board.filters.anyStatus')}</SelectItem>
          {TASK_STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {t(`status.${status}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterRow>

    <FilterRow label={t('board.filters.priority')}>
      <Select
        value={filters.priority ?? ALL}
        onValueChange={(v) => set({ priority: v === ALL ? null : (v as TaskPriority) })}
      >
        <SelectTrigger className="h-8 text-xs" aria-label={t('board.filters.priority')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('board.filters.anyPriority')}</SelectItem>
          {TASK_PRIORITIES.map((priority) => (
            <SelectItem key={priority} value={priority}>
              {t(`priority.${priority}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterRow>

    <FilterRow label={t('board.filters.period')}>
      <Select
        value={filters.period ?? 'all'}
        onValueChange={(v) => set({ period: v as TaskFilterState['period'] })}
      >
        <SelectTrigger className="h-8 text-xs" aria-label={t('board.filters.period')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_PRESETS.map((preset) => (
            <SelectItem key={preset} value={preset}>
              {t(`board.filters.periods.${preset}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterRow>

    {filters.period === 'custom' && (
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="date"
          value={filters.from ?? ''}
          onChange={(e) => set({ from: e.target.value || null })}
          aria-label={t('board.filters.from', { defaultValue: 'De la' })}
          className="h-8 text-xs"
        />
        <Input
          type="date"
          value={filters.to ?? ''}
          onChange={(e) => set({ to: e.target.value || null })}
          aria-label={t('board.filters.to', { defaultValue: 'Până la' })}
          className="h-8 text-xs"
        />
      </div>
    )}

    {tags.length > 0 && (
      <FilterRow label={t('board.filters.tag')}>
        <Select
          value={filters.tag ?? ALL}
          onValueChange={(v) => set({ tag: v === ALL ? null : v })}
        >
          <SelectTrigger className="h-8 text-xs" aria-label={t('board.filters.tag')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('board.filters.anyTag')}</SelectItem>
            {tags.map((tag) => (
              <SelectItem key={tag.label} value={tag.label}>
                {tag.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterRow>
    )}

    {count > 0 && (
      <Button
        variant="ghost"
        size="sm"
        className="w-full gap-1.5 text-xs"
        onClick={() => onChange({ ...EMPTY_FILTERS, includeDone: filters.includeDone })}
      >
        <X className="h-3.5 w-3.5" />
        {t('board.filters.clear')}
      </Button>
    )}
    </>
  );

  /**
   * Chip-urile filtrelor active.
   *
   * Un select care scrie „Orice status" nu spune nimic: ocupă un rând întreg ca să te anunțe
   * că NU filtrează. Șase dintre ele se rupeau pe două rânduri și împingeau lista sub fold.
   * Aici rândul are trei lucruri (caută, filtre, sortare), iar ce e chiar APLICAT apare ca
   * chip, cu X — deci vezi din prima pe ce ești filtrat și îl scoți dintr-un click.
   */
  const chips: { key: string; label: string; value: string; clear: Partial<TaskFilterState> }[] = [];
  if (filters.search && filters.search.trim()) {
    chips.push({ key: 'search', label: t('board.filters.search'), value: filters.search.trim(), clear: { search: null } });
  }
  if (filters.period && filters.period !== 'all') {
    chips.push({
      key: 'period',
      label: t('board.filters.period'),
      value: t(`board.filters.periods.${filters.period}`),
      clear: { period: 'all', from: null, to: null },
    });
  }
  if (filters.boardId) {
    chips.push({
      key: 'board',
      label: t('board.filters.board'),
      value:
        filters.boardId === PERSONAL_BOARD_FILTER
          ? t('board.quickAdd.personal')
          : boards.find((b) => b.id === filters.boardId)?.name ?? '—',
      clear: { boardId: null },
    });
  }
  if (filters.status) {
    chips.push({ key: 'status', label: t('board.filters.status'), value: t(`status.${filters.status}`), clear: { status: null } });
  }
  if (filters.priority) {
    chips.push({ key: 'priority', label: t('board.filters.priority'), value: t(`priority.${filters.priority}`), clear: { priority: null } });
  }
  if (filters.tag) {
    chips.push({ key: 'tag', label: t('board.filters.tag'), value: filters.tag, clear: { tag: null } });
  }
  if (filters.person) {
    chips.push({
      key: 'person',
      label: t('board.filters.person'),
      value: people.find((p) => p.user_id === filters.person)?.full_name ?? '—',
      clear: { person: null },
    });
  }

  const chipsRow = chips.length > 0 && (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full border bg-accent py-0.5 pl-2.5 pr-1 text-xs"
        >
          <span className="text-muted-foreground">{chip.label}:</span>
          <span className="max-w-[180px] truncate font-medium">{chip.value}</span>
          <button
            type="button"
            onClick={() => set(chip.clear)}
            className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
            aria-label={t('board.filters.removeFilter', { name: chip.label })}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs text-muted-foreground"
        onClick={() => onChange({ ...EMPTY_FILTERS, includeDone: filters.includeDone })}
      >
        {t('board.filters.clear')}
      </Button>
    </div>
  );

  if (variant === 'expanded') {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Lupa: fără ea, câmpul gol arată ca orice alt input de text. */}
          <div className="relative min-w-0 flex-1 sm:max-w-[280px] sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder={t('board.filters.search')}
              aria-label={t('board.filters.search')}
              className="h-9 w-full pl-8 text-xs"
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 shrink-0 gap-1.5 text-xs">
                <Filter className="h-3.5 w-3.5" />
                {t('board.filters.button')}
                {count > 0 && (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                    {count}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3 p-3" align="start">
              {filterFields}
            </PopoverContent>
          </Popover>

          {/* Sortarea stă în ACELAȘI rând: erau două butoane pe două rânduri, la capete opuse. */}
          {trailing}
        </div>

        {chipsRow}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Input
        value={filters.search ?? ''}
        onChange={(e) => set({ search: e.target.value })}
        placeholder={t('board.filters.search')}
        aria-label={t('board.filters.search')}
        className="h-8 w-[150px] text-xs sm:w-[190px]"
      />

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
            <Filter className="h-3.5 w-3.5" />
            {t('board.filters.button')}
            {count > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
                {count}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-3 p-3" align="end">
          {filterFields}
        </PopoverContent>
      </Popover>
    </div>
  );
}

interface FilterRowProps {
  label: string;
  children: React.ReactNode;
}

function FilterRow({ label, children }: FilterRowProps) {
  return (
    <div className="space-y-1">
      <Label className="text-[11px] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
