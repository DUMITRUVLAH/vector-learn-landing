/**
 * FORMS-003/004 — /f/:slug (public, fără autentificare)
 *
 * Renderer conversațional one-question-at-a-time:
 *   - Bară de progres
 *   - Un câmp pe ecran, Enter avansează (sau Ctrl+Enter pentru long_text)
 *   - Buton Înapoi
 *   - Capturare UTM + câmpuri hidden din URL
 *   - FORMS-004: onorează regulile de logică condițională (jump_to_field / jump_to_end)
 *   - Submit → ecran thank-you / redirect
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { Loader2, ChevronLeft, ChevronRight, AlertCircle } from "lucide-react";
import { Logo } from "@/components/Logo";
import {
  getPublicForm,
  submitPublicForm,
  type PublicForm,
  type PublicFormField,
  type FormLogicRule,
} from "@/lib/api/forms";
import { getNextFieldIndex } from "@/lib/formLogic";
import { cn } from "@/lib/utils";

// ─── Tipuri ───────────────────────────────────────────────────────────────────

interface UtmParams {
  source?: string;
  medium?: string;
  campaign?: string;
  fbclid?: string;
  gclid?: string;
}

interface FormPublicPageProps {
  slug: string;
}

// ─── Helper: parsare UTM + URL params ─────────────────────────────────────────

function parseSearchParams(search: string): Record<string, string> {
  const params: Record<string, string> = {};
  const queryString = search.startsWith("?") ? search.slice(1) : search;
  if (!queryString) return params;
  for (const part of queryString.split("&")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx < 0) continue;
    const key = decodeURIComponent(part.slice(0, eqIdx).trim());
    const value = decodeURIComponent(part.slice(eqIdx + 1).trim());
    if (key) params[key] = value;
  }
  return params;
}

function extractUtm(params: Record<string, string>): UtmParams {
  return {
    source: params["utm_source"],
    medium: params["utm_medium"],
    campaign: params["utm_campaign"],
    fbclid: params["fbclid"],
    gclid: params["gclid"],
  };
}

// ─── Componenta principală ────────────────────────────────────────────────────

export function FormPublicPage({ slug }: FormPublicPageProps) {
  const [form, setForm] = useState<PublicForm | null>(null);
  const [fields, setFields] = useState<PublicFormField[]>([]);
  const [logicRules, setLogicRules] = useState<FormLogicRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Flow state
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // UTM + URL params captured at mount
  const [utm, setUtm] = useState<UtmParams>({});
  const [urlParams, setUrlParams] = useState<Record<string, string>>({});

  // Ref for auto-focus on input
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // ── Capture UTM at mount ──

  useEffect(() => {
    const search = window.location.search;
    const hash = window.location.hash;
    // URL is a hash router: /#/f/slug?utm_source=...
    // Params can be in window.location.search OR after the # fragment
    const hashQueryIdx = hash.indexOf("?");
    const queryStr = search || (hashQueryIdx >= 0 ? hash.slice(hashQueryIdx) : "");
    const parsed = parseSearchParams(queryStr);
    setUtm(extractUtm(parsed));
    setUrlParams(parsed);
  }, []);

  // ── Load form ──

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const { form: f } = await getPublicForm(slug);
        if (!cancelled) {
          setForm(f);
          // Sort by position, exclude hidden from visible flow
          const sorted = [...(f.fields ?? [])].sort((a, b) => a.position - b.position);
          setFields(sorted);
          // FORMS-004: store logic rules
          setLogicRules(f.logic ?? []);
          // Pre-populate hidden fields from URL params
          const initialAnswers: Record<string, unknown> = {};
          for (const field of sorted) {
            if (field.hidden && field.hiddenSourceParam) {
              const paramValue = urlParams[field.hiddenSourceParam];
              if (paramValue) initialAnswers[field.id] = paramValue;
            }
          }
          setAnswers(initialAnswers);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const status = (err as { status?: number }).status;
        if (status === 404) {
          setNotFound(true);
        } else {
          setLoadError("Nu s-a putut încărca formularul. Reîncarcă pagina.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [slug, urlParams]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-focus input when field changes ──

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentIdx]);

  // ── Derived: visible fields (non-hidden in flow) ──

  const visibleFields = fields.filter((f) => !f.hidden);
  const totalSteps = visibleFields.length;
  const currentField = visibleFields[currentIdx] ?? null;
  const isLastStep = currentIdx === totalSteps - 1;
  const progress = totalSteps > 0 ? ((currentIdx) / totalSteps) * 100 : 0;

  // ── Validate current field ──

  function validateCurrent(): boolean {
    if (!currentField) return true;
    const value = answers[currentField.id];
    if (currentField.required) {
      const isEmpty =
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0);
      if (isEmpty) {
        // Consent special message
        if (currentField.type === "consent") {
          setFieldError("Trebuie să acceptați consimțământul pentru a continua.");
        } else {
          setFieldError("Câmp obligatoriu.");
        }
        return false;
      }
    }
    // Email validation
    if (currentField.type === "email") {
      const emailVal = typeof value === "string" ? value.trim() : "";
      if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
        setFieldError("Adresă de email invalidă.");
        return false;
      }
    }
    setFieldError(null);
    return true;
  }

  // ── Advance ──

  const handleAdvance = useCallback(() => {
    if (!validateCurrent()) return;
    // FORMS-004: compute next index via logic rules
    const next = getNextFieldIndex(currentIdx, visibleFields, logicRules, answers);
    if (next === "end") {
      handleSubmit();
    } else {
      setCurrentIdx(next);
      setFieldError(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIdx, answers, visibleFields, logicRules, currentField]);

  // ── Back ──

  function handleBack() {
    if (currentIdx > 0) {
      setCurrentIdx((i) => i - 1);
      setFieldError(null);
    }
  }

  // ── Set answer ──

  function setAnswer(fieldId: string, value: unknown) {
    setAnswers((prev) => ({ ...prev, [fieldId]: value }));
    setFieldError(null);
  }

  // ── Submit ──

  async function handleSubmit() {
    if (!form || submitting) return;
    setSubmitting(true);
    setSubmitError(null);

    // Collect hidden field answers from URL params
    const hiddenAnswers: Record<string, string> = {};
    for (const field of fields) {
      if (field.hidden && field.hiddenSourceParam) {
        const val = urlParams[field.hiddenSourceParam];
        if (val) hiddenAnswers[field.id] = val;
      }
    }

    // Build UTM without undefined values
    const utmClean: UtmParams = {};
    if (utm.source) utmClean.source = utm.source;
    if (utm.medium) utmClean.medium = utm.medium;
    if (utm.campaign) utmClean.campaign = utm.campaign;
    if (utm.fbclid) utmClean.fbclid = utm.fbclid;
    if (utm.gclid) utmClean.gclid = utm.gclid;

    try {
      await submitPublicForm(slug, {
        answers,
        utm: Object.keys(utmClean).length > 0 ? utmClean : undefined,
        hidden: Object.keys(hiddenAnswers).length > 0 ? hiddenAnswers : undefined,
      });
      setSubmitted(true);
      if (form.redirectUrl) {
        setTimeout(() => {
          window.location.href = form.redirectUrl!;
        }, 1000);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "missing_required") {
        setSubmitError("Unele câmpuri obligatorii lipsesc.");
      } else {
        setSubmitError("Ceva nu a mers. Încearcă din nou.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Renders ───────────────────────────────────────────────────────────────

  // Loading
  if (loading) {
    return (
      <PageShell>
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  // 404 / draft / closed
  if (notFound || !form) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
            <AlertCircle className="w-7 h-7 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold mb-2">Formularul nu mai este disponibil</h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            Acest formular a fost închis sau nu există. Contactați organizatorul pentru mai multe informații.
          </p>
        </div>
      </PageShell>
    );
  }

  // Network error
  if (loadError) {
    return (
      <PageShell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <AlertCircle className="w-8 h-8 text-destructive mb-3" />
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 transition-colors"
          >
            Reîncarcă
          </button>
        </div>
      </PageShell>
    );
  }

  // Thank-you screen
  if (submitted) {
    return (
      <PageShell title={form.title}>
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-5">
            <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-3">
            {form.thankYouMessage ?? "Mulțumim! Am primit răspunsul tău."}
          </h2>
          {form.redirectUrl && (
            <p className="text-sm text-muted-foreground mt-2">
              Vei fi redirecționat în câteva secunde...
            </p>
          )}
          <button
            onClick={() => {
              setSubmitted(false);
              setAnswers({});
              setCurrentIdx(0);
              setFieldError(null);
              setSubmitError(null);
            }}
            className="mt-6 px-5 py-2.5 rounded-lg border border-border text-sm hover:bg-muted transition-colors min-h-[44px]"
          >
            Completează un alt răspuns
          </button>
        </div>
      </PageShell>
    );
  }

  // No visible fields
  if (totalSteps === 0) {
    return (
      <PageShell title={form.title}>
        <div className="py-12 text-center text-sm text-muted-foreground">
          Acest formular nu are câmpuri vizibile.
        </div>
      </PageShell>
    );
  }

  // ── Main conversational flow ──

  return (
    <PageShell title={form.title} description={form.description}>
      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-1.5 mb-8 overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
          style={{ width: `${progress}%` }}
          role="progressbar"
          aria-valuenow={currentIdx}
          aria-valuemin={0}
          aria-valuemax={totalSteps}
        />
      </div>

      {/* Step counter */}
      <p className="text-xs text-muted-foreground mb-6">
        {currentIdx + 1} din {totalSteps}
      </p>

      {/* Question */}
      {currentField && (
        <div className="mb-8 space-y-4">
          <FieldQuestion
            field={currentField}
            value={answers[currentField.id]}
            onChange={(v) => setAnswer(currentField.id, v)}
            onEnter={handleAdvance}
            inputRef={inputRef as React.RefObject<HTMLInputElement>}
            error={fieldError}
          />

          {/* Error */}
          {fieldError && (
            <div
              role="alert"
              aria-live="polite"
              className="flex items-center gap-2 text-destructive text-sm"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{fieldError}</span>
            </div>
          )}
        </div>
      )}

      {/* Submit error */}
      {submitError && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-center gap-2 text-destructive text-sm mb-4"
        >
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-3">
        {currentIdx > 0 && (
          <button
            onClick={handleBack}
            aria-label="Înapoi la întrebarea anterioară"
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-border text-sm hover:bg-muted transition-colors min-h-[44px]"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Înapoi</span>
          </button>
        )}
        <button
          onClick={handleAdvance}
          disabled={submitting}
          className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px]"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Se trimite...</span>
            </>
          ) : isLastStep ? (
            <span>Trimite</span>
          ) : (
            <>
              <span>Continuă</span>
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </PageShell>
  );
}

// ─── Page shell (fără AppShell — pagină publică) ──────────────────────────────

interface PageShellProps {
  children: React.ReactNode;
  title?: string;
  description?: string | null;
}

function PageShell({ children, title, description }: PageShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Header mic */}
      <header className="border-b border-border bg-card/80 backdrop-blur-sm px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-2">
          <Logo />
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-start justify-center px-4 py-10">
        <div className="w-full max-w-lg">
          {title && (
            <div className="mb-8">
              <h1 className="text-2xl font-bold">{title}</h1>
              {description && (
                <p className="text-sm text-muted-foreground mt-2">{description}</p>
              )}
            </div>
          )}
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4">
        <p className="text-center text-xs text-muted-foreground">
          Powered by{" "}
          <a href="/" className="hover:text-foreground transition-colors">
            Vector Learn
          </a>
        </p>
      </footer>
    </div>
  );
}

// ─── Componenta câmp individual ───────────────────────────────────────────────

interface FieldQuestionProps {
  field: PublicFormField;
  value: unknown;
  onChange: (v: unknown) => void;
  onEnter: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
  error: string | null;
}

// ─── RatingField sub-component (uses local state for hover) ──────────────────

interface RatingFieldProps {
  label: string;
  required: boolean;
  value: number;
  onChange: (v: unknown) => void;
  error: string | null;
}

function RatingField({ label, required, value, onChange }: RatingFieldProps) {
  const [hover, setHover] = useState<number>(0);
  return (
    <div>
      <label className="block text-lg font-semibold mb-4">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </label>
      <div className="flex gap-2" role="group" aria-label="Evaluare stele">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            aria-label={`${n} stele`}
            className={cn(
              "text-3xl transition-all hover:scale-110",
              n <= (hover || value) ? "text-yellow-400" : "text-muted-foreground/30"
            )}
          >
            ★
          </button>
        ))}
      </div>
      {value > 0 && (
        <p className="text-sm text-muted-foreground mt-2">{value} din 5 stele</p>
      )}
    </div>
  );
}

function FieldQuestion({ field, value, onChange, onEnter, inputRef, error }: FieldQuestionProps) {
  const strVal = typeof value === "string" ? value : "";

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (field.type === "long_text") {
      // Ctrl+Enter advances for long_text
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onEnter();
      }
    } else {
      if (e.key === "Enter") {
        e.preventDefault();
        onEnter();
      }
    }
  }

  const fieldInputId = `field-input-${field.id}`;
  const labelElement = (
    <label htmlFor={fieldInputId} className="block text-lg font-semibold mb-4">
      {field.label}
      {field.required && <span className="text-destructive ml-1">*</span>}
    </label>
  );

  const inputCls = cn(
    "w-full rounded-xl border bg-background px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary transition-colors",
    error ? "border-destructive" : "border-border"
  );

  switch (field.type) {
    case "short_text":
      return (
        <div>
          {labelElement}
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            id={fieldInputId}
            type="text"
            className={inputCls}
            placeholder={field.placeholder ?? ""}
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={1000}
            autoComplete="off"
          />
          {field.type === "short_text" && (
            <p className="text-xs text-muted-foreground mt-2">Apasă Enter pentru a continua</p>
          )}
        </div>
      );

    case "email":
      return (
        <div>
          {labelElement}
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            id={fieldInputId}
            type="email"
            className={inputCls}
            placeholder={field.placeholder ?? "adresa@exemplu.com"}
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="email"
            inputMode="email"
          />
          <p className="text-xs text-muted-foreground mt-2">Apasă Enter pentru a continua</p>
        </div>
      );

    case "phone":
      return (
        <div>
          {labelElement}
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            id={fieldInputId}
            type="tel"
            className={inputCls}
            placeholder={field.placeholder ?? "+373 xxx xxx xxx"}
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="tel"
            inputMode="tel"
          />
          <p className="text-xs text-muted-foreground mt-2">Apasă Enter pentru a continua</p>
        </div>
      );

    case "number":
      return (
        <div>
          {labelElement}
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="number"
            className={inputCls}
            placeholder={field.placeholder ?? ""}
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            inputMode="numeric"
          />
          <p className="text-xs text-muted-foreground mt-2">Apasă Enter pentru a continua</p>
        </div>
      );

    case "long_text":
      return (
        <div>
          {labelElement}
          <textarea
            ref={inputRef as unknown as React.RefObject<HTMLTextAreaElement>}
            className={cn(inputCls, "resize-none")}
            placeholder={field.placeholder ?? ""}
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown as React.KeyboardEventHandler<HTMLTextAreaElement>}
            rows={4}
          />
          <p className="text-xs text-muted-foreground mt-2">Ctrl+Enter pentru a continua</p>
        </div>
      );

    case "single_choice":
      return (
        <div>
          {labelElement}
          <div className="space-y-2">
            {(field.options ?? []).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  // Single choice auto-advances after slight delay
                  setTimeout(onEnter, 200);
                }}
                className={cn(
                  "w-full text-left px-4 py-3 rounded-xl border text-sm transition-all min-h-[44px]",
                  strVal === opt
                    ? "border-primary bg-primary/5 text-foreground font-medium"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      );

    case "multiple_choice": {
      const selectedArr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div>
          {labelElement}
          <div className="space-y-2">
            {(field.options ?? []).map((opt) => {
              const isChecked = selectedArr.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    const next = isChecked
                      ? selectedArr.filter((v) => v !== opt)
                      : [...selectedArr, opt];
                    onChange(next);
                  }}
                  className={cn(
                    "w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border text-sm transition-all min-h-[44px]",
                    isChecked
                      ? "border-primary bg-primary/5 font-medium"
                      : "border-border hover:border-primary/50 hover:bg-muted/50"
                  )}
                >
                  <span className={cn(
                    "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                    isChecked ? "bg-primary border-primary" : "border-border"
                  )}>
                    {isChecked && (
                      <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    case "dropdown":
      return (
        <div>
          {labelElement}
          <select
            className={cn(inputCls, "cursor-pointer appearance-none")}
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">{field.placeholder ?? "Selectează o opțiune..."}</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        </div>
      );

    case "rating": {
      const ratingVal = typeof value === "number" ? value : 0;
      return (
        <RatingField
          label={field.label}
          required={field.required}
          value={ratingVal}
          onChange={onChange}
          error={error}
        />
      );
    }

    case "yes_no":
      return (
        <div>
          {labelElement}
          <div className="flex gap-3">
            {["Da", "Nu"].map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => {
                  onChange(opt);
                  setTimeout(onEnter, 200);
                }}
                className={cn(
                  "flex-1 px-6 py-3 rounded-xl border text-sm font-medium transition-all min-h-[44px]",
                  strVal === opt
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      );

    case "date":
      return (
        <div>
          {labelElement}
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="date"
            className={inputCls}
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );

    case "consent":
      return (
        <div>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
              className="mt-1 w-5 h-5 rounded border-border cursor-pointer shrink-0"
            />
            <span className={cn("text-base", error && "text-destructive")}>
              {field.label}
              {field.required && <span className="text-destructive ml-1">*</span>}
            </span>
          </label>
        </div>
      );

    default:
      return (
        <div>
          {labelElement}
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="text"
            className={inputCls}
            placeholder={field.placeholder ?? ""}
            value={strVal}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      );
  }
}
