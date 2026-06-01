/**
 * GAP-019 — Pagina de detaliu student /app/students/:id
 *
 * Afișează info student + secțiunea "Insigne" (badges gamification).
 * Link înapoi la lista de elevi.
 */
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, User } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { StudentBadgesSection } from "@/components/app/StudentBadgesSection";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { api, ApiError } from "@/lib/api";
import type { Student } from "@/lib/api/students";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<Student["status"], { label: string; cls: string }> = {
  active: { label: "Activ", cls: "bg-success/15 text-success" },
  trial: { label: "Trial", cls: "bg-primary/15 text-primary" },
  paused: { label: "Pauză", cls: "bg-warning/15 text-warning" },
  archived: { label: "Arhivat", cls: "bg-muted text-muted-foreground" },
};

interface StudentDetailPageProps {
  studentId: string;
}

export function StudentDetailPage({ studentId }: StudentDetailPageProps) {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    let cancelled = false;
    setLoading(true);
    api<Student>(`/api/students/${studentId}`)
      .then((data) => {
        if (!cancelled) {
          setStudent(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          if (err instanceof ApiError && err.status === 404) {
            setError("Elevul nu a fost găsit.");
          } else {
            setError("Eroare la încărcarea datelor.");
          }
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, sessionStatus]);

  if (sessionStatus === "loading") return null;
  if (sessionStatus === "unauthenticated") {
    navigate("/app/login");
    return null;
  }

  return (
    <AppShell
      pageTitle={student?.fullName ?? "Detalii elev"}
      pageDescription="Profil elev + insigne"
      actions={
        <button
          type="button"
          onClick={() => navigate("/app/students")}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          aria-label="Înapoi la lista de elevi"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Înapoi
        </button>
      }
    >
      {loading && (
        <div className="flex items-center justify-center py-16" aria-busy="true" aria-label="Se încarcă datele elevului">
          <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive text-center py-8">
          {error}
        </p>
      )}
      {student && !loading && (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Student info card */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 shrink-0">
                <User className="h-6 w-6 text-primary" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-lg font-bold text-foreground">{student.fullName}</h2>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                      STATUS_BADGE[student.status].cls
                    )}
                  >
                    {STATUS_BADGE[student.status].label}
                  </span>
                </div>
                <dl className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                  {student.phone && (
                    <div className="flex gap-1.5">
                      <dt className="text-muted-foreground shrink-0">Telefon:</dt>
                      <dd className="text-foreground">{student.phone}</dd>
                    </div>
                  )}
                  {student.email && (
                    <div className="flex gap-1.5">
                      <dt className="text-muted-foreground shrink-0">Email:</dt>
                      <dd className="text-foreground truncate">{student.email}</dd>
                    </div>
                  )}
                  {student.parentPhone && (
                    <div className="flex gap-1.5">
                      <dt className="text-muted-foreground shrink-0">Telefon părinte:</dt>
                      <dd className="text-foreground">{student.parentPhone}</dd>
                    </div>
                  )}
                  {student.parentEmail && (
                    <div className="flex gap-1.5">
                      <dt className="text-muted-foreground shrink-0">Email părinte:</dt>
                      <dd className="text-foreground truncate">{student.parentEmail}</dd>
                    </div>
                  )}
                  {student.birthDate && (
                    <div className="flex gap-1.5">
                      <dt className="text-muted-foreground shrink-0">Data nașterii:</dt>
                      <dd className="text-foreground">
                        {new Date(student.birthDate).toLocaleDateString("ro-RO")}
                      </dd>
                    </div>
                  )}
                </dl>
                {student.notes && (
                  <p className="mt-2 text-sm text-muted-foreground">{student.notes}</p>
                )}
              </div>
            </div>
          </div>

          {/* Badges section (GAP-019) */}
          <StudentBadgesSection studentId={student.id} />
        </div>
      )}
    </AppShell>
  );
}
