import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/tasks/ui";
import { useTasksT } from "@/lib/tasks/useTasksT";

interface TaskLoadErrorProps {
  onRetry?: () => void;
}

/**
 * Ce se vede când citirea task-urilor eșuează.
 *
 * Până acum `isError` nu apărea nicăieri în modul: cu `data = []` ca valoare
 * implicită, o cădere de rețea sau un refuz de acces arătau IDENTIC cu „nu ai
 * task-uri" — în „Task-urile mele" chiar cu cardul festiv „Nimic de făcut".
 * Omul concluziona că nu are treabă, nu că nu s-au încărcat datele.
 */
export function TaskLoadError({ onRetry }: TaskLoadErrorProps) {
  const { t } = useTasksT();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-6 py-14 text-center">
      <AlertTriangle className="h-7 w-7 text-amber-500" />
      <div>
        <p className="font-medium">{t("board.state.errorTitle")}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{t("board.state.errorDescription")}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-1 gap-1.5" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" />
          {t("board.state.retry")}
        </Button>
      )}
    </div>
  );
}
