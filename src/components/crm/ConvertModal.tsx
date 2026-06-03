/**
 * CRM-111 — Enhanced conversion modal
 * lead → student + optional family (payer ↔ students)
 * Pre-fills from lead fields; supports payer (parent) data
 */
import { useState, useEffect } from "react";
import { Loader2, UserPlus, X, Users, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { convertLead, type Lead } from "@/lib/api/leads";
import { listCohorts, type Cohort } from "@/lib/api/cohorts";
import { ApiError } from "@/lib/api";

interface ConvertModalProps {
  lead: Lead;
  onSuccess: (result: { studentId: string; familyId: string | null; enrolledCohortId: string | null }) => void;
  onCancel: () => void;
}

export function ConvertModal({ lead, onSuccess, onCancel }: ConvertModalProps) {
  const [studentName, setStudentName] = useState(lead.fullName);
  const [studentPhone, setStudentPhone] = useState(lead.phone ?? "");
  const [studentEmail, setStudentEmail] = useState(lead.email ?? "");
  const [birthDate, setBirthDate] = useState("");
  const [studentStatus, setStudentStatus] = useState<"active" | "trial">("active");

  // Payer (parent) fields
  const [hasParent, setHasParent] = useState(false);
  const [payerName, setPayerName] = useState("");
  const [payerPhone, setPayerPhone] = useState("");
  const [payerEmail, setPayerEmail] = useState("");

  // CX: pick which cohort/edition to enroll the new student in.
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [cohortsLoading, setCohortsLoading] = useState(true);

  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load enrollable cohorts (active + upcoming). If the lead has a courseId, the
  // cohorts of that course are surfaced first and one is pre-selected.
  useEffect(() => {
    let cancelled = false;
    listCohorts()
      .then((res) => {
        if (cancelled) return;
        const enrollable = res.cohorts.filter((c) => c.category !== "past");
        // Course of this lead first (if known), then by start date.
        enrollable.sort((a, b) => {
          const aMatch = lead.courseId && a.courseId === lead.courseId ? 0 : 1;
          const bMatch = lead.courseId && b.courseId === lead.courseId ? 0 : 1;
          if (aMatch !== bMatch) return aMatch - bMatch;
          return a.startDate.localeCompare(b.startDate);
        });
        setCohorts(enrollable);
        // Pre-select the first cohort of the lead's course, if any.
        const preferred = lead.courseId ? enrollable.find((c) => c.courseId === lead.courseId) : null;
        if (preferred) setCohortId(preferred.id);
      })
      .catch(() => { /* cohort picker just stays empty — never blocks convert */ })
      .finally(() => { if (!cancelled) setCohortsLoading(false); });
    return () => { cancelled = true; };
  }, [lead.courseId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) return;
    setConverting(true);
    setError(null);
    try {
      const result = await convertLead(lead.id, {
        studentName: studentName.trim(),
        studentPhone: studentPhone.trim() || null,
        studentEmail: studentEmail.trim() || null,
        birthDate: birthDate || null,
        studentStatus,
        payerName: hasParent && payerName.trim() ? payerName.trim() : null,
        payerPhone: hasParent && payerPhone.trim() ? payerPhone.trim() : null,
        payerEmail: hasParent && payerEmail.trim() ? payerEmail.trim() : null,
        cohortId: cohortId || null,
      });
      onSuccess({ studentId: result.student.id, familyId: result.familyId, enrolledCohortId: result.autoEnrolledCohortId });
    } catch (err) {
      if (err instanceof ApiError && err.code === "already_converted") {
        setError("Lead-ul a fost deja convertit.");
      } else {
        setError("Nu am putut converti lead-ul. Încearcă din nou.");
      }
    } finally {
      setConverting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Convertește în student"
    >
      <div className="absolute inset-0 bg-foreground/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b border-border px-5 py-3.5 flex items-center justify-between sticky top-0 bg-card rounded-t-2xl">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-success" aria-hidden="true" />
            <h2 className="text-base font-bold">Convertește în student</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Închide"
            className="rounded-md hover:bg-muted p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Lead name hint */}
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Lead: </span>
              <span className="font-semibold">{lead.fullName}</span>
              {lead.interestCourse && (
                <span className="text-muted-foreground"> · {lead.interestCourse}</span>
              )}
            </div>

            {/* Student data */}
            <fieldset className="space-y-3">
              <legend className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Date elev</legend>

              <div>
                <label htmlFor="conv-student-name" className="block text-xs font-semibold text-muted-foreground mb-1">
                  Nume complet <span className="text-destructive">*</span>
                </label>
                <input
                  id="conv-student-name"
                  type="text"
                  required
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  aria-label="Nume complet elev"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label htmlFor="conv-student-phone" className="block text-xs font-semibold text-muted-foreground mb-1">Telefon</label>
                  <input
                    id="conv-student-phone"
                    type="tel"
                    value={studentPhone}
                    onChange={(e) => setStudentPhone(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    aria-label="Telefon elev"
                  />
                </div>
                <div>
                  <label htmlFor="conv-student-email" className="block text-xs font-semibold text-muted-foreground mb-1">Email</label>
                  <input
                    id="conv-student-email"
                    type="email"
                    value={studentEmail}
                    onChange={(e) => setStudentEmail(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    aria-label="Email elev"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <label htmlFor="conv-birth-date" className="block text-xs font-semibold text-muted-foreground mb-1">Data nașterii (opțional)</label>
                  <input
                    id="conv-birth-date"
                    type="date"
                    value={birthDate}
                    onChange={(e) => setBirthDate(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    aria-label="Data nașterii elev"
                  />
                </div>
                <div>
                  <label htmlFor="conv-status" className="block text-xs font-semibold text-muted-foreground mb-1">Status</label>
                  <div className="relative">
                    <select
                      id="conv-status"
                      value={studentStatus}
                      onChange={(e) => setStudentStatus(e.target.value as "active" | "trial")}
                      className="w-full appearance-none rounded-md border border-input bg-background px-3 py-2 pr-8 text-sm"
                      aria-label="Status student nou"
                    >
                      <option value="active">Activ</option>
                      <option value="trial">Trial</option>
                    </select>
                  </div>
                </div>
              </div>
            </fieldset>

            {/* CX: enroll in a cohort / edition */}
            <fieldset className="space-y-2">
              <legend className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <GraduationCap className="h-3.5 w-3.5" aria-hidden="true" />
                Înscrie în grupă
              </legend>
              <select
                value={cohortId}
                onChange={(e) => setCohortId(e.target.value)}
                disabled={cohortsLoading}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                aria-label="Grupă / ediție în care se înscrie elevul"
              >
                <option value="">
                  {cohortsLoading ? "Se încarcă grupele…" : "— Fără înscriere acum —"}
                </option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}{c.courseName ? ` · ${c.courseName}` : ""} ({c.category === "active" ? "activă" : "viitoare"})
                  </option>
                ))}
              </select>
              {!cohortsLoading && cohorts.length === 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Nu există grupe active/viitoare.{" "}
                  <a href="#/app/cx" className="text-primary underline">Creează o grupă</a> în pagina Grupe.
                </p>
              )}
            </fieldset>

            {/* Family toggle */}
            <div>
              <label className="flex items-center gap-2.5 cursor-pointer rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                <input
                  type="checkbox"
                  checked={hasParent}
                  onChange={(e) => setHasParent(e.target.checked)}
                  className="rounded"
                  aria-label="Adaugă date plătitor (părinte/tutore)"
                />
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="text-sm font-semibold">Adaugă plătitor (părinte/tutore)</span>
                </div>
              </label>
            </div>

            {/* Payer fields */}
            {hasParent && (
              <fieldset className="space-y-3 rounded-xl border border-border p-4 bg-muted/10">
                <legend className="text-xs font-bold uppercase tracking-wide text-muted-foreground px-1">Date plătitor</legend>

                <div>
                  <label htmlFor="conv-payer-name" className="block text-xs font-semibold text-muted-foreground mb-1">
                    Nume plătitor <span className="text-destructive">*</span>
                  </label>
                  <input
                    id="conv-payer-name"
                    type="text"
                    required={hasParent}
                    value={payerName}
                    onChange={(e) => setPayerName(e.target.value)}
                    placeholder="ex: Ion Popescu"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    aria-label="Nume plătitor"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label htmlFor="conv-payer-phone" className="block text-xs font-semibold text-muted-foreground mb-1">Telefon</label>
                    <input
                      id="conv-payer-phone"
                      type="tel"
                      value={payerPhone}
                      onChange={(e) => setPayerPhone(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      aria-label="Telefon plătitor"
                    />
                  </div>
                  <div>
                    <label htmlFor="conv-payer-email" className="block text-xs font-semibold text-muted-foreground mb-1">Email</label>
                    <input
                      id="conv-payer-email"
                      type="email"
                      value={payerEmail}
                      onChange={(e) => setPayerEmail(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      aria-label="Email plătitor"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-muted-foreground">
                  Va crea o familie nouă în sistem. Plătitorul primește notificările de plată.
                </p>
              </fieldset>
            )}

            {/* Error */}
            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-5 py-3.5 flex justify-end gap-2 bg-card rounded-b-2xl">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={converting || !studentName.trim() || (hasParent && !payerName.trim())}
              className="inline-flex items-center gap-2 rounded-md bg-success px-4 py-2 text-sm font-semibold text-success-foreground hover:bg-success/90 disabled:opacity-50"
            >
              {converting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Se convertește…
                </>
              ) : (
                <>
                  <UserPlus className="h-4 w-4" aria-hidden="true" /> Convertește în student
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Score badge helper ────────────────────────────────────────────────────────

export type ScoreBadge = "hot" | "warm" | "cold";

export function getScoreBadge(score: number | null | undefined): ScoreBadge {
  if (score == null) return "cold";
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

export const SCORE_BADGE_STYLES: Record<ScoreBadge, string> = {
  hot: "bg-destructive/10 text-destructive border-destructive/30",
  warm: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-300",
  cold: "bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-400 border-sky-300",
};

export const SCORE_BADGE_LABELS: Record<ScoreBadge, string> = {
  hot: "hot",
  warm: "warm",
  cold: "cold",
};
