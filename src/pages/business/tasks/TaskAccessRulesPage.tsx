// Reguli de vizibilitate — cine vede task-urile cui.
//
// Presetarea produsului („angajatul vede ce e al lui, managerul vede task-urile
// echipei lui") e o alegere bună, dar nu se potrivește tuturor: un director vrea
// toată organizația, un coordonator vrea echipa lui, o echipă mică vrea
// transparență. Pagina asta lasă administratorul workspace-ului să decidă, fără
// să umble nimeni prin cod.
//
// Ordinea de aplicare, aceeași cu cea de pe server: regulă pe persoană > regulă
// pe manageri > regulă pe toți > presetare. Fără nicio regulă scrisă,
// comportamentul rămâne exact cel implicit.

import { useMemo, useState } from 'react';
import { useTasksT } from '@/lib/tasks/useTasksT';
import { toast } from '@/lib/tasks/toast';
import { Info, Loader2, ShieldCheck, Trash2, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TasksLayout } from '@/components/tasks/TasksLayout';
import {
  Button, Card, CardContent, Label,
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/tasks/ui';
import { AssigneePicker } from '@/components/tasks/AssigneePicker';
import {
  useAssignableIndex, useTasksAuth, useVisibilityRuleMutations, useVisibilityRules,
} from '@/hooks/useTaskBoards';
import { avatarClass, initialsOf } from '@/lib/tasks/meta';
import { VISIBILITY_SCOPES, type VisibilityScope } from '@/lib/tasks/types';

export function TaskAccessRulesPage() {
  const { t } = useTasksT();
  const { isHRAdmin, isSuperAdmin, isLoading: authLoading } = useTasksAuth();
  const canManage = isHRAdmin || isSuperAdmin;

  const { data: rules = [], isLoading } = useVisibilityRules(canManage);
  const { save, remove } = useVisibilityRuleMutations();
  const index = useAssignableIndex(null);

  const [personIds, setPersonIds] = useState<string[]>([]);
  const [personScope, setPersonScope] = useState<VisibilityScope>('team');

  const groupRule = (subject: 'managers' | 'all_employees') =>
    rules.find((r) => r.subject_type === subject);
  const personRules = useMemo(
    () => rules.filter((r) => r.subject_type === 'user'),
    [rules],
  );

  if (!canManage) {
    return (
      <TasksLayout>
        {/* Identitatea se încarcă asincron: până sosește rolul, „acces refuzat"
            ar clipi și în fața administratorului. */}
        {authLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Card className="rounded-2xl border-dashed">
            <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
              <ShieldCheck className="h-6 w-6 text-muted-foreground" />
              <p className="font-medium">{t('board.access.denied')}</p>
            </CardContent>
          </Card>
        )}
      </TasksLayout>
    );
  }

  const saveGroup = (subject: 'managers' | 'all_employees', scope: VisibilityScope) =>
    save.mutate(
      { subject_type: subject, scope },
      {
        onSuccess: () => toast.success(t('board.access.saved')),
        onError: (error) => {
          console.error('[tasks] visibility rule', error);
          toast.error((error as { message?: string })?.message || t('board.toast.saveFailed'));
        },
      },
    );

  const addPersonRule = () => {
    const userId = personIds[0];
    if (!userId) {
      toast.error(t('board.access.pickPerson'));
      return;
    }
    save.mutate(
      { subject_type: 'user', subject_user_id: userId, scope: personScope },
      {
        onSuccess: () => {
          toast.success(t('board.access.saved'));
          setPersonIds([]);
        },
        onError: (error) => {
          console.error('[tasks] visibility rule', error);
          toast.error((error as { message?: string })?.message || t('board.toast.saveFailed'));
        },
      },
    );
  };

  const scopeSelect = (value: VisibilityScope, onChange: (scope: VisibilityScope) => void) => (
    <Select value={value} onValueChange={(v) => onChange(v as VisibilityScope)}>
      <SelectTrigger className="h-9 w-full sm:w-[240px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VISIBILITY_SCOPES.map((scope) => (
          <SelectItem key={scope} value={scope}>
            {t(`board.access.scopes.${scope}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <TasksLayout>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {t('board.access.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('board.access.subtitle')}</p>
      </div>

      <div className="mb-4 flex items-start gap-2.5 rounded-2xl border bg-muted/40 p-3.5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('board.access.explainer')}
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="rounded-2xl">
            <CardContent className="space-y-4 p-4">
              <h2 className="text-sm font-semibold">{t('board.access.defaults')}</h2>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label className="block text-sm">{t('board.access.managersLabel')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('board.access.managersHint')}
                  </p>
                </div>
                {scopeSelect(
                  (groupRule('managers')?.scope as VisibilityScope) ?? 'team',
                  (scope) => saveGroup('managers', scope),
                )}
              </div>

              <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <Label className="block text-sm">{t('board.access.employeesLabel')}</Label>
                  <p className="text-xs text-muted-foreground">
                    {t('board.access.employeesHint')}
                  </p>
                </div>
                {scopeSelect(
                  (groupRule('all_employees')?.scope as VisibilityScope) ?? 'own',
                  (scope) => saveGroup('all_employees', scope),
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardContent className="space-y-3 p-4">
              <div>
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <UserCog className="h-4 w-4 text-muted-foreground" />
                  {t('board.access.exceptions')}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('board.access.exceptionsHint')}
                </p>
              </div>

              <div className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-end">
                <div className="flex-1 space-y-1.5">
                  <Label className="block text-xs text-muted-foreground">
                    {t('board.access.person')}
                  </Label>
                  <AssigneePicker mode="single" value={personIds} onChange={setPersonIds} />
                </div>
                <div className="space-y-1.5">
                  <Label className="block text-xs text-muted-foreground">
                    {t('board.access.scope')}
                  </Label>
                  {scopeSelect(personScope, setPersonScope)}
                </div>
                <Button onClick={addPersonRule} disabled={save.isPending}>
                  {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('board.access.add')}
                </Button>
              </div>

              {personRules.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">
                  {t('board.access.noExceptions')}
                </p>
              ) : (
                <div className="divide-y rounded-xl border">
                  {personRules.map((rule) => {
                    const person = rule.subject_user_id ? index[rule.subject_user_id] : undefined;
                    return (
                      <div key={rule.id} className="flex items-center gap-2.5 px-3 py-2.5">
                        <span
                          className={cn(
                            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                            avatarClass(rule.subject_user_id ?? ''),
                          )}
                        >
                          {initialsOf(person?.full_name)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {person?.full_name ?? t('board.detail.unknownUser')}
                        </span>
                        <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-[11px]">
                          {t(`board.access.scopes.${rule.scope}`)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => remove.mutate(rule.id)}
                          aria-label={t('board.actions.delete')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </TasksLayout>
  );
}
