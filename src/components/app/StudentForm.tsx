import { useState, useEffect, useRef, useCallback, FormEvent } from "react";
import { Loader2, AlertTriangle, ExternalLink } from "lucide-react";
import { ApiError } from "@/lib/api";
import { createStudent, updateStudent, type Student, type StudentInput } from "@/lib/api/students";
import { cn } from "@/lib/utils";

interface StudentFormProps {
  initial?: Student | null;
  onSuccess: (student: Student) => void;
  onCancel: () => void;
}

const STATUSES: Array<Student["status"]> = ["active", "trial", "paused", "archived"];
const STATUS_LABEL: Record<Student["status"], string> = {
  active: "Activ",
  trial: "Trial",
  paused: "Pauză",
  archived: "Arhivat",
};

const DAY_OPTIONS = [
  { label: "L", full: "Luni", val: 1 },
  { label: "M", full: "Marți", val: 2 },
  { label: "Mi", full: "Miercuri", val: 3 },
  { label: "J", full: "Joi", val: 4 },
  { label: "V", full: "Vineri", val: 5 },
  { label: "S", full: "Sâmbătă", val: 6 },
  { label: "D", full: "Duminică", val: 7 },
];

export function StudentForm({ initial, onSuccess, onCancel }: StudentFormProps) {
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [parentPhone, setParentPhone] = useState(initial?.parentPhone ?? "");
  const [parentEmail, setParentEmail] = useState(initial?.parentEmail ?? "");
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? "");
  const [status, setStatus] = useState<Student["status"]>(initial?.status ?? "trial");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [preferredDays, setPreferredDays] = useState<number[]>(initial?.preferredDays ?? []);
  const [preferredTimeStart, setPreferredTimeStart] = useState(initial?.preferredTimeStart ?? "");
  const [preferredTimeEnd, setPreferredTimeEnd] = useState(initial?.preferredTimeEnd ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // STU-205: duplicate detection state
  const [phoneDupMatches, setPhoneDupMatches] = useState<DuplicateMatch[]>([]);
  const [nameDupMatches, setNameDupMatches] = useState<DuplicateMatch[]>([]);
  const [phoneDupDismissed, setPhoneDupDismissed] = useState(false);
  const [nameDupDismissed, setNameDupDismissed] = useState(false);
  const phoneDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkPhoneDuplicate = useCallback((val: string) => {
    if (initial) return; // Don't show duplicate banner when editing
    if (phoneDebounceRef.current) clearTimeout(phoneDebounceRef.current);
    if (val.replace(/\D/g, "").length < 9) {
      setPhoneDupMatches([]);
      return;
    }
    phoneDebounceRef.current = setTimeout(async () => {
      try {
        const res = await checkStudentDuplicate({ phone: val });
        setPhoneDupMatches(res.matches);
        setPhoneDupDismissed(false);
      } catch {
        // Silently ignore — duplicate check is non-blocking
      }
    }, 400);
  }, [initial]);

  const checkNameDuplicate = useCallback((val: string) => {
    if (initial) return;
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    if (val.trim().length < 5) {
      setNameDupMatches([]);
      return;
    }
    nameDebounceRef.current = setTimeout(async () => {
      try {
        const res = await checkStudentDuplicate({ fullName: val });
        setNameDupMatches(res.matches);
        setNameDupDismissed(false);
      } catch {
        // Silently ignore
      }
    }, 400);
  }, [initial]);

  useEffect(() => {
    setFullName(initial?.fullName ?? "");
    setPhone(initial?.phone ?? "");
    setEmail(initial?.email ?? "");
    setParentPhone(initial?.parentPhone ?? "");
    setParentEmail(initial?.parentEmail ?? "");
    setBirthDate(initial?.birthDate ?? "");
    setStatus(initial?.status ?? "trial");
    setNotes(initial?.notes ?? "");
    setPreferredDays(initial?.preferredDays ?? []);
    setPreferredTimeStart(initial?.preferredTimeStart ?? "");
    setPreferredTimeEnd(initial?.preferredTimeEnd ?? "");
    setError(null);
  }, [initial]);

  const toggleDay = (val: number) => {
    setPreferredDays((prev) =>
      prev.includes(val) ? prev.filter((d) => d !== val) : [...prev, val].sort((a, b) => a - b)
    );
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const payload: StudentInput = {
      fullName: fullName.trim(),
      phone: phone || null,
      email: email || null,
      parentPhone: parentPhone || null,
      parentEmail: parentEmail || null,
      birthDate: birthDate || null,
      status,
      notes: notes || null,
      preferredDays: preferredDays.length > 0 ? preferredDays : null,
      preferredTimeStart: preferredTimeStart || null,
      preferredTimeEnd: preferredTimeEnd || null,
    };
    try {
      const saved = initial
        ? await updateStudent(initial.id, payload)
        : await createStudent(payload);
      onSuccess(saved);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(`Eroare: ${err.code}`);
      } else {
        setError("Nu pot salva. Verifică conexiunea.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field id="sf-name" label="Nume complet" required>
        <input
          id="sf-name"
          type="text"
          required
          minLength={2}
          maxLength={200}
          value={fullName}
          onChange={(e) => { setFullName(e.target.value); checkNameDuplicate(e.target.value); }}
          className="input-base"
        />
        {/* STU-205: name duplicate banner */}
        {nameDupMatches.length > 0 && !nameDupDismissed && (
          <DuplicateBanner
            matches={nameDupMatches}
            onDismiss={() => setNameDupDismissed(true)}
          />
        )}
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="sf-phone" label="Telefon elev">
          <input
            id="sf-phone"
            type="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); checkPhoneDuplicate(e.target.value); }}
            className="input-base"
            placeholder="+40 7XX XXX XXX"
          />
          {/* STU-205: phone duplicate banner */}
          {phoneDupMatches.length > 0 && !phoneDupDismissed && (
            <DuplicateBanner
              matches={phoneDupMatches}
              onDismiss={() => setPhoneDupDismissed(true)}
            />
          )}
        </Field>
        <Field id="sf-email" label="Email elev">
          <input
            id="sf-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-base"
            placeholder="elev@example.com"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="sf-parent-phone" label="Telefon părinte">
          <input
            id="sf-parent-phone"
            type="tel"
            value={parentPhone}
            onChange={(e) => setParentPhone(e.target.value)}
            className="input-base"
          />
        </Field>
        <Field id="sf-parent-email" label="Email părinte">
          <input
            id="sf-parent-email"
            type="email"
            value={parentEmail}
            onChange={(e) => setParentEmail(e.target.value)}
            className="input-base"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="sf-bdate" label="Data nașterii">
          <input
            id="sf-bdate"
            type="date"
            value={birthDate ?? ""}
            onChange={(e) => setBirthDate(e.target.value)}
            className="input-base"
          />
        </Field>
        <Field id="sf-status" label="Status">
          <select
            id="sf-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as Student["status"])}
            className="input-base"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field id="sf-notes" label="Note interne">
        <textarea
          id="sf-notes"
          rows={3}
          maxLength={1000}
          value={notes ?? ""}
          onChange={(e) => setNotes(e.target.value)}
          className="input-base resize-none"
        />
      </Field>

      {/* GAP-001: Preferred schedule */}
      <div>
        <p className="block text-sm font-semibold mb-1.5">Disponibilitate preferată</p>
        <div className="flex flex-wrap gap-1 mb-2" role="group" aria-label="Zile preferate">
          {DAY_OPTIONS.map(({ label, full, val }) => (
            <button
              key={val}
              type="button"
              aria-label={full}
              aria-pressed={preferredDays.includes(val)}
              onClick={() => toggleDay(val)}
              className={cn(
                "h-8 w-8 rounded-full text-xs font-medium border transition-colors",
                preferredDays.includes(val)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-input hover:border-primary"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1.5">
            <label htmlFor="sf-time-start" className="text-xs text-muted-foreground whitespace-nowrap">De la:</label>
            <input
              id="sf-time-start"
              type="time"
              value={preferredTimeStart}
              onChange={(e) => setPreferredTimeStart(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              aria-label="Ora de start preferată"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label htmlFor="sf-time-end" className="text-xs text-muted-foreground whitespace-nowrap">Până la:</label>
            <input
              id="sf-time-end"
              type="time"
              value={preferredTimeEnd}
              onChange={(e) => setPreferredTimeEnd(e.target.value)}
              className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              aria-label="Ora de sfârșit preferată"
            />
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
        >
          Anulează
        </button>
        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {initial ? "Salvează modificări" : "Adaugă elev"}
        </button>
      </div>

      <style>{`
        .input-base {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid hsl(var(--input));
          background-color: hsl(var(--background));
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        .input-base:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px hsl(var(--ring));
        }
      `}</style>
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ id, label, required, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold mb-1.5">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      {children}
    </div>
  );
}

// STU-205: Duplicate detection banner component
interface DuplicateBannerProps {
  matches: DuplicateMatch[];
  onDismiss: () => void;
}

function DuplicateBanner({ matches, onDismiss }: DuplicateBannerProps) {
  const first = matches[0];
  return (
    <div
      role="alert"
      aria-live="polite"
      className="mt-2 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning"
    >
      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <span className="font-semibold">Posibil duplicat: </span>
        <span className="truncate">{first.fullName}</span>
        {first.phone && <span className="text-warning/80"> ({first.phone})</span>}
        {" "}
        <a
          href={`#/app/students/${first.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 underline hover:text-warning/80"
          aria-label={`Deschide profilul existent al lui ${first.fullName}`}
        >
          Deschide profilul existent
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
        {matches.length > 1 && (
          <span className="text-warning/70"> (+{matches.length - 1} altele)</span>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Continuă oricum, ignoră posibilul duplicat"
        className="flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold border border-warning/40 hover:bg-warning/20 transition-colors"
      >
        Continuă oricum
      </button>
    </div>
  );
}
