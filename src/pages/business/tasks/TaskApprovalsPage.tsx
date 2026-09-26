// Aprobări — task-urile care mă așteaptă pe mine să le confirm.
//
// Lista se filtrează pe APROBATOR, nu pe responsabil: sunt două roluri
// diferite pe același task. Cine execută nu poate închide singur un task cu
// aprobatori — gardul e pe server, deci pagina asta e singura cale prin care
// lucrul chiar avansează.

import { useMemo, useState } from "react";
import { useSearchParams } from "@/lib/tasks/router";
import { useTasksT } from "@/lib/tasks/useTasksT";
import { format, parseISO } from "date-fns";
import { toast } from "@/lib/tasks/toast";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getDateFnsLocale } from "@/lib/tasks/dateLocale";
import { TasksLayout } from "@/components/tasks/TasksLayout";
import {
  Button,
  Card,
  CardContent,
  Textarea,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/tasks/ui";
import { AssigneeAvatars } from "@/components/tasks/AssigneeAvatars";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import {
  useAllTasks,
  useApproveTask,
  useAssignableIndex,
  useRejectTask,
  useBoardNames,
  useTasksAuth,
} from "@/hooks/useTaskBoards";
import { pendingApprovalsFor } from "@/lib/tasks/analytics";
import { isOverdue, todayIso } from "@/lib/tasks/grouping";
import { OVERDUE_TEXT, STATUS_META, boardDotClass } from "@/lib/tasks/meta";
import type { BoardTask } from "@/lib/tasks/types";

export function TaskApprovalsPage() {
  const { t, i18n } = useTasksT();
  const locale = getDateFnsLocale(i18n.language);
  const today = todayIso();
  // Identitatea se încarcă aici asincron: până sosește, lista „te așteaptă" nu se
  // poate calcula, deci se tratează ca încărcare, nu ca „nimic de aprobat".
  const { user, isLoading: authLoading } = useTasksAuth();
  const [params, setParams] = useSearchParams();

  const { data: tasks = [], isLoading } = useAllTasks();
  const assignableIndex = useAssignableIndex(null);
  const approve = useApproveTask();
  const reject = useRejectTask();

  const [rejecting, setRejecting] = useState<BoardTask | null>(null);
  const [reason, setReason] = useState("");

  const boardNames = useBoardNames();

  const pending = useMemo(() => (user ? pendingApprovalsFor(tasks, user.id) : []), [tasks, user]);

  const openTaskId = params.get("task");
  const openTask = openTaskId ? (tasks.find((task) => task.id === openTaskId) ?? null) : null;
  const setOpenTask = (taskId: string | null) => {
    if (taskId) params.set("task", taskId);
    else params.delete("task");
    setParams(params, { replace: true });
  };

  const submitReject = async () => {
    if (!rejecting) return;
    try {
      await reject.mutateAsync({ taskId: rejecting.id, reason });
      toast.success(t("board.approvals.rejected"));
      setRejecting(null);
      setReason("");
    } catch (error) {
      console.error("[tasks] reject", error);
      toast.error(t("board.toast.saveFailed"));
    }
  };

  return (
    <TasksLayout>
      <div className="mb-5">
        <h1 className="font-display text-2xl font-bold tracking-tight">{t("board.approvals.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("board.approvals.subtitle", { count: pending.length })}</p>
      </div>

      {isLoading || authLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : pending.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-14 text-center">
            <div className="rounded-2xl pastel-mint p-3">
              <ShieldCheck className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="font-medium">{t("board.approvals.emptyTitle")}</p>
            <p className="max-w-md text-sm text-muted-foreground">{t("board.approvals.emptyDescription")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card">
          {pending.map((task) => {
            const overdue = isOverdue(task, today);
            return (
              <div
                key={task.id}
                className="flex flex-wrap items-center gap-2.5 border-b px-3 py-3 last:border-0 hover:bg-accent/10"
              >
                <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_META[task.status].dot)} />

                <button
                  type="button"
                  onClick={() => setOpenTask(task.id)}
                  className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                >
                  {task.title}
                </button>

                {task.board_id && (
                  <span className="hidden shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground sm:flex">
                    <span className={cn("h-2 w-2 rounded", boardDotClass(task.board_id))} />
                    {boardNames[task.board_id] ?? ""}
                  </span>
                )}

                <AssigneeAvatars
                  userIds={task.assignees ?? []}
                  index={assignableIndex}
                  size="xs"
                  max={2}
                  className="shrink-0"
                />

                {task.due_date && (
                  <span
                    className={cn(
                      "shrink-0 text-[11px] tabular-nums",
                      overdue ? OVERDUE_TEXT : "text-muted-foreground",
                    )}
                  >
                    {format(parseISO(task.due_date), "d MMM", { locale })}
                  </span>
                )}

                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 gap-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() =>
                      approve.mutate(task.id, {
                        onSuccess: () => toast.success(t("board.approvals.approved")),
                        onError: (error) => {
                          console.error("[tasks] approve", error);
                          toast.error((error as { message?: string })?.message ?? t("board.toast.saveFailed"));
                        },
                      })
                    }
                  >
                    <Check className="h-3.5 w-3.5" />
                    {t("board.approvals.approve")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1"
                    onClick={() => {
                      setRejecting(task);
                      setReason("");
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                    {t("board.approvals.reject")}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("board.approvals.rejectTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{t("board.approvals.rejectHint")}</p>
            <Textarea
              autoFocus
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("board.approvals.reasonPlaceholder")}
              aria-label={t("board.approvals.reasonPlaceholder")}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              {t("board.actions.cancel")}
            </Button>
            <Button onClick={submitReject} disabled={reject.isPending}>
              {reject.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("board.approvals.reject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {openTask && (
        <TaskDetailModal
          task={openTask}
          lists={[]}
          boardId={openTask.board_id}
          onClose={() => setOpenTask(null)}
          onOpenTask={setOpenTask}
        />
      )}
    </TasksLayout>
  );
}
