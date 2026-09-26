// Controlul de sortare și grupare — același pe toate vederile, ca bara de filtre.
//
// Un singur buton cu popover, nu antete de tabel apăsabile: vederile modulului
// nu sunt tabele (Lista randează carduri grupate pe coloană, Ganttul e o axă,
// Calendarul o grilă de zile), iar pe telefon un antet de coloană n-are unde să
// existe. Butonul spune ÎN CLAR pe ce e sortat — altfel utilizatorul vede o
// listă în altă ordine decât se aștepta și n-are de unde ști de ce.

import { ArrowDownUp, ArrowDown, ArrowUp, Layers, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, Label, Popover, PopoverContent, PopoverTrigger } from '@/components/tasks/ui';
import { useTasksT } from '@/lib/tasks/useTasksT';
import {
  DEFAULT_SORT, GROUP_KEYS, SORT_KEYS,
  type GroupKey, type SortKey, type SortState,
} from '@/lib/tasks/sorting';

interface TaskSortControlProps {
  sort: SortState;
  onSortChange: (sort: SortState) => void;
  /** Gruparea e opțională: Ganttul și Calendarul n-au benzi. */
  group?: GroupKey;
  onGroupChange?: (group: GroupKey) => void;
  /** Cheile nepotrivite pentru vederea curentă (ex. „status" într-un Kanban pe status). */
  hiddenSortKeys?: SortKey[];
  className?: string;
}

export function TaskSortControl({
  sort,
  onSortChange,
  group,
  onGroupChange,
  hiddenSortKeys = [],
  className,
}: TaskSortControlProps) {
  const { t } = useTasksT();

  const sortKeys = SORT_KEYS.filter((key) => !hiddenSortKeys.includes(key));
  // `!!sort.key`: o vedere salvată veche putea întoarce `key: undefined`, iar butonul
  // ajungea să afișeze cheia brută `sort.undefined`. Normalizarea e în `normalizeSort`;
  // asta e plasa de siguranță pentru orice apelant care o sare.
  const isSorted = !!sort.key && sort.key !== DEFAULT_SORT.key;
  const isGrouped = !!group && group !== 'none';
  const DirIcon = sort.dir === 'asc' ? ArrowUp : ArrowDown;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-9 gap-1.5', (isSorted || isGrouped) && 'border-primary/40', className)}
          /* Pe telefon eticheta e ascunsă și rămâne doar iconița. */
          aria-label={isSorted ? `${t('sort.label')}: ${t(`sort.${sort.key}`)}` : t('sort.label')}
        >
          <ArrowDownUp className="h-3.5 w-3.5" />
          {/* Eticheta arată STAREA, nu doar numele controlului: o listă sortată
              altfel decât implicit trebuie să se explice singură. */}
          <span className="hidden sm:inline">
            {isSorted ? t(`sort.${sort.key}`) : t('sort.label')}
          </span>
          {isSorted && <DirIcon className="h-3 w-3 text-muted-foreground" />}
          {isGrouped && (
            <span className="ml-0.5 inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              <Layers className="h-2.5 w-2.5" />
              <span className="hidden sm:inline">{t(`group.${group}`)}</span>
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent className="z-[80] w-64 p-3" align="end">
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('sort.label')}
            </Label>
            <div className="grid grid-cols-2 gap-1">
              {sortKeys.map((key) => {
                const activeKey = sort.key === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() =>
                      onSortChange(
                        // Re-clic pe cheia activă inversează direcția: e gestul
                        // pe care îl are oricine în minte de la orice tabel.
                        activeKey
                          ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
                          : { key, dir: key === 'created_at' ? 'desc' : 'asc' },
                      )
                    }
                    className={cn(
                      'flex items-center justify-between gap-1 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                      activeKey
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <span className="truncate">{t(`sort.${key}`)}</span>
                    {activeKey && <DirIcon className="h-3 w-3 shrink-0" />}
                  </button>
                );
              })}
            </div>
            {isSorted && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-full justify-start gap-1.5 px-2 text-xs text-muted-foreground"
                onClick={() => onSortChange({ ...DEFAULT_SORT })}
              >
                <X className="h-3 w-3" />
                {t('sort.clear')}
              </Button>
            )}
          </div>

          {onGroupChange && (
            <div className="space-y-1.5 border-t pt-3">
              <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t('group.label')}
              </Label>
              <div className="grid grid-cols-2 gap-1">
                {GROUP_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onGroupChange(key)}
                    className={cn(
                      'truncate rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                      group === key
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    {t(`group.${key}`)}
                  </button>
                ))}
              </div>
              {isGrouped && (
                <p className="pt-0.5 text-[10px] leading-snug text-muted-foreground">
                  {t('group.sharedHint')}
                </p>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
