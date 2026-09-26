// Prezentare — starea boardului dintr-o privire, pentru cine conduce echipa:
// cât s-a făcut, cine cât are pe cap, ce e restant.
//
// Nu e un dashboard analitic (acela vine în etapa 2, cross-board) — aici totul
// se calculează local, din task-urile deja încărcate, fără niciun query în plus.

import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, CheckCircle2, ListTodo, UserRound } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getDateFnsLocale } from '@/lib/tasks/dateLocale';
import { useTasksT } from '@/lib/tasks/useTasksT';
import { Card, CardContent } from '@/components/tasks/ui';
import { STATUS_META, OVERDUE_TEXT, avatarClass, initialsOf } from '@/lib/tasks/meta';
import { isOverdue, progressOf, todayIso } from '@/lib/tasks/grouping';
import { workloadByAssignee } from '@/lib/tasks/filters';
import { TASK_STATUSES } from '@/lib/tasks/types';
import type { AssignableUser, BoardTask } from '@/lib/tasks/types';

interface BoardOverviewViewProps {
  tasks: BoardTask[];
  assignableIndex: Record<string, AssignableUser>;
  onOpenTask: (taskId: string) => void;
}

export function BoardOverviewView({ tasks, assignableIndex, onOpenTask }: BoardOverviewViewProps) {
  const { t, i18n } = useTasksT();
  const locale = getDateFnsLocale(i18n.language);
  const today = todayIso();

  const topLevel = useMemo(() => tasks.filter((task) => !task.parent_task_id), [tasks]);
  const stats = useMemo(() => progressOf(topLevel), [topLevel]);
  const overdue = useMemo(
    () => topLevel.filter((task) => isOverdue(task, today)),
    [topLevel, today],
  );
  const unassigned = useMemo(
    () => topLevel.filter((task) => task.status !== 'done' && (task.assignees ?? []).length === 0),
    [topLevel],
  );
  const workload = useMemo(() => workloadByAssignee(topLevel), [topLevel]);

  const workloadRows = useMemo(
    () =>
      Object.entries(workload)
        .filter(([key]) => key !== '__unassigned')
        .map(([userId, count]) => ({
          userId,
          count,
          name: assignableIndex[userId]?.full_name ?? t('board.detail.unknownUser'),
        }))
        .sort((a, b) => b.count - a.count),
    [workload, assignableIndex, t],
  );
  const maxLoad = Math.max(1, ...workloadRows.map((row) => row.count));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={<ListTodo className="h-5 w-5 text-blue-600" />}
          tone="pastel-sky"
          label={t('board.overview.total')}
          value={stats.total}
          hint={t('board.progress', { done: stats.done, total: stats.total })}
        />
        <SummaryCard
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          tone="pastel-mint"
          label={t('board.overview.completed')}
          value={`${stats.pct}%`}
          hint={t('board.overview.completedHint', { count: stats.done })}
        />
        <SummaryCard
          icon={<AlertTriangle className="h-5 w-5 text-red-600" />}
          tone="pastel-rose"
          label={t('board.overview.overdue')}
          value={overdue.length}
          hint={t('board.overview.unassignedHint', { count: unassigned.length })}
        />
      </div>

      <Card className="rounded-2xl">
        <CardContent className="p-4">
          <h3 className="mb-3 text-sm font-semibold">{t('board.overview.distribution')}</h3>
          <div className="flex h-3 overflow-hidden rounded-full bg-muted">
            {TASK_STATUSES.map((status) => {
              const count = stats.byStatus[status] ?? 0;
              if (count === 0) return null;
              return (
                <div
                  key={status}
                  className={cn('h-full transition-all', STATUS_META[status].bar)}
                  style={{ width: `${(count / Math.max(1, stats.total)) * 100}%` }}
                  title={`${t(`status.${status}`)}: ${count}`}
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {TASK_STATUSES.map((status) => (
              <span key={status} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn('h-2 w-2 rounded-full', STATUS_META[status].dot)} />
                {t(`status.${status}`)}
                <span className="font-medium tabular-nums text-foreground">
                  {stats.byStatus[status] ?? 0}
                </span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <UserRound className="h-4 w-4 text-muted-foreground" />
              {t('board.overview.workload')}
            </h3>
            {workloadRows.length === 0 && (
              <p className="text-xs text-muted-foreground">{t('board.overview.noWorkload')}</p>
            )}
            <div className="space-y-2.5">
              {workloadRows.map((row) => (
                <div key={row.userId} className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                      avatarClass(row.userId),
                    )}
                  >
                    {initialsOf(row.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs">{row.name}</span>
                      <span className="text-xs font-medium tabular-nums">{row.count}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-blue-500"
                        style={{ width: `${(row.count / maxLoad) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              {(workload.__unassigned ?? 0) > 0 && (
                <p className="pt-1 text-[11px] text-muted-foreground">
                  {t('board.overview.unassignedHint', { count: workload.__unassigned })}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardContent className="p-4">
            <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              {t('board.overview.overdueList')}
            </h3>
            {overdue.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('board.overview.noOverdue')}</p>
            ) : (
              <div className="space-y-1">
                {overdue.slice(0, 8).map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask(task.id)}
                    className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-accent"
                  >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', STATUS_META[task.status].dot)} />
                    <span className="min-w-0 flex-1 truncate text-xs">{task.title}</span>
                    {task.due_date && (
                      <span className={cn('shrink-0 text-[11px]', OVERDUE_TEXT)}>
                        {format(parseISO(task.due_date), 'd MMM', { locale })}
                      </span>
                    )}
                  </button>
                ))}
                {overdue.length > 8 && (
                  <p className="pt-1 text-[11px] text-muted-foreground">
                    {t('board.overview.andMore', { count: overdue.length - 8 })}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

interface SummaryCardProps {
  icon: React.ReactNode;
  tone: string;
  label: string;
  value: string | number;
  hint: string;
}

function SummaryCard({ icon, tone, label, value, hint }: SummaryCardProps) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="flex items-center gap-3 p-4">
        <div className={cn('rounded-xl p-2.5', tone)}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums leading-tight">{value}</p>
          <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}
