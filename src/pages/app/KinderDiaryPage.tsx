/**
 * KINDER-002 — /app/kinder/diary
 *
 * Jurnal zilnic per copil (child diary):
 * - Selector copil + selector dată
 * - Timeline verticală a evenimentelor zilei cu iconuri per tip
 * - Buton "Adaugă eveniment" cu modal dinamic per tip
 * - Tipuri: masă, somn, scutec, activitate, fotografie, notiță
 */
import { useEffect, useState, useCallback } from "react";
import {
  Utensils, Moon, Droplets, Puzzle, Camera, FileText,
  Plus, Trash2, Loader2, AlertCircle, X, ChevronLeft, ChevronRight,
  Users,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import {
  getDiary,
  addDiaryEvent,
  deleteDiaryEvent,
  type DiaryEvent,
  type DiaryEventType,
} from "@/lib/api/kinder";
import { cn } from "@/lib/utils";

// ─── Event type config ────────────────────────────────────────────────────────

const EVENT_CONFIG: Record<
  DiaryEventType,
  { label: string; icon: React.ElementType; color: string; bgColor: string }
> = {
  meal: {
    label: "Masă",
    icon: Utensils,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800",
  },
  nap: {
    label: "Somn",
    icon: Moon,
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800",
  },
  diaper: {
    label: "Scutec",
    icon: Droplets,
    color: "text-cyan-600 dark:text-cyan-400",
    bgColor: "bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800",
  },
  activity: {
    label: "Activitate",
    icon: Puzzle,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
  },
  photo: {
    label: "Fotografie",
    icon: Camera,
    color: "text-pink-600 dark:text-pink-400",
    bgColor: "bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800",
  },
  note: {
    label: "Notiță",
    icon: FileText,
    color: "text-muted-foreground",
    bgColor: "bg-card border-border",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ro-RO", { hour: "2-digit", minute: "2-digit" });
}

function formatDateDisplay(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("ro-RO", {
    weekday: "long", day: "numeric", month: "long",
  });
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ─── Event summary helper ─────────────────────────────────────────────────────

function getEventSummary(event: DiaryEvent): string {
  const d = event.details as Record<string, string | number> | null;
  switch (event.eventType) {
    case "meal":
      return [d?.food, d?.amountMl ? `${d.amountMl}ml` : "", d?.reaction].filter(Boolean).join(" · ");
    case "nap":
      return d?.startTime ? `${d.startTime}${d.endTime ? ` → ${d.endTime}` : " (în curs)"}` : "";
    case "diaper":
      return d?.type === "wet" ? "Ud" : d?.type === "soiled" ? "Murdar" : d?.type === "both" ? "Ud + Murdar" : "";
    case "activity":
      return (d?.description as string) ?? "";
    case "photo":
      return (d?.caption as string) ?? "";
    case "note":
      return (d?.text as string) ?? "";
    default:
      return "";
  }
}

// ─── Add event modal ───────────────────────────────────────────────────────────

interface AddEventModalProps {
  studentId: string;
  onSuccess: () => void;
  onClose: () => void;
}

function AddEventModal({ studentId, onSuccess, onClose }: AddEventModalProps) {
  const [eventType, setEventType] = useState<DiaryEventType>("meal");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Meal fields
  const [food, setFood] = useState("");
  const [amountMl, setAmountMl] = useState("");
  const [reaction, setReaction] = useState("");

  // Nap fields
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  // Diaper fields
  const [diaperType, setDiaperType] = useState<"wet" | "soiled" | "both">("wet");

  // Activity / note
  const [text, setText] = useState("");

  // Photo
  const [photoUrl, setPhotoUrl] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let details: Record<string, unknown> | undefined;
    let pUrl: string | undefined;

    switch (eventType) {
      case "meal":
        details = { food: food.trim(), amountMl: amountMl ? Number(amountMl) : undefined, reaction: reaction.trim() || undefined };
        break;
      case "nap":
        details = { startTime: startTime.trim(), endTime: endTime.trim() || undefined };
        break;
      case "diaper":
        details = { type: diaperType };
        break;
      case "activity":
        details = { description: text.trim() };
        break;
      case "photo":
        details = { caption: text.trim() || undefined };
        pUrl = photoUrl.trim() || undefined;
        break;
      case "note":
        details = { text: text.trim() };
        break;
    }

    try {
      await addDiaryEvent({ studentId, eventType, details, photoUrl: pUrl });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la salvare");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Adaugă eveniment"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Adaugă eveniment</h2>
          <button type="button" onClick={onClose} aria-label="Închide" className="touch-target rounded-md hover:bg-muted flex items-center justify-center">
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5" /> {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type selector */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">Tip eveniment</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(EVENT_CONFIG) as DiaryEventType[]).map((type) => {
                const cfg = EVENT_CONFIG[type];
                const Icon = cfg.icon;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setEventType(type)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-md border px-2 py-3 text-xs font-medium transition-colors",
                      eventType === type
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Type-specific fields */}
          {eventType === "meal" && (
            <div className="space-y-3">
              <div>
                <label htmlFor="meal-food" className="block text-xs font-medium text-muted-foreground mb-1">Aliment *</label>
                <input id="meal-food" type="text" required value={food} onChange={e => setFood(e.target.value)} placeholder="Supă de pui, fructe..." className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="meal-ml" className="block text-xs font-medium text-muted-foreground mb-1">Cantitate (ml)</label>
                  <input id="meal-ml" type="number" min="0" value={amountMl} onChange={e => setAmountMl(e.target.value)} placeholder="200" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
                <div>
                  <label htmlFor="meal-reaction" className="block text-xs font-medium text-muted-foreground mb-1">Reacție</label>
                  <input id="meal-reaction" type="text" value={reaction} onChange={e => setReaction(e.target.value)} placeholder="A mâncat bine" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
                </div>
              </div>
            </div>
          )}

          {eventType === "nap" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="nap-start" className="block text-xs font-medium text-muted-foreground mb-1">Ora început *</label>
                <input id="nap-start" type="time" required value={startTime} onChange={e => setStartTime(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label htmlFor="nap-end" className="block text-xs font-medium text-muted-foreground mb-1">Ora sfârșit</label>
                <input id="nap-end" type="time" value={endTime} onChange={e => setEndTime(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
          )}

          {eventType === "diaper" && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-2">Tip *</label>
              <div className="flex gap-3">
                {(["wet", "soiled", "both"] as const).map((t) => (
                  <label key={t} className={cn("flex items-center gap-1.5 cursor-pointer rounded-md border px-3 py-2 text-sm transition-colors", diaperType === t ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground hover:bg-muted")}>
                    <input type="radio" name="diaper" value={t} checked={diaperType === t} onChange={() => setDiaperType(t)} className="sr-only" />
                    {t === "wet" ? "Ud" : t === "soiled" ? "Murdar" : "Ambele"}
                  </label>
                ))}
              </div>
            </div>
          )}

          {(eventType === "activity" || eventType === "note") && (
            <div>
              <label htmlFor="activity-text" className="block text-xs font-medium text-muted-foreground mb-1">
                {eventType === "activity" ? "Descriere activitate *" : "Text notiță *"}
              </label>
              <textarea
                id="activity-text"
                required
                rows={3}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder={eventType === "activity" ? "Pictăm cu acuarele..." : "Mama a telefonat..."}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          )}

          {eventType === "photo" && (
            <div className="space-y-3">
              <div>
                <label htmlFor="photo-url" className="block text-xs font-medium text-muted-foreground mb-1">URL fotografie *</label>
                <input id="photo-url" type="url" required value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} placeholder="https://..." className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label htmlFor="photo-caption" className="block text-xs font-medium text-muted-foreground mb-1">Legendă</label>
                <input id="photo-caption" type="text" value={text} onChange={e => setText(e.target.value)} placeholder="La grădinița......" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary" />
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors">
              Anulează
            </button>
            <button type="submit" disabled={loading} className="flex-1 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvează
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Event card ────────────────────────────────────────────────────────────────

interface EventCardProps {
  event: DiaryEvent;
  onDelete: (id: string) => void;
  deleting: boolean;
}

function EventCard({ event, onDelete, deleting }: EventCardProps) {
  const cfg = EVENT_CONFIG[event.eventType];
  const Icon = cfg.icon;
  const summary = getEventSummary(event);

  return (
    <div className={cn("rounded-lg border p-4 flex items-start gap-3 transition-colors", cfg.bgColor)}>
      <div className={cn("rounded-md p-2 shrink-0 bg-white/60 dark:bg-black/20", cfg.color)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className={cn("text-sm font-medium", cfg.color)}>{cfg.label}</p>
          <span className="text-xs text-muted-foreground">{formatTime(event.createdAt)}</span>
        </div>
        {summary && <p className="text-sm text-foreground mt-0.5">{summary}</p>}
        {event.photoUrl && (
          <a href={event.photoUrl} target="_blank" rel="noopener noreferrer" className="mt-2 block">
            <img src={event.photoUrl} alt="fotografie" className="rounded-md max-h-40 object-cover" />
          </a>
        )}
      </div>
      <button
        type="button"
        disabled={deleting}
        onClick={() => onDelete(event.id)}
        aria-label="Șterge eveniment"
        className="touch-target rounded-md hover:bg-destructive/10 hover:text-destructive text-muted-foreground flex items-center justify-center shrink-0 transition-colors"
      >
        {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

/**
 * Simple student list fetched from the existing /api/students endpoint
 * (reuses existing data, no new endpoint needed for KINDER-002)
 */
interface StudentBasic { id: string; fullName: string; }

export function KinderDiaryPage() {
  const { data: session } = useSession();
  const [students, setStudents] = useState<StudentBasic[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [events, setEvents] = useState<DiaryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Load student list
  useEffect(() => {
    if (!session) return;
    fetch("/api/students?limit=200", { credentials: "include" })
      .then(r => r.ok ? r.json() as Promise<{ students: StudentBasic[] }> : Promise.reject())
      .then(data => {
        setStudents(data.students ?? []);
        if (data.students?.length > 0) setSelectedStudentId(data.students[0].id);
      })
      .catch(() => setError("Nu s-au putut încărca elevii."));
  }, [session]);

  const loadDiary = useCallback(async () => {
    if (!selectedStudentId) return;
    setLoading(true);
    try {
      const data = await getDiary(selectedStudentId, date);
      setEvents(data.events);
    } catch {
      setError("Nu s-au putut încărca evenimentele.");
    } finally {
      setLoading(false);
    }
  }, [selectedStudentId, date]);

  useEffect(() => { void loadDiary(); }, [loadDiary]);

  const handleDelete = async (eventId: string) => {
    setDeletingId(eventId);
    try {
      await deleteDiaryEvent(eventId);
      await loadDiary();
    } catch {
      setError("Ștergere eșuată.");
    } finally {
      setDeletingId(null);
    }
  };

  const isToday = date === new Date().toISOString().slice(0, 10);

  return (
    <AppShell
      pageTitle="Jurnal zilnic copil"
      pageDescription="Înregistrați mesele, somnul și activitățile"
      actions={
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          disabled={!selectedStudentId}
          className="flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Adaugă eveniment
        </button>
      }
    >
      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-auto touch-target" aria-label="Închide">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Student selector */}
        <div className="flex-1 min-w-[180px]">
          <label htmlFor="student-select" className="block text-xs font-medium text-muted-foreground mb-1 sr-only">
            Elev
          </label>
          <div className="relative">
            <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <select
              id="student-select"
              value={selectedStudentId}
              onChange={e => setSelectedStudentId(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-md border border-border bg-background text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary appearance-none"
            >
              {students.map(s => (
                <option key={s.id} value={s.id}>{s.fullName}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Date navigator */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDate(addDays(date, -1))}
            aria-label="Zi anterioară"
            className="touch-target rounded-md border border-border hover:bg-muted flex items-center justify-center"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => setDate(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            disabled={isToday}
            onClick={() => setDate(addDays(date, 1))}
            aria-label="Zi următoare"
            className="touch-target rounded-md border border-border hover:bg-muted flex items-center justify-center disabled:opacity-40"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Date display */}
      <p className="text-sm font-medium text-muted-foreground mb-4">
        {formatDateDisplay(date)}
      </p>

      {/* Timeline */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Niciun eveniment înregistrat pentru această zi.</p>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            disabled={!selectedStudentId}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Adaugă primul eveniment
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map(event => (
            <EventCard
              key={event.id}
              event={event}
              onDelete={handleDelete}
              deleting={deletingId === event.id}
            />
          ))}
        </div>
      )}

      {/* Add event modal */}
      {showAddModal && selectedStudentId && (
        <AddEventModal
          studentId={selectedStudentId}
          onSuccess={() => void loadDiary()}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </AppShell>
  );
}
