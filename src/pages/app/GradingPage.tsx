/**
 * MOB-102: Teacher grading page
 * Route: /app/grading
 * Shows all submitted homework for the teacher to review.
 */
import { useEffect, useState } from "react";
import { BookOpen, CheckCircle, Clock, Loader2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { api } from "@/lib/api";

interface HomeworkItem {
  id: string;
  body: string;
  deadline: string;
  status: "pending" | "submitted" | "graded";
  studentId: string;
  lessonId: string;
}

function formatDeadline(deadline: string): string {
  return new Date(deadline).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function GradingPage() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();
  const [items, setItems] = useState<HomeworkItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    api<{ homework: HomeworkItem[] }>("/api/m/grading")
      .then((d) => { setItems(d.homework); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sessionStatus]);

  if (loading) {
    return (
      <AppShell pageTitle="Corectare teme">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      pageTitle="Corectare teme"
      pageDescription="Teme trimise de elevi care așteaptă notare"
    >
      <div className="space-y-4 max-w-2xl">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nicio temă trimisă momentan</p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium flex-1">{item.body}</p>
                <span className="flex items-center gap-1 text-xs text-success shrink-0">
                  <CheckCircle className="h-3.5 w-3.5" />
                  Trimis
                </span>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Termen: {formatDeadline(item.deadline)}
              </p>
              <p className="text-xs text-muted-foreground">
                Student ID: <span className="font-mono">{item.studentId.slice(0, 8)}…</span>
              </p>
            </div>
          ))
        )}
      </div>
    </AppShell>
  );
}
