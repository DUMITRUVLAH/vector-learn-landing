/**
 * COURSE-101: Slide-over form for creating and editing courses.
 * Supports CEFR level dropdown, price, duration, description.
 */
import { useState, useEffect } from "react";
import { X, Loader2 } from "lucide-react";
import type { Course, CreateCourseBody, PatchCourseBody } from "@/lib/api/courses";
import { createCourse, patchCourse } from "@/lib/api/courses";

const CEFR_LEVELS = ["", "A1", "A2", "B1", "B2", "C1", "C2"] as const;
type CefrOption = (typeof CEFR_LEVELS)[number];

interface Props {
  /** Existing course to edit; undefined = create mode */
  course?: Course | null;
  open: boolean;
  onClose: () => void;
  onSaved: (course: Course) => void;
}

export function CourseForm({ course, open, onClose, onSaved }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState("");
  const [cefrLevel, setCefrLevel] = useState<CefrOption>("");
  const [defaultPriceCents, setDefaultPriceCents] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Populate form when editing
  useEffect(() => {
    if (course) {
      setName(course.name);
      setDescription(course.description ?? "");
      setLevel(course.level ?? "");
      setCefrLevel((course.cefrLevel as CefrOption) ?? "");
      setDefaultPriceCents(course.defaultPriceCents);
      setDurationMinutes(course.durationMinutes);
    } else {
      setName("");
      setDescription("");
      setLevel("");
      setCefrLevel("");
      setDefaultPriceCents(0);
      setDurationMinutes(60);
    }
    setError(null);
  }, [course, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Numele este obligatoriu"); return; }
    setSaving(true);
    setError(null);
    try {
      let saved: Course;
      if (course) {
        const body: PatchCourseBody = {
          name: name.trim(),
          description: description.trim() || null,
          level: level.trim() || null,
          cefrLevel: (cefrLevel as PatchCourseBody["cefrLevel"]) || null,
          defaultPriceCents,
          durationMinutes,
        };
        saved = await patchCourse(course.id, body);
      } else {
        const body: CreateCourseBody = {
          name: name.trim(),
          description: description.trim() || null,
          level: level.trim() || null,
          cefrLevel: (cefrLevel as CreateCourseBody["cefrLevel"]) || null,
          defaultPriceCents,
          durationMinutes,
        };
        saved = await createCourse(body);
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
      {/* Backdrop */}
      <button
        className="flex-1 bg-black/40"
        aria-label="Închide formularul"
        onClick={onClose}
      />
      {/* Drawer panel */}
      <aside
        className="w-full max-w-md bg-card border-l border-border flex flex-col shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={course ? "Editează curs" : "Curs nou"}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {course ? "Editează curs" : "Curs nou"}
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
        <form id="course-form-inner" onSubmit={(e) => void handleSubmit(e)} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div role="alert" className="rounded-md bg-destructive/10 text-destructive px-3 py-2 text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div className="space-y-1">
            <label htmlFor="course-name" className="block text-sm font-medium text-foreground">
              Denumire curs <span aria-hidden="true" className="text-destructive">*</span>
            </label>
            <input
              id="course-name"
              type="text"
              required
              maxLength={200}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: Engleză B2"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label htmlFor="course-description" className="block text-sm font-medium text-foreground">
              Descriere
            </label>
            <textarea
              id="course-description"
              rows={3}
              maxLength={1000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descriere scurtă a cursului..."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            />
          </div>

          {/* Level + CEFR */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="course-level" className="block text-sm font-medium text-foreground">
                Nivel
              </label>
              <input
                id="course-level"
                type="text"
                maxLength={32}
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="ex: Intermediar"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="course-cefr" className="block text-sm font-medium text-foreground">
                Nivel CEFR
              </label>
              <select
                id="course-cefr"
                value={cefrLevel}
                onChange={(e) => setCefrLevel(e.target.value as CefrOption)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">— fără —</option>
                {CEFR_LEVELS.filter(Boolean).map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Price + Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor="course-price" className="block text-sm font-medium text-foreground">
                Preț implicit (RON)
              </label>
              <input
                id="course-price"
                type="number"
                min={0}
                step={100}
                value={Math.round(defaultPriceCents / 100)}
                onChange={(e) => setDefaultPriceCents(Math.round(Number(e.target.value) * 100))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="course-duration" className="block text-sm font-medium text-foreground">
                Durată (min)
              </label>
              <select
                id="course-duration"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {[30, 45, 60, 75, 90, 120].map((d) => (
                  <option key={d} value={d}>{d} min</option>
                ))}
              </select>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-md text-sm font-medium border border-input bg-background hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            Anulează
          </button>
          <button
            type="submit"
            form="course-form-inner"
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {course ? "Salvează" : "Creează curs"}
          </button>
        </div>
      </aside>
    </div>
  );
}
