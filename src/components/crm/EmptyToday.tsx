/**
 * CRM-128 — EmptyToday component
 * Shown in TodayDashboard when there are 0 tasks and 0 recent activity.
 */
import { CheckCircle2 } from "lucide-react";

interface EmptyTodayProps {
  onAddTask?: () => void;
}

export function EmptyToday({ onAddTask }: EmptyTodayProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center py-12 text-center"
    >
      <CheckCircle2 className="h-10 w-10 text-emerald-500 dark:text-emerald-400 mb-3" aria-hidden="true" />
      <h3 className="text-base font-semibold">Totul e la zi!</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Nu ai task-uri restante şi nicio activitate recentă.
      </p>
      {onAddTask && (
        <button
          type="button"
          onClick={onAddTask}
          className="mt-4 text-sm text-primary hover:underline"
        >
          Adaugă un task
        </button>
      )}
    </div>
  );
}
