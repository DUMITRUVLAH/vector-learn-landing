/**
 * COURSE-103: EnrollModal — search a student and enroll them in a group.
 * Shows capacity warning; optionally auto-creates a payment draft.
 */
import { useEffect, useId, useRef, useState } from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { enrollStudent, type Group } from "@/lib/api/groups";
import { listStudents, type Student } from "@/lib/api/students";
import { cn } from "@/lib/utils";

interface EnrollModalProps {
  group: Group;
  onClose: () => void;
  onEnrolled: () => void;
}

export function EnrollModal({ group, onClose, onEnrolled }: EnrollModalProps) {
  const dialogId = useId();
  const searchRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [selected, setSelected] = useState<Student | null>(null);
  const [createPayment, setCreatePayment] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFull = group.spotsRemaining === 0;

  // Focus search on open
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Fetch students matching search
  useEffect(() => {
    if (!debouncedSearch.trim()) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setLoadingStudents(true);
    listStudents({ search: debouncedSearch.trim(), status: "active", limit: 20 })
      .then((r) => {
        if (!cancelled) setSearchResults(r.items);
      })
      .catch(() => {
        if (!cancelled) setSearchResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingStudents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    try {
      await enrollStudent(group.id, { studentId: selected.id, createPayment });
      onEnrolled();
    } catch (err) {
      const code = (err as { code?: string }).code ?? "unknown";
      if (code === "group_full") setError("Grupa este plină. Nu mai există locuri disponibile.");
      else if (code === "already_enrolled") setError("Elevul este deja înrolat în această grupă.");
      else setError("A apărut o eroare. Încearcă din nou.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${dialogId}-title`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={onClose}
      />

      <div className="relative z-10 w-full max-w-md rounded-xl bg-card p-6 shadow-xl ring-1 ring-border">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h2
              id={`${dialogId}-title`}
              className="text-lg font-semibold text-foreground"
            >
              Înrolează elev
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {group.name}
              {isFull
                ? " · Grupă plină"
                : ` · ${group.spotsRemaining} locuri rămase`}
            </p>
          </div>
          <button
            type="button"
            aria-label="Închide"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors touch-target"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {isFull && (
          <div
            role="alert"
            className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive"
          >
            Această grupă este plină ({group.maxStudents}/{group.maxStudents} locuri).
            Nu se pot adăuga elevi noi.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Student search */}
          <div className="space-y-1.5">
            <label
              htmlFor={`${dialogId}-search`}
              className="block text-sm font-medium text-foreground"
            >
              Caută elev
            </label>
            <div className="relative">
              <input
                id={`${dialogId}-search`}
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelected(null);
                  setSearchResults([]);
                  setError(null);
                }}
                placeholder="Nume, email sau telefon..."
                disabled={isFull}
                className={cn(
                  "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm",
                  "placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              />
              {loadingStudents && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
                </div>
              )}
            </div>

            {/* Results list */}
            {searchResults.length > 0 && selected === null && (
              <ul
                role="listbox"
                aria-label="Rezultate căutare elevi"
                className="mt-1 max-h-48 overflow-auto rounded-lg border border-border bg-popover shadow-lg"
              >
                {searchResults.map((s) => (
                  <li
                    key={s.id}
                    role="option"
                    aria-selected={false}
                  >
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                      onClick={() => {
                        setSelected(s);
                        setSearch(s.fullName);
                        setSearchResults([]);
                        setError(null);
                      }}
                    >
                      <span className="font-medium text-foreground">{s.fullName}</span>
                      {s.email && (
                        <span className="ml-2 text-muted-foreground">{s.email}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {debouncedSearch.trim() && !loadingStudents && searchResults.length === 0 && selected === null && (
              <p className="text-sm text-muted-foreground">Niciun elev găsit.</p>
            )}
          </div>

          {/* Payment checkbox */}
          <div className="flex items-center gap-2">
            <input
              id={`${dialogId}-payment`}
              type="checkbox"
              checked={createPayment}
              onChange={(e) => setCreatePayment(e.target.checked)}
              disabled={isFull}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <label
              htmlFor={`${dialogId}-payment`}
              className="text-sm text-foreground"
            >
              Creează plată draft automată
            </label>
          </div>

          {/* Error */}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors touch-target"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={!selected || isFull || submitting}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground",
                "hover:bg-primary/90 transition-colors touch-target",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserPlus className="h-4 w-4" aria-hidden="true" />
              )}
              Înrolează
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
