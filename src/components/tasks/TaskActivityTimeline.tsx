// Jurnalul de activitate al unui task.
//
// Datele existau de la început (serverul scrie `from_value` și `to_value`
// pentru fiecare schimbare), dar afișarea le arunca: „a schimbat
// responsabilii" nu spunea pe cine, „a schimbat statusul" nu spunea din ce în
// ce. Aici se rezolvă id-urile în nume și se arată tranziția.

import { format, formatDistanceToNow, isToday, isYesterday, parseISO } from 'date-fns';
import type { Locale } from 'date-fns';
import { cn } from '@/lib/utils';
import { useTasksT } from '@/lib/tasks/useTasksT';
import { groupActivityByDay, readActivity } from '@/lib/tasks/activity';
import { avatarClass, initialsOf, PRIORITY_META } from '@/lib/tasks/meta';
import type { AssignableUser, TaskActivity, TaskBoard, TaskList } from '@/lib/tasks/types';

interface Props {
  entries: TaskActivity[];
  people: Record<string, AssignableUser>;
  lists: TaskList[];
  boards: TaskBoard[];
  locale: Locale;
}

export function TaskActivityTimeline({ entries, people, lists, boards, locale }: Props) {
  const { t } = useTasksT();

  const numeOm = (id: string | null | undefined) =>
    (id && people[id]?.full_name) || t('board.detail.unknownUser');

  /** Id → etichetă citibilă, pe tipul de câmp. Necunoscutul rămâne vizibil, nu dispare. */
  const eticheta = (action: string, value: string | null): string | null => {
    if (!value) return null;
    switch (action) {
      case 'status_changed':
        return t(`status.${value}`, { defaultValue: value });
      case 'priority_changed':
        return t(`priority.${value}`, { defaultValue: PRIORITY_META[value as never] ? value : value });
      case 'list_changed':
        return lists.find((l) => l.id === value)?.name ?? t('board.detail.unknownList');
      case 'board_changed':
        return boards.find((b) => b.id === value)?.name ?? t('board.quickAdd.personal');
      case 'due_date_changed':
        return format(parseISO(value), 'd MMM yyyy', { locale });
      default:
        return value;
    }
  };

  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('board.detail.noActivity')}</p>;
  }

  return (
    <div className="space-y-4">
      {groupActivityByDay(entries).map(({ day, entries: aleZilei }) => {
        const data = parseISO(`${day}T12:00:00`);
        return (
          <div key={day}>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {isToday(data)
                ? t('board.activity.today')
                : isYesterday(data)
                  ? t('board.activity.yesterday')
                  : format(data, 'd MMMM yyyy', { locale })}
            </p>

            <ul className="space-y-2.5">
              {aleZilei.map((entry) => {
                const citit = readActivity(entry);
                const de = eticheta(entry.action, citit.from);
                const la = eticheta(entry.action, citit.to);
                return (
                  <li key={entry.id} className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        'mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold',
                        avatarClass(entry.actor_id ?? 'necunoscut'),
                      )}
                    >
                      {initialsOf(numeOm(entry.actor_id))}
                    </span>

                    <div className="min-w-0 flex-1 text-xs leading-relaxed">
                      <span className="font-medium text-foreground">{numeOm(entry.actor_id)}</span>{' '}
                      <span className="text-muted-foreground">
                        {t(`board.activity.${citit.key}`, { defaultValue: entry.action })}
                      </span>

                      {/* Cine a intrat și cine a ieșit — informația pentru care
                          există jurnalul, aruncată până acum. */}
                      {(citit.added.length > 0 || citit.removed.length > 0) && (
                        <span className="ml-1 inline-flex flex-wrap items-center gap-1 align-middle">
                          {citit.added.map((id) => (
                            <span
                              key={`+${id}`}
                              className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700"
                            >
                              + {numeOm(id)}
                            </span>
                          ))}
                          {citit.removed.map((id) => (
                            <span
                              key={`-${id}`}
                              className="rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700"
                            >
                              − {numeOm(id)}
                            </span>
                          ))}
                        </span>
                      )}

                      {(de || la) && (
                        <span className="ml-1 inline-flex flex-wrap items-center gap-1 align-middle">
                          {de && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground line-through">
                              {de}
                            </span>
                          )}
                          {la && (
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                              {la}
                            </span>
                          )}
                        </span>
                      )}

                      <span
                        className="ml-1.5 whitespace-nowrap text-[10px] text-muted-foreground/70"
                        title={format(parseISO(entry.created_at), 'd MMM yyyy, HH:mm', { locale })}
                      >
                        {formatDistanceToNow(parseISO(entry.created_at), { addSuffix: true, locale })}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
