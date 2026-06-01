/**
 * GAP-011: Public enrollment page
 * Accessible at #/enroll/:slug — NO admin auth required.
 * Shows cohort details + enrollment form. Redirects to Stripe on submit.
 */
import { useEffect, useState } from "react";
import {
  Calendar,
  Clock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Video,
  Users,
  ArrowRight,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import { getCohortBySlug, submitEnrollment, type EnrollCohort } from "@/lib/api/enroll";
import { cn } from "@/lib/utils";

interface EnrollPageProps {
  slug: string;
}

type FormState = "idle" | "submitting" | "success" | "waitlisted";

export function EnrollPage({ slug }: EnrollPageProps) {
  const [cohort, setCohort] = useState<EnrollCohort | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>("idle");
  const [formError, setFormError] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { cohort: c } = await getCohortBySlug(slug);
        if (!cancelled) setCohort(c);
      } catch {
        if (!cancelled) setError("Cursul nu a putut fi găsit. Verificați linkul.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!name.trim() || !email.trim()) {
      setFormError("Completați numele și emailul.");
      return;
    }

    setFormState("submitting");
    try {
      const result = await submitEnrollment(slug, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
      });

      if (result.waitlisted) {
        setFormState("waitlisted");
      } else if (result.checkoutUrl) {
        setCheckoutUrl(result.checkoutUrl);
        // In a real app: window.location.href = result.checkoutUrl;
        setFormState("success");
      } else {
        setFormState("success");
      }
    } catch {
      setFormError("A apărut o eroare. Încercați din nou.");
      setFormState("idle");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="size-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error || !cohort) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="size-12 text-destructive" />
        <h1 className="text-xl font-semibold text-foreground">Curs indisponibil</h1>
        <p className="text-muted-foreground text-center max-w-xs">
          {error ?? "Cursul nu există sau nu mai este disponibil pentru înscriere."}
        </p>
      </div>
    );
  }

  const isFullyBooked =
    cohort.seatsRemaining !== null && cohort.seatsRemaining === 0;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <Logo className="h-7" />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Course info card */}
        <section aria-label="Detalii curs" className="rounded-xl border border-border bg-card p-6">
          <h1 className="text-2xl font-bold text-foreground">
            {cohort.courseName ?? cohort.label}
          </h1>
          {cohort.courseDescription && (
            <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
              {cohort.courseDescription}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="size-4" />
              <span>
                Începe{" "}
                {new Intl.DateTimeFormat("ro-RO", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }).format(new Date(cohort.startDate))}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Clock className="size-4" />
              <span>{cohort.totalHours} ore</span>
            </div>
            {cohort.isOnline && (
              <div className="flex items-center gap-1.5 text-primary">
                <Video className="size-4" />
                <span>Online</span>
              </div>
            )}
            {cohort.seatsRemaining !== null && (
              <div
                className={cn(
                  "flex items-center gap-1.5",
                  cohort.seatsRemaining === 0
                    ? "text-destructive"
                    : cohort.seatsRemaining <= 3
                    ? "text-yellow-600 dark:text-yellow-400"
                    : "text-green-600 dark:text-green-400"
                )}
              >
                <Users className="size-4" />
                <span>
                  {cohort.seatsRemaining === 0
                    ? "Locuri epuizate"
                    : `${cohort.seatsRemaining} locuri disponibile`}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Enrollment form or result */}
        {formState === "success" ? (
          <section
            aria-label="Înregistrare reușită"
            className="rounded-xl border border-green-500/30 bg-green-500/5 p-6 text-center"
          >
            <CheckCircle2 className="size-12 text-green-600 dark:text-green-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground">Înregistrare reușită!</h2>
            <p className="text-muted-foreground text-sm mt-2">
              {checkoutUrl
                ? "Te redirecționăm către pagina de plată..."
                : "Cererea ta a fost înregistrată. Echipa noastră te va contacta în curând."}
            </p>
            {checkoutUrl && (
              <a
                href={checkoutUrl}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
              >
                Plătește acum
                <ArrowRight className="size-4" />
              </a>
            )}
          </section>
        ) : formState === "waitlisted" ? (
          <section
            aria-label="Adăugat pe lista de așteptare"
            className="rounded-xl border border-yellow-500/30 bg-yellow-500/5 p-6 text-center"
          >
            <Users className="size-12 text-yellow-600 dark:text-yellow-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-foreground">
              Ai fost adăugat pe lista de așteptare
            </h2>
            <p className="text-muted-foreground text-sm mt-2">
              Locurile s-au epuizat momentan. Te vom anunța când se eliberează un loc.
            </p>
          </section>
        ) : (
          <section aria-label="Formular de înscriere">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-semibold text-foreground">
                {isFullyBooked ? "Înscrie-te pe lista de așteptare" : "Înscrie-te acum"}
              </h2>
            </div>

            {isFullyBooked && (
              <div className="mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-400">
                Locurile sunt epuizate. Te putem adăuga pe lista de așteptare.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="enroll-name"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Nume complet <span className="text-destructive" aria-hidden>*</span>
                </label>
                <input
                  id="enroll-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  placeholder="ex. Maria Ionescu"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
                  aria-required="true"
                />
              </div>

              <div>
                <label
                  htmlFor="enroll-email"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Email <span className="text-destructive" aria-hidden>*</span>
                </label>
                <input
                  id="enroll-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder="ex. maria@email.ro"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
                  aria-required="true"
                />
              </div>

              <div>
                <label
                  htmlFor="enroll-phone"
                  className="block text-sm font-medium text-foreground mb-1.5"
                >
                  Telefon <span className="text-muted-foreground text-xs">(opțional)</span>
                </label>
                <input
                  id="enroll-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  autoComplete="tel"
                  placeholder="ex. 0740 123 456"
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[44px]"
                />
              </div>

              {formError && (
                <p role="alert" className="text-sm text-destructive">
                  {formError}
                </p>
              )}

              <button
                type="submit"
                disabled={formState === "submitting"}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
              >
                {formState === "submitting" ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Se procesează...
                  </>
                ) : isFullyBooked ? (
                  "Intră pe lista de așteptare"
                ) : (
                  <>
                    Înscrie-mă
                    <ArrowRight className="size-4" />
                  </>
                )}
              </button>

              <p className="text-xs text-muted-foreground text-center">
                Prin înscriere, confirmi că ai citit și acceptat termenii de utilizare.
              </p>
            </form>
          </section>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-12 border-t border-border py-6">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <p className="text-xs text-muted-foreground">
            Powered by Vector Learn · Platformă pentru centre educaționale
          </p>
        </div>
      </footer>
    </div>
  );
}
