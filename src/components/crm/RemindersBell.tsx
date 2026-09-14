/**
 * CRM Faza 9 — clopoțelul de remindere.
 *
 * Portare din crm-vector (`RemindersBell.tsx`). Taskurile existau deja pe fișa leadului, dar ca
 * să afli ce ai restant trebuia să deschizi fiecare lead pe rând. Clopoțelul le adună: restante,
 * azi, mâine, mai târziu — cu leadul de care aparțin și cu bifa la îndemână.
 *
 * Nu e același lucru cu clopoțelul de notificări al platformei (`NotificationBell` din shell):
 * acela anunță EVENIMENTE care s-au întâmplat (ți s-a alocat o cerere), ăsta arată MUNCA DE
 * FĂCUT, cu scadență. Două lucruri diferite, deci două liste diferite.
 *
 * Numărul de pe insignă numără doar restantele și pe cele de azi: dacă ar număra tot, ar arăta
 * mereu un număr mare și n-ar mai însemna „uită-te acum".
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, Clock, Loader2 } from "lucide-react";
import { Button } from "@/components/ds";
import { cn } from "@/lib/utils";
import { listCrmUpcomingTasks, completeCrmLeadTask, type CrmUpcomingTask } from "@/lib/api/crm";

export interface RemindersBellProps {
  /** Doar taskurile acestui om (plus cele nealocate). `null` = ale întregii echipe. */
  ownerId?: string | null;
  /** Deschide fișa leadului la click pe un reminder. */
  onOpenLead?: (leadId: string) => void;
  onToast?: (toast: { kind: "success" | "error"; message: string }) => void;
  /** Crește când taskurile s-au schimbat în altă parte (fișa leadului) → reîncărcare. */
  refreshToken?: number;
}

type Bucket = "restante" | "azi" | "maine" | "mai_tarziu";

const BUCKET_LABELS: Record<Bucket, string> = {
  restante: "Restante",
  azi: "Azi",
  maine: "Mâine",
  mai_tarziu: "Mai târziu",
};

/** Pură, deci testabilă fără ceas fals: în ce găleată cade o scadență față de `now`. */
export function bucketOf(due: Date, now: Date): Bucket {
  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startTomorrow = new Date(startToday);
  startTomorrow.setDate(startTomorrow.getDate() + 1);
  const startAfter = new Date(startTomorrow);
  startAfter.setDate(startAfter.getDate() + 1);

  if (due.getTime() < now.getTime()) return "restante";
  if (due < startTomorrow) return "azi";
  if (due < startAfter) return "maine";
  return "mai_tarziu";
}

export function RemindersBell({ ownerId = null, onOpenLead, onToast, refreshToken = 0 }: RemindersBellProps) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<CrmUpcomingTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listCrmUpcomingTasks(ownerId);
      setTasks(res.items);
    } catch {
      // Un clopoțel care nu poate citi rămâne gol — nu are voie să strice ecranul de sub el.
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [ownerId]);

  // Insigna trebuie să fie corectă ÎNAINTE de a deschide panoul (ăsta e tot rostul ei), deci
  // lista se cere la montare, nu la deschidere.
  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const grouped = useMemo(() => {
    const now = new Date();
    const out: Record<Bucket, CrmUpcomingTask[]> = { restante: [], azi: [], maine: [], mai_tarziu: [] };
    for (const t of tasks) {
      if (!t.dueAt) continue;
      out[bucketOf(new Date(t.dueAt), now)].push(t);
    }
    return out;
  }, [tasks]);

  const total = tasks.filter((t) => t.dueAt).length;
  const urgent = grouped.restante.length + grouped.azi.length;

  async function complete(task: CrmUpcomingTask) {
    setBusyId(task.id);
    try {
      await completeCrmLeadTask(task.id);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
      onToast?.({ kind: "success", message: "Task finalizat." });
    } catch (err) {
      onToast?.({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut finaliza taskul." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`Remindere (${urgent} urgente din ${total})`}
        className="relative"
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {urgent > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {urgent}
          </span>
        )}
      </Button>

      {open && (
        <div
          className="absolute right-0 z-50 mt-1 max-h-[70vh] w-[340px] overflow-y-auto rounded-xl border border-border bg-card shadow-lg"
          role="dialog"
          aria-label="Remindere"
        >
          <div className="sticky top-0 z-10 border-b border-border bg-card p-3">
            <p className="text-sm font-bold text-foreground">Remindere</p>
            <p className="text-[11px] text-muted-foreground">
              {loading ? "Se încarcă…" : total === 0 ? "Niciun task deschis" : `${total} taskuri cu scadență`}
            </p>
          </div>

          {(["restante", "azi", "maine", "mai_tarziu"] as Bucket[]).map((bucket) => {
            const items = grouped[bucket];
            if (items.length === 0) return null;
            return (
              <div key={bucket} className="p-2">
                <p
                  className={cn(
                    "px-2 py-1 text-[11px] font-bold uppercase tracking-wide",
                    bucket === "restante" ? "text-destructive" : bucket === "azi" ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {BUCKET_LABELS[bucket]} · {items.length}
                </p>
                <ul className="flex flex-col gap-1">
                  {items.map((task) => {
                    const due = new Date(task.dueAt as string);
                    const leadName = task.leadDealName || task.leadFullName;
                    return (
                      <li
                        key={task.id}
                        className={cn(
                          "flex items-start gap-2 rounded-md border p-2 transition-colors hover:bg-muted/50",
                          bucket === "restante" ? "border-destructive/30" : "border-border"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onOpenLead?.(task.leadId);
                            setOpen(false);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="break-words text-xs font-semibold text-foreground">{task.title}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{leadName}</p>
                          <p
                            className={cn(
                              "mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium tabular-nums",
                              bucket === "restante" ? "text-destructive" : "text-muted-foreground"
                            )}
                          >
                            <Clock className="h-2.5 w-2.5" aria-hidden="true" />
                            {due.toLocaleString("ro-MD", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => void complete(task)}
                          disabled={busyId === task.id}
                          aria-label={`Marchează „${task.title}” ca finalizat`}
                          className="shrink-0 rounded p-1 text-success hover:bg-success/10"
                        >
                          {busyId === task.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Check className="h-4 w-4" aria-hidden="true" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {!loading && total === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground">
              Niciun task cu scadență. Adaugă unul din fișa unui lead.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
