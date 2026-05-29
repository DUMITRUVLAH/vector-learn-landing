import { useState, useEffect, useRef } from "react";
import { CheckCircle2, Loader2, AlertCircle, ChevronRight } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { submitIntake, type IntakeInput } from "@/lib/api/leads";
import { captureAndGetUtm, type UtmParams } from "@/lib/utm";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const CONSENT_TEXT =
  "Sunt de acord ca Vector Learn să prelucreze datele mele de contact în scopul prezentării produsului și programării unui demo. Nu voi primi reclame fără consimțământ separat. Pot retrage oricând acest consimțământ scriind la privacy@vectorlearn.io. (v1 · 2026-05-29)";

const COURSES = [
  "Limbi străine",
  "Programare / IT",
  "Muzică",
  "Pregătire examene",
  "Arte vizuale",
  "Dans / Sport",
  "Copii (0–12 ani)",
  "Altul",
];

type FormStatus = "idle" | "submitting" | "success" | "error";

interface FormState {
  fullName: string;
  phone: string;
  email: string;
  interestCourse: string;
  consent: boolean;
}

export function CereDemoPage() {
  const [utm, setUtm] = useState<UtmParams>({
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    fbclid: null,
    gclid: null,
  });
  const [form, setForm] = useState<FormState>({
    fullName: "",
    phone: "",
    email: "",
    interestCourse: "",
    consent: false,
  });
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setUtm(captureAndGetUtm());
  }, []);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type } = e.target;
    const checked = type === "checkbox" ? (e.target as HTMLInputElement).checked : undefined;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? (checked ?? false) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!form.consent) {
      setErrorMessage("Consimțământul GDPR este obligatoriu pentru a solicita demo-ul.");
      return;
    }

    setStatus("submitting");
    setErrorMessage(null);

    const input: IntakeInput = {
      tenantSlug: "demo",
      fullName: form.fullName,
      phone: form.phone || null,
      email: form.email || null,
      interestCourse: form.interestCourse || null,
      utmSource: utm.utmSource,
      utmMedium: utm.utmMedium,
      utmCampaign: utm.utmCampaign,
      fbclid: utm.fbclid,
      gclid: utm.gclid,
      consentText: CONSENT_TEXT,
      consentAt: new Date().toISOString(),
      captchaToken: "test-pass",
    };

    try {
      const result = await submitIntake(input);
      setIsDuplicate(result.isDuplicate);
      setStatus("success");
    } catch (err) {
      let msg = "A apărut o eroare. Încearcă din nou sau contactează-ne direct.";
      if (err instanceof ApiError) {
        if (err.status === 429) msg = "Prea multe cereri. Te rugăm să aștepți un minut.";
        else if (err.code === "captcha_failed") msg = "Verificare anti-spam eșuată. Reîncarcă pagina.";
        else if (err.code === "consent_expired") msg = "Sesiunea a expirat. Reîncarcă pagina și încearcă din nou.";
        else if (err.code === "tenant_not_found") msg = "Configurare invalidă. Contactați suportul.";
      }
      setErrorMessage(msg);
      setStatus("error");
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="mx-auto max-w-2xl px-4 py-16 sm:py-24">
        <div className="mb-10 text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary mb-4">
            Demo gratuit
          </span>
          <h1 className="text-3xl sm:text-4xl font-display font-bold tracking-tight">
            Cere un demo Vector Learn
          </h1>
          <p className="mt-3 text-muted-foreground text-base sm:text-lg max-w-md mx-auto">
            Completează formularul și te sunăm în maxim o zi lucrătoare.
            Fără obligații.
          </p>
        </div>

        {status === "success" ? (
          <SuccessCard isDuplicate={isDuplicate} />
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
            <form
              ref={formRef}
              onSubmit={handleSubmit}
              noValidate
              aria-label="Formular cerere demo"
            >
              <div className="space-y-5">
                <FormField id="df-name" label="Nume complet" required>
                  <input
                    id="df-name"
                    name="fullName"
                    type="text"
                    required
                    minLength={2}
                    maxLength={200}
                    value={form.fullName}
                    onChange={handleChange}
                    placeholder="ex: Andreea Mitran"
                    className="input-field"
                    autoComplete="name"
                    disabled={status === "submitting"}
                  />
                </FormField>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <FormField id="df-phone" label="Telefon">
                    <input
                      id="df-phone"
                      name="phone"
                      type="tel"
                      maxLength={32}
                      value={form.phone}
                      onChange={handleChange}
                      placeholder="+40 7XX XXX XXX"
                      className="input-field"
                      autoComplete="tel"
                      disabled={status === "submitting"}
                    />
                  </FormField>

                  <FormField id="df-email" label="Email">
                    <input
                      id="df-email"
                      name="email"
                      type="email"
                      maxLength={255}
                      value={form.email}
                      onChange={handleChange}
                      placeholder="ex: andreea@centru.ro"
                      className="input-field"
                      autoComplete="email"
                      disabled={status === "submitting"}
                    />
                  </FormField>
                </div>

                <FormField id="df-course" label="Tipul centrului sau cursul de interes">
                  <select
                    id="df-course"
                    name="interestCourse"
                    value={form.interestCourse}
                    onChange={handleChange}
                    className="input-field"
                    disabled={status === "submitting"}
                  >
                    <option value="">Selectează...</option>
                    {COURSES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </FormField>

                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      id="df-consent"
                      name="consent"
                      type="checkbox"
                      checked={form.consent}
                      onChange={handleChange}
                      className="mt-0.5 h-4 w-4 rounded border-border text-primary focus-visible:ring-ring disabled:opacity-50"
                      disabled={status === "submitting"}
                      aria-required="true"
                      aria-describedby="consent-text"
                    />
                    <span
                      id="consent-text"
                      className="text-xs text-muted-foreground leading-relaxed"
                    >
                      {CONSENT_TEXT}
                    </span>
                  </label>
                </div>

                {import.meta.env.DEV && (utm.utmSource || utm.fbclid || utm.gclid) && (
                  <div className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground font-mono">
                    UTM: {utm.utmSource}/{utm.utmMedium}/{utm.utmCampaign}
                    {utm.fbclid && ` · fb:${utm.fbclid.slice(0, 12)}…`}
                    {utm.gclid && ` · g:${utm.gclid.slice(0, 12)}…`}
                  </div>
                )}

                {errorMessage && (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>{errorMessage}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={status === "submitting" || !form.consent}
                  className={cn(
                    "inline-flex w-full items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-semibold transition-all",
                    "bg-primary text-primary-foreground hover:bg-primary/90",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:opacity-50 disabled:cursor-not-allowed"
                  )}
                >
                  {status === "submitting" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Se trimite...
                    </>
                  ) : (
                    <>
                      Solicită demo gratuit
                      <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </button>

                <p className="text-center text-[11px] text-muted-foreground">
                  Nu transmitem datele tale nimănui. Le folosim exclusiv pentru programarea demo-ului.
                </p>
              </div>
            </form>
          </div>
        )}
      </main>
      <Footer />

      <style>{`
        .input-field {
          display: block;
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid hsl(var(--input));
          background-color: hsl(var(--background));
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: hsl(var(--foreground));
          transition: box-shadow 0.15s;
        }
        .input-field:focus-visible {
          outline: none;
          box-shadow: 0 0 0 2px hsl(var(--ring));
        }
        .input-field:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
}

function SuccessCard({ isDuplicate }: { isDuplicate: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border border-success/30 bg-success/10 p-8 text-center"
    >
      <CheckCircle2 className="mx-auto h-12 w-12 text-success mb-4" aria-hidden="true" />
      <h2 className="text-xl font-bold font-display mb-2">
        {isDuplicate ? "Te avem deja!" : "Solicitare primită!"}
      </h2>
      <p className="text-muted-foreground text-sm max-w-sm mx-auto">
        {isDuplicate
          ? "Datele tale sunt deja în sistemul nostru. Un consultant îți va confirma programarea în curând."
          : "Mulțumim! Un consultant Vector Learn te va contacta în maxim o zi lucrătoare pentru a programa demo-ul."}
      </p>
    </div>
  );
}

function FormField({
  id,
  label,
  required,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold mb-1.5">
        {label}
        {required && (
          <span className="text-destructive ml-0.5" aria-hidden="true">
            {" "}*
          </span>
        )}
      </label>
      {children}
    </div>
  );
}
