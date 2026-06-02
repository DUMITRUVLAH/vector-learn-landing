/**
 * STU-201: StudentDetailPage — full student profile with tabs:
 * "Contact", "Plăți", "Lecții"
 * Extends the basic student data with payment history, lesson attendance,
 * and origin lead badge.
 */
import { useEffect, useState, useCallback } from "react";
import { ArrowLeft, User, CreditCard, BookOpen, Phone, Mail, ExternalLink } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  getStudent,
  getStudentPayments,
  getStudentLessons,
  getStudentOriginLead,
  updateStudent,
  type Student,
  type StudentPayment,
  type StudentLesson,
  type OriginLead,
} from "@/lib/api/students";
import { cn } from "@/lib/utils";

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ro-RO", { year: "numeric", month: "short", day: "numeric" });
}

function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: currency || "RON",
    minimumFractionDigits: 0,
  }).format(cents / 100);
}

// ─── sub-components ──────────────────────────────────────────────────────────

const PAYMENT_STATUS: Record<StudentPayment["status"], { label: string; cls: string }> = {
  pending: { label: "În așteptare", cls: "bg-warning/15 text-warning" },
  paid: { label: "Plătit", cls: "bg-success/15 text-success" },
  overdue: { label: "Restant", cls: "bg-destructive/15 text-destructive" },
  refunded: { label: "Rambursat", cls: "bg-muted text-muted-foreground" },
  cancelled: { label: "Anulat", cls: "bg-muted text-muted-foreground" },
};

const ATTENDANCE_STATUS: Record<StudentLesson["attendanceStatus"], { label: string; cls: string }> = {
  present: { label: "Prezent", cls: "bg-success/15 text-success" },
  absent: { label: "Absent", cls: "bg-destructive/15 text-destructive" },
  late: { label: "Întârziat", cls: "bg-warning/15 text-warning" },
  excused: { label: "Motivat", cls: "bg-primary/15 text-primary" },
  pending: { label: "—", cls: "bg-muted text-muted-foreground" },
};

// ─── Payments tab ─────────────────────────────────────────────────────────────

function PaymentsTab({ studentId }: { studentId: string }) {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<StudentPayment[]>([]);
  const [totalPaid, setTotalPaid] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getStudentPayments(studentId)
      .then(({ items, totalPaidCents }) => {
        setPayments(items);
        setTotalPaid(totalPaidCents);
      })
      .catch(() => setError("Eroare la încărcarea plăților"))
      .finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return <div className="py-8 text-center text-muted-foreground">Se încarcă...</div>;
  if (error) return <div className="py-8 text-center text-destructive">{error}</div>;
  if (payments.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <CreditCard className="mx-auto mb-2 h-8 w-8 opacity-40" />
        <p>Nicio plată înregistrată.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="py-2 px-4 text-left font-medium text-muted-foreground">Data</th>
              <th className="py-2 px-4 text-left font-medium text-muted-foreground">Sumă</th>
              <th className="py-2 px-4 text-left font-medium text-muted-foreground">Status</th>
              <th className="py-2 px-4 text-left font-medium text-muted-foreground hidden sm:table-cell">Scadență</th>
              <th className="py-2 px-4 text-left font-medium text-muted-foreground hidden md:table-cell">Descriere</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {payments.map((p) => {
              const st = PAYMENT_STATUS[p.status];
              return (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                  <td className="py-2 px-4 text-foreground">{formatDate(p.paidAt ?? p.createdAt)}</td>
                  <td className="py-2 px-4 font-medium text-foreground">
                    {formatCents(p.amountCents, p.currency)}
                  </td>
                  <td className="py-2 px-4">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", st.cls)}>
                      {st.label}
                    </span>
                  </td>
                  <td className="py-2 px-4 text-muted-foreground hidden sm:table-cell">
                    {formatDate(p.dueDate)}
                  </td>
                  <td className="py-2 px-4 text-muted-foreground hidden md:table-cell">
                    {p.description ?? "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {totalPaid > 0 && (
            <tfoot className="bg-muted/30 border-t border-border">
              <tr>
                <td colSpan={4} className="py-2 px-4 text-sm font-medium text-muted-foreground">
                  Total plătit
                </td>
                <td className="py-2 px-4 font-semibold text-success">
                  {formatCents(totalPaid, payments[0]?.currency ?? "RON")}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ─── Lessons tab ──────────────────────────────────────────────────────────────

type LessonFilter = "all" | "present" | "absent";

function LessonsTab({ studentId }: { studentId: string }) {
  const [loading, setLoading] = useState(true);
  const [lessons, setLessons] = useState<StudentLesson[]>([]);
  const [filter, setFilter] = useState<LessonFilter>("all");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getStudentLessons(studentId)
      .then(({ items }) => setLessons(items))
      .catch(() => setError("Eroare la încărcarea lecțiilor"))
      .finally(() => setLoading(false));
  }, [studentId]);

  const filtered = filter === "all"
    ? lessons
    : lessons.filter((l) => l.attendanceStatus === filter);

  if (loading) return <div className="py-8 text-center text-muted-foreground">Se încarcă...</div>;
  if (error) return <div className="py-8 text-center text-destructive">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["all", "present", "absent"] as LessonFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1 rounded-full text-xs font-medium transition-colors",
              filter === f
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {f === "all" ? "Toate" : f === "present" ? "Prezent" : "Absent"}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <BookOpen className="mx-auto mb-2 h-8 w-8 opacity-40" />
          <p>{filter === "all" ? "Nicio lecție înregistrată." : `Nicio lecție cu status "${filter}".`}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="py-2 px-4 text-left font-medium text-muted-foreground">Data</th>
                <th className="py-2 px-4 text-left font-medium text-muted-foreground">Curs</th>
                <th className="py-2 px-4 text-left font-medium text-muted-foreground hidden sm:table-cell">Profesor</th>
                <th className="py-2 px-4 text-left font-medium text-muted-foreground hidden sm:table-cell">Durată</th>
                <th className="py-2 px-4 text-left font-medium text-muted-foreground">Prezență</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((l) => {
                const att = ATTENDANCE_STATUS[l.attendanceStatus];
                return (
                  <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-2 px-4 text-foreground whitespace-nowrap">{formatDate(l.scheduledAt)}</td>
                    <td className="py-2 px-4 text-foreground">{l.courseName}</td>
                    <td className="py-2 px-4 text-muted-foreground hidden sm:table-cell">{l.teacherName}</td>
                    <td className="py-2 px-4 text-muted-foreground hidden sm:table-cell">{l.durationMinutes} min</td>
                    <td className="py-2 px-4">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", att.cls)}>
                        {att.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Contact tab ──────────────────────────────────────────────────────────────

interface ContactTabProps {
  student: Student;
  onUpdated: (s: Student) => void;
}

function ContactTab({ student, onUpdated }: ContactTabProps) {
  const [notes, setNotes] = useState(student.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleBlur = useCallback(async () => {
    if (notes === (student.notes ?? "")) return;
    setSaving(true);
    try {
      const updated = await updateStudent(student.id, { notes });
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silent — user can retry
    } finally {
      setSaving(false);
    }
  }, [notes, student, onUpdated]);

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Elev</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-foreground">{student.fullName}</span>
          </div>
          {student.phone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <a href={`tel:${student.phone}`} className="text-primary hover:underline">{student.phone}</a>
            </div>
          )}
          {student.email && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <a href={`mailto:${student.email}`} className="text-primary hover:underline">{student.email}</a>
            </div>
          )}
          {student.birthDate && (
            <div className="text-muted-foreground">
              Data nașterii: {formatDate(student.birthDate)}
            </div>
          )}
        </div>
      </div>
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-foreground">Părinte / Tutore</h3>
        <div className="space-y-2 text-sm">
          {student.parentPhone ? (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <a href={`tel:${student.parentPhone}`} className="text-primary hover:underline">{student.parentPhone}</a>
            </div>
          ) : (
            <p className="text-muted-foreground">Telefon necompletat</p>
          )}
          {student.parentEmail && (
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              <a href={`mailto:${student.parentEmail}`} className="text-primary hover:underline">{student.parentEmail}</a>
            </div>
          )}
        </div>
      </div>
      <div className="sm:col-span-2 space-y-2">
        <label htmlFor="student-notes" className="block text-sm font-medium text-foreground">
          Note interne
        </label>
        <textarea
          id="student-notes"
          rows={4}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          placeholder="Note despre elev (vizibile doar intern, nu părintelui)..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void handleBlur()}
          aria-label="Note interne despre elev"
        />
        {saving && <p className="text-xs text-muted-foreground">Se salvează...</p>}
        {saved && <p className="text-xs text-success">Salvat.</p>}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type Tab = "contact" | "payments" | "lessons";

interface StudentDetailPageProps {
  studentId: string;
}

export function StudentDetailPage({ studentId }: StudentDetailPageProps) {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [originLead, setOriginLead] = useState<OriginLead | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("contact");

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (!studentId) return;
    setLoading(true);
    Promise.all([
      getStudent(studentId),
      getStudentOriginLead(studentId).catch(() => ({ lead: null })),
    ])
      .then(([s, { lead }]) => {
        setStudent(s);
        setOriginLead(lead);
      })
      .catch(() => setError("Elevul nu a fost găsit sau nu ai acces."))
      .finally(() => setLoading(false));
  }, [studentId]);

  const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
    active: { label: "Activ", cls: "bg-success/15 text-success" },
    trial: { label: "Trial", cls: "bg-primary/15 text-primary" },
    paused: { label: "Pauză", cls: "bg-warning/15 text-warning" },
    archived: { label: "Arhivat", cls: "bg-muted text-muted-foreground" },
  };

  const tabs: Array<{ id: Tab; label: string; icon: typeof User }> = [
    { id: "contact", label: "Contact", icon: User },
    { id: "payments", label: "Plăți", icon: CreditCard },
    { id: "lessons", label: "Lecții", icon: BookOpen },
  ];

  const pageTitle = student ? student.fullName : "Profil elev";

  return (
    <AppShell pageTitle={pageTitle}>
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {/* Back nav */}
        <button
          onClick={() => navigate("/app/students")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Înapoi la lista elevilor"
        >
          <ArrowLeft className="h-4 w-4" />
          Înapoi la elevi
        </button>

        {loading && (
          <div className="py-12 text-center text-muted-foreground">Se încarcă...</div>
        )}
        {error && (
          <div className="py-12 text-center text-destructive">{error}</div>
        )}

        {!loading && student && (
          <>
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <span className="text-sm font-semibold text-primary">
                    {student.fullName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-foreground">{student.fullName}</h1>
                  <div className="flex items-center gap-2 mt-0.5">
                    {STATUS_BADGE[student.status] && (
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                        STATUS_BADGE[student.status].cls
                      )}>
                        {STATUS_BADGE[student.status].label}
                      </span>
                    )}
                    {/* STU-201: Lead origin badge */}
                    {originLead && (
                      <a
                        href={`#/app/leads/${originLead.id}`}
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                        aria-label={`Lead de origine: ${originLead.fullName}`}
                      >
                        Lead origine
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-border">
              <nav className="flex gap-0 -mb-px" role="tablist" aria-label="Secțiuni profil elev">
                {tabs.map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      role="tab"
                      aria-selected={activeTab === t.id}
                      aria-controls={`tab-panel-${t.id}`}
                      onClick={() => setActiveTab(t.id)}
                      className={cn(
                        "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
                        activeTab === t.id
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {t.label}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Tab panels */}
            <div>
              {activeTab === "contact" && (
                <div role="tabpanel" id="tab-panel-contact" aria-labelledby="tab-contact">
                  <ContactTab student={student} onUpdated={setStudent} />
                </div>
              )}
              {activeTab === "payments" && (
                <div role="tabpanel" id="tab-panel-payments" aria-labelledby="tab-payments">
                  <PaymentsTab studentId={studentId} />
                </div>
              )}
              {activeTab === "lessons" && (
                <div role="tabpanel" id="tab-panel-lessons" aria-labelledby="tab-lessons">
                  <LessonsTab studentId={studentId} />
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
