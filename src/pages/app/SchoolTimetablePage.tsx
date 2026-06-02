/**
 * SCHOOL-006 — /app/school/timetable
 *
 * Orar master: grilă clasă × materie × profesor × sală (săptămânal).
 * Selectezi clasa → vezi/editezi orarul ei săptămânal.
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle, Plus, CalendarDays, Trash2, X } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listTimetableSlots,
  createTimetableSlot,
  deleteTimetableSlot,
  type TimetableSlot,
  type CreateSlotPayload,
  type TimetableConflict,
} from "@/lib/api/timetable";
import { listSchoolClasses, listAcademicYears, type SchoolClass } from "@/lib/api/school";
import { cn } from "@/lib/utils";

// ─── Constante ────────────────────────────────────────────────────────────────

const DAYS = [
  { dow: 1, label: "Luni" },
  { dow: 2, label: "Marți" },
  { dow: 3, label: "Miercuri" },
  { dow: 4, label: "Joi" },
  { dow: 5, label: "Vineri" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slotsByDay(slots: TimetableSlot[]): Map<number, TimetableSlot[]> {
  const map = new Map<number, TimetableSlot[]>();
  for (const slot of slots) {
    if (!map.has(slot.dayOfWeek)) map.set(slot.dayOfWeek, []);
    map.get(slot.dayOfWeek)!.push(slot);
  }
  // Sort within each day by startTime
  for (const [, daySlots] of map) {
    daySlots.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  return map;
}

// ─── AddSlotModal ─────────────────────────────────────────────────────────────

interface AddSlotModalProps {
  classId: string;
  onClose: () => void;
  onSaved: () => void;
}

function AddSlotModal({ classId, onClose, onSaved }: AddSlotModalProps) {
  const [subjectId, setSubjectId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<TimetableConflict[]>([]);

  // Per spec: subjectId e obligatoriu — pentru demo folosim un UUID static placeholder
  // În producție ar exista un selector de materii conectat la school_subjects
  const handleSave = async () => {
    if (!subjectId.trim()) {
      setError("ID-ul materiei este obligatoriu");
      return;
    }
    setSaving(true);
    setError(null);
    setConflicts([]);
    try {
      const payload: CreateSlotPayload = {
        classId,
        subjectId: subjectId.trim(),
        teacherId: teacherId.trim() || null,
        roomId: roomId.trim() || null,
        dayOfWeek,
        startTime,
        endTime,
        notes: notes.trim() || null,
      };
      await createTimetableSlot(payload);
      onSaved();
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("409")) {
        setError("Conflict de orar detectat.");
      } else if (
        err instanceof Object &&
        "conflicts" in (err as Record<string, unknown>)
      ) {
        setConflicts((err as { conflicts: TimetableConflict[] }).conflicts);
      } else {
        setError(err instanceof Error ? err.message : "Eroare la salvare");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-slot-title"
    >
      <div className="bg-card text-card-foreground rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 id="add-slot-title" className="text-lg font-semibold">
            Adaugă slot de orar
          </h2>
          <button
            onClick={onClose}
            aria-label="Închide"
            className="p-2 rounded-md hover:bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm flex gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {conflicts.length > 0 && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm space-y-1">
            {conflicts.map((c, i) => (
              <p key={i} className="flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {c.message}
              </p>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="subject-id">
              ID Materie <span className="text-destructive">*</span>
            </label>
            <input
              id="subject-id"
              type="text"
              placeholder="UUID-ul materiei din school_subjects"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="slot-day">
              Ziua
            </label>
            <select
              id="slot-day"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            >
              {DAYS.map((d) => (
                <option key={d.dow} value={d.dow}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="start-time">
                Ora start
              </label>
              <input
                id="start-time"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="end-time">
                Ora final
              </label>
              <input
                id="end-time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="teacher-id">
              ID Profesor (opțional)
            </label>
            <input
              id="teacher-id"
              type="text"
              placeholder="UUID-ul profesorului"
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="room-id">
              ID Sală (opțional)
            </label>
            <input
              id="room-id"
              type="text"
              placeholder="UUID-ul sălii"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="slot-notes">
              Notițe
            </label>
            <input
              id="slot-notes"
              type="text"
              placeholder="Opțional"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-input bg-background text-sm hover:bg-muted"
          >
            Anulează
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvează
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SlotCard ─────────────────────────────────────────────────────────────────

interface SlotCardProps {
  slot: TimetableSlot;
  onDelete: (id: string) => Promise<void>;
}

function SlotCard({ slot, onDelete }: SlotCardProps) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm(`Ștergi slotul ${slot.startTime}–${slot.endTime}?`)) return;
    setDeleting(true);
    try {
      await onDelete(slot.id);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="group relative bg-primary/10 border border-primary/20 rounded-md px-3 py-2 text-sm">
      <p className="font-medium text-foreground truncate">
        {slot.subjectName ?? "Materie necunoscută"}
      </p>
      <p className="text-muted-foreground text-xs">
        {slot.startTime}–{slot.endTime}
      </p>
      {slot.teacherName && (
        <p className="text-muted-foreground text-xs truncate">{slot.teacherName}</p>
      )}
      {slot.roomName && (
        <p className="text-muted-foreground text-xs truncate">{slot.roomName}</p>
      )}
      <button
        onClick={handleDelete}
        disabled={deleting}
        aria-label="Șterge slot"
        className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity"
      >
        {deleting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Trash2 className="h-3 w-3" />
        )}
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SchoolTimetablePage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddSlot, setShowAddSlot] = useState(false);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      navigate("/app/login");
    }
  }, [sessionStatus, navigate]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [, classesRes] = await Promise.all([
        listAcademicYears(),
        listSchoolClasses(),
      ]);
      const classesList = classesRes.classes ?? [];
      setClasses(classesList);

      // Auto-selectare prima clasă
      if (classesList.length > 0 && !selectedClassId) {
        setSelectedClassId(classesList[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (sessionStatus === "authenticated") {
      load();
    }
  }, [sessionStatus, load]);

  const loadSlots = useCallback(async () => {
    if (!selectedClassId) {
      setSlots([]);
      return;
    }
    try {
      const res = await listTimetableSlots({ classId: selectedClassId });
      setSlots(res.slots ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la încărcarea orarului");
    }
  }, [selectedClassId]);

  useEffect(() => {
    loadSlots();
  }, [loadSlots]);

  const handleDeleteSlot = async (id: string) => {
    await deleteTimetableSlot(id);
    await loadSlots();
  };

  const slotMap = slotsByDay(slots);

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  const pageActions = (
    <button
      onClick={() => setShowAddSlot(true)}
      disabled={!selectedClassId}
      className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
    >
      <Plus className="h-4 w-4" />
      Adaugă slot
    </button>
  );

  return (
    <AppShell pageTitle="Orar master" actions={pageActions}>
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-destructive/10 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-4">
          {/* Selector clasă */}
          <div className="flex items-center gap-3">
            <label htmlFor="class-select" className="text-sm font-medium text-muted-foreground">
              Clasă:
            </label>
            <select
              id="class-select"
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="px-3 py-1.5 rounded-md border border-input bg-background text-sm"
            >
              <option value="">Selectează o clasă…</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
            {selectedClass && (
              <span className="text-sm text-muted-foreground">
                {slots.length} slot{slots.length !== 1 ? "uri" : ""}
              </span>
            )}
          </div>

          {/* Grilă săptămânală */}
          {selectedClassId && (
            <div className="overflow-x-auto">
              <div className="grid grid-cols-5 gap-2 min-w-[600px]">
                {/* Headere zile */}
                {DAYS.map((day) => (
                  <div
                    key={day.dow}
                    className="text-center text-sm font-semibold text-muted-foreground py-2 bg-muted/40 rounded-t-md"
                  >
                    {day.label}
                  </div>
                ))}

                {/* Sloturi per zi */}
                {DAYS.map((day) => {
                  const daySlots = slotMap.get(day.dow) ?? [];
                  return (
                    <div
                      key={day.dow}
                      className={cn(
                        "min-h-[120px] p-1.5 space-y-1.5 rounded-b-md border border-border",
                        daySlots.length === 0 && "bg-muted/20"
                      )}
                    >
                      {daySlots.length === 0 ? (
                        <p className="text-center text-xs text-muted-foreground pt-4">
                          —
                        </p>
                      ) : (
                        daySlots.map((slot) => (
                          <SlotCard
                            key={slot.id}
                            slot={slot}
                            onDelete={handleDeleteSlot}
                          />
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!selectedClassId && classes.length > 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <CalendarDays className="h-10 w-10 opacity-40" />
              <p className="text-sm">Selectează o clasă pentru a vedea orarul.</p>
            </div>
          )}

          {classes.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <CalendarDays className="h-10 w-10 opacity-40" />
              <p className="text-sm">Nicio clasă găsită. Adaugă mai întâi clase în &laquo;Clase&raquo;.</p>
            </div>
          )}
        </div>
      )}

      {showAddSlot && selectedClassId && (
        <AddSlotModal
          classId={selectedClassId}
          onClose={() => setShowAddSlot(false)}
          onSaved={loadSlots}
        />
      )}
    </AppShell>
  );
}
