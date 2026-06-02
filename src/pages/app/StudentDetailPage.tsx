/**
 * COURSE-103: StudentDetailPage — tabs layout for student profile.
 * Tabs: Info, Grupe (group enrollments), + future tabs.
 */
import { useEffect, useState, useId } from "react";
import { Loader2, ArrowLeft, User } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { StudentGroupsList } from "@/components/app/StudentGroupsList";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { getStudent, type Student } from "@/lib/api/students";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<Student["status"], { label: string; cls: string }> = {
  active: { label: "Activ", cls: "bg-success/15 text-success" },
  trial: { label: "Trial", cls: "bg-primary/15 text-primary" },
  paused: { label: "Pauză", cls: "bg-warning/15 text-warning" },
  archived: { label: "Arhivat", cls: "bg-muted text-muted-foreground" },
};

type Tab = "info" | "grupe";

interface StudentDetailPageProps {
  studentId: string;
}

export function StudentDetailPage({ studentId }: StudentDetailPageProps) {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const tabBarId = useId();

  const [student, setStudent] = useState<Student | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("info");

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getStudent(studentId)
      .then((s) => {
        if (!cancelled) setStudent(s);
      })
      .catch(() => {
        if (!cancelled) setError("Elevul nu a fost găsit.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  if (loading) {
    return (
      <AppShell pageTitle="Profil elev">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only">Se încarcă profilul...</span>
        </div>
      </AppShell>
    );
  }

  if (error || !student) {
    return (
      <AppShell pageTitle="Profil elev">
        <div className="py-16 text-center">
          <p className="text-muted-foreground">{error ?? "Elev negăsit."}</p>
          <button
            type="button"
            onClick={() => navigate("/app/students")}
            className="mt-4 text-sm text-primary hover:underline"
          >
            Înapoi la lista elevilor
          </button>
        </div>
      </AppShell>
    );
  }

  const badge = STATUS_BADGE[student.status];

  return (
    <AppShell pageTitle={student.fullName}>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
        {/* Back link */}
        <button
          type="button"
          onClick={() => navigate("/app/students")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Lista elevilor
        </button>

        {/* Header */}
        <div className="flex items-center gap-4">
          <div
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-primary/10"
            aria-hidden="true"
          >
            <User className="h-6 w-6 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-foreground">{student.fullName}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  badge.cls
                )}
              >
                {badge.label}
              </span>
              {student.email && (
                <span className="text-sm text-muted-foreground">{student.email}</span>
              )}
              {student.phone && (
                <span className="text-sm text-muted-foreground">{student.phone}</span>
              )}
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div
          role="tablist"
          aria-label="Secțiuni profil elev"
          id={tabBarId}
          className="border-b border-border"
        >
          {(["info", "grupe"] as const).map((tab) => {
            const labels: Record<Tab, string> = { info: "Informații", grupe: "Grupe" };
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`${tabBarId}-tab-${tab}`}
                aria-selected={activeTab === tab}
                aria-controls={`${tabBarId}-panel-${tab}`}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "mr-1 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                  activeTab === tab
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* Tab panels */}
        <div
          role="tabpanel"
          id={`${tabBarId}-panel-info`}
          aria-labelledby={`${tabBarId}-tab-info`}
          hidden={activeTab !== "info"}
        >
          {activeTab === "info" && (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                { label: "Nume complet", value: student.fullName },
                { label: "Email elev", value: student.email ?? "—" },
                { label: "Telefon elev", value: student.phone ?? "—" },
                { label: "Email părinte", value: student.parentEmail ?? "—" },
                { label: "Telefon părinte", value: student.parentPhone ?? "—" },
                { label: "Data nașterii", value: student.birthDate ?? "—" },
                { label: "Note", value: student.notes ?? "—" },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border border-border p-3">
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div
          role="tabpanel"
          id={`${tabBarId}-panel-grupe`}
          aria-labelledby={`${tabBarId}-tab-grupe`}
          hidden={activeTab !== "grupe"}
        >
          {activeTab === "grupe" && (
            <StudentGroupsList studentId={studentId} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
