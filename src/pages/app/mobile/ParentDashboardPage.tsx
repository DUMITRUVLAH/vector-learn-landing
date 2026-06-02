/**
 * MOB-104: Parent mobile dashboard
 * Route: /m/parent
 * Shows linked child's schedule, outstanding balance + invoice list, and chat link.
 * Mobile-first, dark-mode safe, semantic tokens only.
 */
import { useEffect, useState } from "react";
import {
  Calendar, CreditCard, Clock, MapPin, MessageCircle,
  Download, LogOut, Loader2, AlertCircle,
} from "lucide-react";
import { Link, useRouter } from "@/router/HashRouter";
import { useSession } from "@/hooks/useSession";
import { api } from "@/lib/api";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StudentInfo {
  id: string;
  fullName: string;
  email: string | null;
}

interface InvoiceSummary {
  id: string;
  amountCents: number;
  dueDate: string | null;
  status: "pending" | "overdue" | "paid";
  pdfUrl: string;
}

interface BalanceData {
  student: StudentInfo | null;
  outstandingTotal: number;
  invoices: InvoiceSummary[];
}

interface LessonRow {
  id: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingUrl: string | null;
  courseName: string;
  teacherName: string;
  roomName: string | null;
}

interface UpcomingData {
  lessons: LessonRow[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: "RON",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatLessonTime(iso: string): string {
  return new Date(iso).toLocaleString("ro-RO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ParentDashboardPage() {
  const { status: sessionStatus, data: sessionData, logout } = useSession();
  const { navigate } = useRouter();

  const [balance, setBalance] = useState<BalanceData | null>(null);
  const [upcoming, setUpcoming] = useState<LessonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Auth guard
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      navigate("/app/login");
    }
    // Admins / students go to their own dashboards
    if (sessionStatus === "authenticated" && sessionData?.user?.role === "student") {
      navigate("/m/dashboard");
    }
  }, [sessionStatus, sessionData, navigate]);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    Promise.all([
      api<BalanceData>("/api/m/parent/balance"),
      api<UpcomingData>("/api/m/parent/upcoming-lessons"),
    ])
      .then(([balData, upData]) => {
        setBalance(balData);
        setUpcoming(upData.lessons);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Eroare necunoscută");
        setLoading(false);
      });
  }, [sessionStatus]);

  const handleLogout = async () => {
    await logout();
    navigate("/app/login");
  };

  // ---------------------------------------------------------------------------
  // Render guards
  // ---------------------------------------------------------------------------

  if (sessionStatus === "loading" || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="Se încarcă..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background p-6">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-destructive text-sm text-center">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="text-sm text-primary underline"
        >
          Încearcă din nou
        </button>
      </div>
    );
  }

  // No linked student — empty state
  if (!balance?.student) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-foreground">
        <PageHeader onLogout={handleLogout} />
        <main className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground text-center">
            Niciun elev asociat acestui cont.
          </p>
          <p className="text-xs text-muted-foreground/60 text-center">
            Contactați secretariatul pentru asocierea contului.
          </p>
        </main>
      </div>
    );
  }

  const student = balance.student;
  const parentName = sessionData?.user?.name ?? "Părinte";

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <PageHeader onLogout={handleLogout} parentName={parentName} />

      <main className="flex-1 px-4 py-5 space-y-5 max-w-lg mx-auto w-full">
        {/* Child identity */}
        <div className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <span className="text-primary font-bold text-sm" aria-hidden="true">
              {student.fullName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Elev asociat</p>
            <p className="font-semibold text-sm">{student.fullName}</p>
          </div>
        </div>

        {/* Balance card */}
        <section aria-labelledby="balance-heading">
          <h2
            id="balance-heading"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3"
          >
            Balanță
          </h2>
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Total de plătit</p>
              <p
                className={`text-lg font-bold ${
                  balance.outstandingTotal > 0 ? "text-destructive" : "text-emerald-500"
                }`}
              >
                {formatCurrency(balance.outstandingTotal)}
              </p>
            </div>

            {balance.invoices.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nicio factură restantă.</p>
            ) : (
              <ul className="space-y-2 divide-y divide-border" role="list">
                {balance.invoices.map((inv) => (
                  <InvoiceRow key={inv.id} invoice={inv} />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Upcoming lessons */}
        <section aria-labelledby="upcoming-heading">
          <h2
            id="upcoming-heading"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3"
          >
            Lecții programate
          </h2>
          {upcoming.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-6 text-center">
              <Calendar className="h-8 w-8 text-muted-foreground mx-auto mb-2" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Nicio lecție în viitor</p>
            </div>
          ) : (
            <ul className="space-y-2" role="list">
              {upcoming.map((lesson) => (
                <li
                  key={lesson.id}
                  className="rounded-xl border border-border bg-card p-4 space-y-1"
                >
                  <p className="font-medium text-sm">{lesson.courseName}</p>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {formatLessonTime(lesson.scheduledAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                      {lesson.durationMinutes} min
                    </span>
                    {lesson.roomName && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                        {lesson.roomName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{lesson.teacherName}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Chat shortcut */}
        <section aria-labelledby="chat-heading">
          <h2
            id="chat-heading"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3"
          >
            Comunicare
          </h2>
          <Link
            to="/m/chat"
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-muted/50 transition-colors"
            aria-label="Deschide chat cu profesorii"
          >
            <MessageCircle className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium">Chat cu profesorul</p>
              <p className="text-xs text-muted-foreground">Mesaje directe, orare de liniște respectate</p>
            </div>
          </Link>
        </section>
      </main>

      <div aria-hidden="true" className="h-safe-area-bottom" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface PageHeaderProps {
  onLogout: () => void;
  parentName?: string;
}

function PageHeader({ onLogout, parentName }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center justify-between safe-area-top">
      <div>
        <p className="text-xs text-muted-foreground">Vector Learn</p>
        <h1 className="text-sm font-semibold leading-tight">
          {parentName ? `Bună, ${parentName.split(" ")[0]}!` : "Portal Părinți"}
        </h1>
      </div>
      <button
        onClick={onLogout}
        aria-label="Deconectare"
        className="h-9 w-9 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </button>
    </header>
  );
}

interface InvoiceRowProps {
  invoice: InvoiceSummary;
}

function InvoiceRow({ invoice }: InvoiceRowProps) {
  return (
    <li className="pt-2 flex items-center justify-between gap-2">
      <div>
        <p className="text-xs font-medium">
          {invoice.status === "overdue" ? (
            <span className="text-destructive">Restantă · </span>
          ) : null}
          {formatCurrency(invoice.amountCents)}
        </p>
        <p className="text-[11px] text-muted-foreground">
          Scadent: {formatDate(invoice.dueDate)}
        </p>
      </div>
      <a
        href={invoice.pdfUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Descarcă factura scadentă ${formatDate(invoice.dueDate)}`}
        className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        PDF
      </a>
    </li>
  );
}
