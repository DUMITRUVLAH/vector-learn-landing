/**
 * COURSE-102: Slide-over form for creating and editing groups.
 */
import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import type { Group, CreateGroupBody, PatchGroupBody } from "@/lib/api/groups";
import { createGroup, patchGroup } from "@/lib/api/groups";
import type { Course } from "@/lib/api/courses";

const DAYS_OF_WEEK = ["Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă", "Duminică"];

interface Props {
  group?: Group | null;
  courses: Course[];
  open: boolean;
  onClose: () => void;
  onSaved: (group: Group) => void;
}

export function GroupForm({ group, courses, open, onClose, onSaved }: Props) {
  const [courseId, setCourseId] = useState("");
  const [name, setName] = useState("");
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("15:00");
  const [maxStudents, setMaxStudents] = useState(20);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (group) {
      setCourseId(group.courseId);
      setName(group.name);
      setSelectedDays(group.scheduleTemplate?.days ?? []);
      setStartTime(group.scheduleTemplate?.startTime ?? "14:00");
      setEndTime(group.scheduleTemplate?.endTime ?? "15:00");
      setMaxStudents(group.maxStudents);
    } else {
      setCourseId(courses[0]?.id ?? "");
      setName("");
      setSelectedDays([]);
      setStartTime("14:00");
      setEndTime("15:00");
      setMaxStudents(20);
    }
    setError(null);
  }, [group, open, courses]);

  function toggleDay(day: string) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Numele grupei este obligatoriu"); return; }
    if (!courseId) { setError("Selectați un curs"); return; }
    setSaving(true);
    setError(null);
    try {
      const scheduleTemplate =
        selectedDays.length > 0
          ? { days: selectedDays, startTime, endTime }
          : null;
      let saved: Group;
      if (group) {
        const body: PatchGroupBody = { name: name.trim(), scheduleTemplate, maxStudents };
        saved = await patchGroup(group.id, body);
      } else {
        const body: CreateGroupBody = { courseId, name: name.trim(), scheduleTemplate, maxStudents };
        saved = await createGroup(body);
      }
      onSaved(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eroare la salvare");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex">
      <button className="flex-1 bg-black/40" aria-label="Închide" onClick={onClose} />
      <aside
        className="w-full max-w-md bg-card border-l border-border flex flex-col shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={group ? "Editează grupă" : "Grupă nouă"}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {group ? "Editează grupă" : "Grupă nouă"}
          </h2>
          <button
            className="p-1 rounded hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Închide"
            onClick={onClose}
          >
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <form
          id="group-form-inner"
          onSubmit={(e) => void handleSubmit(e)}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-4"
        >
          {error && (
            <div role="alert" className="rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm">
              {error}
            </div>
          )}

          {/* Course picker (disabled in edit mode) */}
          <div className="space-y-1">
            <label htmlFor="group-course" className="block text-sm font-medium text-foreground">
              Curs <span aria-hidden="true" className="text-destructive">*</span>
            </label>
            <select
              id="group-course"
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              disabled={!!group}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <option value="">— selectează —</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.cefrLevel ? ` (${c.cefrLevel})` : ""}</option>
              ))}
            </select>
          </div>

          {/* Name */}
          <div className="space-y-1">
            <label htmlFor="group-name" className="block text-sm font-medium text-foreground">
              Denumire grupă <span aria-hidden="true" className="text-destructive">*</span>
            </label>
            <input
              id="group-name"
              type="text"
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Engleză B2 — Mar/Joi 14:00"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Days of week */}
          <div className="space-y-2">
            <span className="block text-sm font-medium text-foreground">Zile</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Selectează zilele">
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day}
                  type="button"
                  aria-pressed={selectedDays.includes(day)}
                  onClick={() => toggleDay(day)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors focus-visible:ring-2 focus-visible:ring-ring ${
                    selectedDays.includes(day)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-input hover:bg-muted"
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* Start/end time */}
          {selectedDays.length > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="group-start" className="block text-sm font-medium text-foreground">
                  Ora început
                </label>
                <input
                  id="group-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="group-end" className="block text-sm font-medium text-foreground">
                  Ora sfârșit
                </label>
                <input
                  id="group-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
            </div>
          )}

          {/* Max students */}
          <div className="space-y-1">
            <label htmlFor="group-max" className="block text-sm font-medium text-foreground">
              Capacitate maximă (elevi)
            </label>
            <input
              id="group-max"
              type="number"
              min={1}
              max={500}
              value={maxStudents}
              onChange={(e) => setMaxStudents(Number(e.target.value))}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-md text-sm font-medium border border-input bg-background hover:bg-muted">
            Anulează
          </button>
          <button
            type="submit"
            form="group-form-inner"
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {group ? "Salvează" : "Creează grupă"}
          </button>
        </div>
      </aside>
    </div>
  );
}
