import { useState, useEffect, FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { createStudent, updateStudent, type Student, type StudentInput } from "@/lib/api/students";

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

export function StudentForm({ initial, onSuccess, onCancel }: StudentFormProps) {
  const [fullName, setFullName] = useState(initial?.fullName ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [parentPhone, setParentPhone] = useState(initial?.parentPhone ?? "");
  const [parentEmail, setParentEmail] = useState(initial?.parentEmail ?? "");
  const [birthDate, setBirthDate] = useState(initial?.birthDate ?? "");
  const [status, setStatus] = useState<Student["status"]>(initial?.status ?? "trial");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(initial?.fullName ?? "");
    setPhone(initial?.phone ?? "");
    setEmail(initial?.email ?? "");
    setParentPhone(initial?.parentPhone ?? "");
    setParentEmail(initial?.parentEmail ?? "");
    setBirthDate(initial?.birthDate ?? "");
    setStatus(initial?.status ?? "trial");
    setNotes(initial?.notes ?? "");
    setError(null);
  }, [initial]);

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
          onChange={(e) => setFullName(e.target.value)}
          className="input-base"
        />
      </Field>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field id="sf-phone" label="Telefon elev">
          <input
            id="sf-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="input-base"
            placeholder="+40 7XX XXX XXX"
          />
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
