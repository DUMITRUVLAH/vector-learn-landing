import { useState, useEffect, useRef } from "react";
import { MessageCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConflictBadge, detectConflicts } from "./ConflictBadge";

const DAYS = ["Luni", "Marți", "Miercuri", "Joi", "Vineri"] as const;
const SLOTS = ["09:00", "11:00", "14:00", "16:00"] as const;

type EventColor = "primary" | "mint" | "lavender" | "peach" | "sky" | "rose";

interface ScheduleEvent {
  id: string;
  title: string;
  teacher: string;
  day: number;
  slot: number;
  color: EventColor;
}

const COLOR_CLASS: Record<EventColor, string> = {
  primary: "bg-primary text-primary-foreground border-primary/40",
  mint: "pastel-mint text-foreground border-[hsl(158,40%,75%)]",
  lavender: "pastel-lavender text-foreground border-[hsl(250,40%,80%)]",
  peach: "pastel-peach text-foreground border-[hsl(20,60%,80%)]",
  sky: "pastel-sky text-foreground border-[hsl(200,40%,75%)]",
  rose: "pastel-rose text-foreground border-[hsl(340,40%,80%)]",
};

const INITIAL_EVENTS: ScheduleEvent[] = [
  { id: "ev-1", title: "Engleză B2 — Grupa 4", teacher: "Ana M.", day: 0, slot: 1, color: "primary" },
  { id: "ev-2", title: "Pian — Lecție individuală", teacher: "Radu C.", day: 1, slot: 0, color: "rose" },
  { id: "ev-3", title: "Programare Python", teacher: "Andrei P.", day: 1, slot: 2, color: "sky" },
  { id: "ev-4", title: "Spaniolă A1", teacher: "Maria L.", day: 2, slot: 1, color: "mint" },
  { id: "ev-5", title: "Robotică începători", teacher: "Cristian V.", day: 3, slot: 0, color: "peach" },
  { id: "ev-6", title: "Engleză B2 — Grupa 4", teacher: "Ana M.", day: 4, slot: 2, color: "primary" },
  { id: "ev-7", title: "Vioară — Lecție", teacher: "Elena D.", day: 0, slot: 3, color: "lavender" },
];

interface Toast {
  id: number;
  icon: "msg" | "ok";
  title: string;
  subtitle: string;
}

export function ScheduleDemo() {
  const [events, setEvents] = useState<ScheduleEvent[]>(INITIAL_EVENTS);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [hoverCell, setHoverCell] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(0);

  const conflicts = detectConflicts(events);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, 3500);
    return () => clearTimeout(timer);
  }, [toasts]);

  const pushToast = (toast: Omit<Toast, "id">) => {
    nextToastId.current += 1;
    setToasts((prev) => [...prev, { ...toast, id: nextToastId.current }]);
  };

  const moveEvent = (eventId: string, day: number, slot: number) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    if (ev.day === day && ev.slot === slot) return;

    setEvents((prev) =>
      prev.map((e) => (e.id === eventId ? { ...e, day, slot } : e))
    );

    pushToast({
      icon: "msg",
      title: "Părinți notificați pe WhatsApp",
      subtitle: `Lecția "${ev.title}" mutată la ${DAYS[day]} ${SLOTS[slot]}`,
    });
    pushToast({
      icon: "ok",
      title: "Orar profesor actualizat",
      subtitle: `${ev.teacher} a primit notificare push`,
    });
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setHoverCell(key);
  };

  const handleDragLeave = () => setHoverCell(null);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, day: number, slot: number) => {
    e.preventDefault();
    setHoverCell(null);
    setDraggedId(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id) return;
    moveEvent(id, day, slot);
  };

  const handleKeyboardMove = (eventId: string, deltaDay: number, deltaSlot: number) => {
    const ev = events.find((e) => e.id === eventId);
    if (!ev) return;
    const newDay = Math.max(0, Math.min(DAYS.length - 1, ev.day + deltaDay));
    const newSlot = Math.max(0, Math.min(SLOTS.length - 1, ev.slot + deltaSlot));
    moveEvent(eventId, newDay, newSlot);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-bold">Săptămâna 22 — Mai 2026</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Trage lecțiile între celule. Folosește săgețile cu tastatura pentru accesibilitate.
          </p>
        </div>
        {conflicts.size > 0 && (
          <ConflictBadge message={`${conflicts.size} lecții în conflict — același slot`} />
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-md">
        <div className="grid grid-cols-[60px_repeat(5,1fr)] border-b border-border bg-muted/40">
          <div className="p-3 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Oră
          </div>
          {DAYS.map((day) => (
            <div
              key={day}
              className="p-3 text-xs font-semibold text-center text-foreground/80 border-l border-border"
            >
              {day}
            </div>
          ))}
        </div>

        <div className="divide-y divide-border">
          {SLOTS.map((slotLabel, slotIdx) => (
            <div key={slotLabel} className="grid grid-cols-[60px_repeat(5,1fr)]">
              <div className="p-3 text-xs font-semibold text-muted-foreground bg-muted/20 flex items-center">
                {slotLabel}
              </div>
              {DAYS.map((_, dayIdx) => {
                const cellKey = `${dayIdx}:${slotIdx}`;
                const cellEvents = events.filter((e) => e.day === dayIdx && e.slot === slotIdx);
                const isHover = hoverCell === cellKey && draggedId !== null;
                return (
                  <div
                    key={cellKey}
                    onDragOver={(e) => handleDragOver(e, cellKey)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dayIdx, slotIdx)}
                    className={cn(
                      "min-h-[72px] border-l border-border p-1.5 transition-colors",
                      isHover && "bg-primary/10 ring-2 ring-primary/40 ring-inset"
                    )}
                    aria-label={`${DAYS[dayIdx]} ${slotLabel}`}
                  >
                    <div className="flex flex-col gap-1">
                      {cellEvents.map((ev) => {
                        const isConflict = conflicts.has(ev.id);
                        return (
                          <div
                            key={ev.id}
                            draggable
                            tabIndex={0}
                            role="button"
                            aria-label={`Lecția ${ev.title}, ${DAYS[ev.day]} ${SLOTS[ev.slot]}. Trage sau folosește săgețile pentru a muta.`}
                            onDragStart={(e) => handleDragStart(e, ev.id)}
                            onDragEnd={() => setDraggedId(null)}
                            onKeyDown={(e) => {
                              if (e.key === "ArrowRight") {
                                e.preventDefault();
                                handleKeyboardMove(ev.id, 1, 0);
                              } else if (e.key === "ArrowLeft") {
                                e.preventDefault();
                                handleKeyboardMove(ev.id, -1, 0);
                              } else if (e.key === "ArrowDown") {
                                e.preventDefault();
                                handleKeyboardMove(ev.id, 0, 1);
                              } else if (e.key === "ArrowUp") {
                                e.preventDefault();
                                handleKeyboardMove(ev.id, 0, -1);
                              }
                            }}
                            className={cn(
                              "rounded-md border px-2 py-1.5 text-[11px] font-medium cursor-move shadow-sm transition-all",
                              "hover:shadow-md hover:-translate-y-0.5 active:scale-95",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                              COLOR_CLASS[ev.color],
                              isConflict && "ring-2 ring-destructive ring-offset-1 animate-pulse-soft",
                              draggedId === ev.id && "opacity-50"
                            )}
                          >
                            <p className="truncate font-semibold leading-tight">{ev.title}</p>
                            <p className="truncate text-[10px] opacity-80 mt-0.5">{ev.teacher}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto rounded-lg border border-border bg-card shadow-lg p-3 min-w-[260px] max-w-sm animate-fade-in"
          >
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "h-8 w-8 rounded-md flex items-center justify-center flex-shrink-0",
                  toast.icon === "msg" ? "pastel-mint" : "pastel-sky"
                )}
              >
                {toast.icon === "msg" ? (
                  <MessageCircle className="h-4 w-4 text-foreground/70" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-foreground/70" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold leading-tight">{toast.title}</p>
                <p className="text-[11px] text-muted-foreground leading-tight mt-0.5 truncate">
                  {toast.subtitle}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
