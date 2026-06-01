/**
 * GAP-010: Student/Parent self-service portal
 * Accessible at #/portal/:token — NO admin auth required.
 * Shows upcoming lessons, balance, recent payments.
 */
import { useEffect, useState } from "react";
import {
  Calendar,
  CreditCard,
  Loader2,
  AlertCircle,
  Phone,
  Mail,
  Clock,
  Video,
  MapPin,
  User,
  Bell,
  BellOff,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { getPortalData, type PortalData } from "@/lib/api/portal";
import { cn } from "@/lib/utils";

interface NotifPrefs {
  lessonReminder: boolean;
  debtAlert: boolean;
  packageLowAlert: boolean;
}

interface StudentPortalPageProps {
  token: string;
}

function formatDate(isoStr: string): string {
  const d = new Date(isoStr);
  return new Intl.DateTimeFormat("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatCurrency(cents: number, currency: string): string {
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: "bg-primary/10 text-primary",
    completed: "bg-green-500/10 text-green-600 dark:text-green-400",
    cancelled: "bg-destructive/10 text-destructive",
    rescheduled: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
    paid: "bg-green-500/10 text-green-600 dark:text-green-400",
    pending: "bg-muted text-muted-foreground",
    overdue: "bg-destructive/10 text-destructive",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        map[status] ?? "bg-muted text-muted-foreground"
      )}
    >
      {status}
    </span>
  );
}

export function StudentPortalPage({ token }: StudentPortalPageProps) {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>({
    lessonReminder: true,
    debtAlert: true,
    packageLowAlert: true,
  });
  const [prefsLoaded, setPrefsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getPortalData(token);
        if (!cancelled) setData(result);
        // Load notification prefs (non-blocking)
        try {
          const prefsRes = await fetch(`/api/portal/${token}/prefs`);
          if (prefsRes.ok && !cancelled) {
            const { prefs } = (await prefsRes.json()) as { prefs: NotifPrefs };
            setNotifPrefs({
              lessonReminder: prefs.lessonReminder,
              debtAlert: prefs.debtAlert,
              packageLowAlert: prefs.packageLowAlert,
            });
            setPrefsLoaded(true);
          }
        } catch {
          // prefs load failure is non-blocking
        }
      } catch {
        if (!cancelled) setError("Linkul de acces nu este valid sau a expirat.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="size-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="size-12 text-destructive" />
        <h1 className="text-xl font-semibold text-foreground">Link invalid</h1>
        <p className="text-muted-foreground text-center max-w-xs">
          {error ?? "A apărut o eroare. Contactați academia pentru un nou link."}
        </p>
      </div>
    );
  }

  const { student, upcomingLessons, recentPayments, activePackage } = data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Logo className="h-7" />
          <div className="ml-auto text-right">
            <p className="font-medium text-sm">{student.fullName}</p>
            <p className="text-xs text-muted-foreground capitalize">{student.status}</p>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Balance card */}
        <section
          aria-label="Sold"
          className={cn(
            "rounded-xl border p-5",
            student.debtCents > 0
              ? "border-destructive/30 bg-destructive/5"
              : "border-green-500/30 bg-green-500/5"
          )}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-base text-foreground">Sold datorat</h2>
              <p
                className={cn(
                  "text-3xl font-bold mt-1",
                  student.debtCents > 0 ? "text-destructive" : "text-green-600 dark:text-green-400"
                )}
              >
                {formatCurrency(student.debtCents, "RON")}
              </p>
              {student.debtCents === 0 && (
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  Toate plățile sunt la zi.
                </p>
              )}
            </div>
            <div className="flex-shrink-0">
              <CreditCard
                className={cn(
                  "size-10",
                  student.debtCents > 0
                    ? "text-destructive/60"
                    : "text-green-500/60 dark:text-green-400/60"
                )}
              />
            </div>
          </div>
          {student.debtCents > 0 && (
            <div className="mt-4 pt-4 border-t border-destructive/20 flex flex-wrap gap-3">
              {student.phone && (
                <a
                  href={`tel:${student.phone}`}
                  className="inline-flex items-center gap-2 touch-target rounded-lg px-4 py-2 bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors min-h-[44px]"
                  aria-label="Contactează academia"
                >
                  <Phone className="size-4" />
                  Contactează
                </a>
              )}
            </div>
          )}
        </section>

        {/* Active package */}
        {activePackage && (
          <section aria-label="Pachet ore" className="rounded-xl border border-border p-5">
            <h2 className="font-semibold text-base text-foreground mb-3">Pachet ore</h2>
            <div className="flex items-center gap-3">
              <Clock className="size-8 text-primary" />
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {activePackage.creditsRemaining}
                  <span className="text-base font-normal text-muted-foreground">
                    /{activePackage.totalCredits} ore rămase
                  </span>
                </p>
                {activePackage.creditsRemaining <= 2 && (
                  <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-0.5">
                    Orele se termină curând — reînoiți pachetul.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Contact info */}
        {(student.email || student.phone) && (
          <section aria-label="Date contact" className="rounded-xl border border-border p-5">
            <h2 className="font-semibold text-base text-foreground mb-3">Date de contact</h2>
            <div className="space-y-2">
              {student.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="size-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-foreground">{student.email}</span>
                </div>
              )}
              {student.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="size-4 text-muted-foreground flex-shrink-0" />
                  <a href={`tel:${student.phone}`} className="text-primary hover:underline">
                    {student.phone}
                  </a>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Upcoming lessons */}
        <section aria-label="Lecțiile tale">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="size-5 text-primary" />
            <h2 className="font-semibold text-base text-foreground">Lecțiile tale (7 zile)</h2>
          </div>
          {upcomingLessons.length === 0 ? (
            <div className="rounded-xl border border-border p-8 text-center">
              <Calendar className="size-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">
                Nu ai lecții programate în următoarele 7 zile.
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {upcomingLessons.map((lesson) => (
                <li
                  key={lesson.id}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">
                        {lesson.course ?? "Lecție"}
                      </p>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {formatDate(lesson.scheduledAt)}
                      </p>
                    </div>
                    <StatusBadge status={lesson.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {lesson.teacher && (
                      <span className="flex items-center gap-1">
                        <User className="size-3" />
                        {lesson.teacher}
                      </span>
                    )}
                    {lesson.room && (
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3" />
                        {lesson.room}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {lesson.durationMinutes} min
                    </span>
                  </div>
                  {lesson.meetingUrl && (
                    <a
                      href={lesson.meetingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-2 touch-target rounded-lg px-3 py-1.5 bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors min-h-[36px]"
                      aria-label="Intră în lecția online"
                    >
                      <Video className="size-3.5" />
                      Intră online
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent payments */}
        {recentPayments.length > 0 && (
          <section aria-label="Istoricul plăților">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard className="size-5 text-primary" />
              <h2 className="font-semibold text-base text-foreground">Ultimele plăți</h2>
            </div>
            <ul className="space-y-2">
              {recentPayments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">
                      {payment.description ?? "Plată"}
                    </p>
                    {payment.paidAt && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Intl.DateTimeFormat("ro-RO", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(payment.paidAt))}
                      </p>
                    )}
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      {formatCurrency(payment.amountCents, payment.currency)}
                    </p>
                    <StatusBadge status={payment.status} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
        {/* GAP-017: Notification preferences */}
        <section aria-label="Preferințe notificări">
          <div className="flex items-center gap-2 mb-3">
            <Bell className="size-5 text-primary" />
            <h2 className="font-semibold text-base text-foreground">Notificări</h2>
          </div>
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {[
              { key: "lessonReminder" as keyof NotifPrefs, label: "Reminder lecție (cu o zi înainte)", description: "Primești un SMS/email cu 24h înainte de fiecare lecție" },
              { key: "debtAlert" as keyof NotifPrefs, label: "Alertă sold datorat", description: "Primești o notificare când soldul depășește pragul setat" },
              { key: "packageLowAlert" as keyof NotifPrefs, label: "Pachet pe terminate", description: "Primești un alert când mai ai 2 sau mai puține ore" },
            ].map(({ key, label, description }) => (
              <div key={key} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={notifPrefs[key]}
                  aria-label={label}
                  disabled={!prefsLoaded}
                  onClick={async () => {
                    const newValue = !notifPrefs[key];
                    setNotifPrefs((prev) => ({ ...prev, [key]: newValue }));
                    try {
                      await fetch(`/api/portal/${token}/prefs`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ [key]: newValue }),
                      });
                    } catch {
                      // Revert on failure
                      setNotifPrefs((prev) => ({ ...prev, [key]: !newValue }));
                    }
                  }}
                  className={cn(
                    "relative flex-shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring touch-target",
                    notifPrefs[key] ? "bg-primary" : "bg-muted",
                    !prefsLoaded && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
                      notifPrefs[key] ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                  <span className="sr-only">{notifPrefs[key] ? "Activat" : "Dezactivat"}</span>
                </button>
              </div>
            ))}
          </div>
          {!prefsLoaded && (
            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
              <BellOff className="size-3" />
              Se încarcă preferințele...
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-border py-6">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <p className="text-xs text-muted-foreground">
            Portal securizat Vector Learn · Acces prin link personal
          </p>
        </div>
      </footer>
    </div>
  );
}
