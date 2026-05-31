/**
 * HR-403 — Disponibilitate profesor: grid săptămânal 7×16h
 * Pagina /app/hr/teachers/:id/availability
 */
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, Loader2, Check, AlertTriangle } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { getAvailability, setAvailability } from "@/lib/api/availability";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const DAYS = ["Lun", "Mar", "Mie", "Joi", "Vin", "Sâm", "Dum"];
const HOURS = Array.from({ length: 16 }, (_, i) => i + 6); // 06:00–21:00

// ─── Grid state: grid[day][hour] = isUnavailable (true = blocked) ─────────────

type GridState = boolean[][];

function createEmptyGrid(): GridState {
  return Array.from({ length: 7 }, () => Array(16).fill(false));
}

function slotsToGrid(slots: { dayOfWeek: number; startHour: number; endHour: number; isAvailable: boolean }[]): GridState {
  const grid = createEmptyGrid();
  for (const slot of slots) {
    if (!slot.isAvailable) {
      for (let h = slot.startHour; h < slot.endHour; h++) {
        const hourIdx = h - 6;
        if (hourIdx >= 0 && hourIdx < 16 && slot.dayOfWeek >= 0 && slot.dayOfWeek < 7) {
          grid[slot.dayOfWeek][hourIdx] = true;
        }
      }
    }
  }
  return grid;
}

function gridToSlots(grid: GridState): { dayOfWeek: number; startHour: number; endHour: number; isAvailable: boolean }[] {
  const slots: ReturnType<typeof gridToSlots> = [];
  for (let day = 0; day < 7; day++) {
    for (let hi = 0; hi < 16; hi++) {
      if (grid[day][hi]) {
        const hour = hi + 6;
        slots.push({ dayOfWeek: day, startHour: hour, endHour: hour + 1, isAvailable: false });
      }
    }
  }
  return slots;
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface AvailabilityPageProps {
  teacherId: string;
}

export function AvailabilityPage({ teacherId }: AvailabilityPageProps) {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [grid, setGrid] = useState<GridState>(createEmptyGrid());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragValue, setDragValue] = useState(false);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchAvailability = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAvailability(teacherId);
      setGrid(slotsToGrid(res.slots));
    } catch {
      setError("Nu pot încărca disponibilitatea.");
    } finally {
      setLoading(false);
    }
  }, [teacherId]);

  useEffect(() => { void fetchAvailability(); }, [fetchAvailability]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const slots = gridToSlots(grid);
      await setAvailability(teacherId, slots);
      setToast("Disponibilitate salvată!");
    } catch {
      setError("Eroare la salvare.");
    } finally {
      setSaving(false);
    }
  };

  const toggleCell = (day: number, hourIdx: number, forceValue?: boolean) => {
    setGrid((prev) => {
      const next = prev.map((r) => [...r]);
      next[day][hourIdx] = forceValue !== undefined ? forceValue : !prev[day][hourIdx];
      return next;
    });
  };

  const handleMouseDown = (day: number, hourIdx: number) => {
    const newVal = !grid[day][hourIdx];
    setDragValue(newVal);
    setIsDragging(true);
    toggleCell(day, hourIdx, newVal);
  };

  const handleMouseEnter = (day: number, hourIdx: number) => {
    if (isDragging) {
      toggleCell(day, hourIdx, dragValue);
    }
  };

  const unavailableCount = grid.flat().filter(Boolean).length;

  return (
    <AppShell
      pageTitle="Disponibilitate"
      pageDescription="Marchează sloturile indisponibile (roșu = indisponibil, alb = disponibil)"
      actions={
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => navigate("/app/teachers")}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-muted min-h-[44px]"
            aria-label="Înapoi la profesori"
          >
            <ArrowLeft className="h-4 w-4" />
            Profesori
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 min-h-[44px]"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" aria-hidden="true" />}
            Salvează
          </button>
        </div>
      }
    >
      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive mb-4">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </div>
      )}

      <div className="mb-4 flex items-center gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded bg-destructive/70" aria-hidden="true" />
          Indisponibil
        </div>
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 rounded border border-border bg-card" aria-hidden="true" />
          Disponibil
        </div>
        {unavailableCount > 0 && (
          <span className="ml-auto text-xs">
            {unavailableCount} ore marcate indisponibile
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Se încarcă…
        </div>
      ) : (
        <div
          className="overflow-x-auto select-none"
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
          data-testid="availability-grid"
        >
          <div className="min-w-[500px]">
            {/* Header row */}
            <div className="grid grid-cols-[40px_repeat(7,1fr)] gap-0.5 mb-0.5">
              <div />
              {DAYS.map((d) => (
                <div key={d} className="text-center text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
              ))}
            </div>

            {/* Hour rows */}
            {HOURS.map((hour, hi) => (
              <div key={hour} className="grid grid-cols-[40px_repeat(7,1fr)] gap-0.5 mb-0.5">
                <div className="text-[10px] text-muted-foreground flex items-center justify-end pr-1.5">
                  {String(hour).padStart(2, "0")}:00
                </div>
                {Array.from({ length: 7 }, (_, day) => {
                  const isBlocked = grid[day][hi];
                  return (
                    <div
                      key={day}
                      className={cn(
                        "h-7 rounded-sm cursor-pointer transition-colors border",
                        isBlocked
                          ? "bg-destructive/70 border-destructive/60 hover:bg-destructive/80"
                          : "bg-card border-border hover:bg-muted/50"
                      )}
                      onMouseDown={() => handleMouseDown(day, hi)}
                      onMouseEnter={() => handleMouseEnter(day, hi)}
                      role="checkbox"
                      aria-checked={isBlocked}
                      aria-label={`${DAYS[day]} ${String(hour).padStart(2, "0")}:00 — ${isBlocked ? "Indisponibil" : "Disponibil"}`}
                      tabIndex={0}
                      onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") toggleCell(day, hi); }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-4 right-4 z-50 rounded-lg border border-success/30 bg-success/10 shadow-lg px-4 py-3 text-sm font-medium text-success"
        >
          {toast}
        </div>
      )}
    </AppShell>
  );
}
