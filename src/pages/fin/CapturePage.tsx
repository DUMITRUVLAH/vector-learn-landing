/**
 * CAPTURE-003: /app/fin/captures/:id
 *
 * Pagina de confirmare a câmpurilor extrase de AI dintr-un bon/factură.
 * FIN-CORE regula #5: AI propune, omul confirmă — 1-click devine cheltuială.
 *
 * Statusuri:
 *   pending/processing → spinner cu polling 2s
 *   extracted          → formular de confirmare cu câmpuri editabile
 *   confirmed          → rezumat read-only cu link la cheltuiala creată
 *   failed             → mesaj eroare + buton reîncarcă
 *
 * A11y: WCAG AA, touch targets ≥44px, ZERO hex hardcodat.
 * Design: Vector 365 tokens only, light + dark mode.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  ArrowLeft,
  FileText,
  RotateCcw,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { CaptureFieldRow } from "@/components/fin/CaptureFieldRow";
import { useRouter } from "@/router/HashRouter";
import {
  getCapture,
  confirmCapture,
  reviewCapture,
  formatMDLCents,
  parseMDLToCents,
  CAPTURE_STATUS_LABELS,
  CATEGORY_LABELS,
  REPORTABLE_LABELS,
  type FinCapture,
  type FinCaptureStatus,
  type ExpenseCategory,
  type ExtractedFields,
} from "@/lib/api/finCaptures";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFieldConf(fields: ExtractedFields | null, key: keyof ExtractedFields): number | null {
  if (!fields) return null;
  return fields[key]?.confidence ?? null;
}

function getFieldValue<T>(fields: ExtractedFields | null, key: keyof ExtractedFields): T | null {
  if (!fields) return null;
  return (fields[key]?.value as T) ?? null;
}

function StatusBadge({ status }: { status: FinCaptureStatus }) {
  const styles: Record<FinCaptureStatus, string> = {
    pending: "bg-muted text-muted-foreground",
    processing: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    extracted: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    confirmed: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    failed: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", styles[status])}>
      {CAPTURE_STATUS_LABELS[status]}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface FormState {
  vendor_name: string;
  amount_str: string; // valoare editabilă ca string MDL
  amount_cents: number | null;
  vat_amount_str: string;
  vat_amount_cents: number | null;
  vat_deductible: boolean;
  expense_date: string;
  category: ExpenseCategory;
  reference: string;
  description: string;
}

function initForm(capture: FinCapture): FormState {
  const f = capture.extractedFields;
  const amountCents = getFieldValue<number>(f, "amount_cents");
  const vatCents = getFieldValue<number>(f, "vat_amount_cents");
  return {
    vendor_name: getFieldValue<string>(f, "vendor_name") ?? "",
    amount_str: amountCents != null ? (amountCents / 100).toFixed(2) : "",
    amount_cents: amountCents,
    vat_amount_str: vatCents != null ? (vatCents / 100).toFixed(2) : "0.00",
    vat_amount_cents: vatCents ?? 0,
    vat_deductible: getFieldValue<boolean>(f, "vat_deductible") ?? true,
    expense_date: getFieldValue<string>(f, "expense_date") ?? "",
    category: (getFieldValue<string>(f, "category") as ExpenseCategory) ?? "other",
    reference: getFieldValue<string>(f, "reference") ?? "",
    description: "",
  };
}

export default function CapturePage({ captureId }: { captureId: string }) {
  const { navigate } = useRouter();
  const [capture, setCapture] = useState<FinCapture | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const handleReview = useCallback(
    async (decision: "yes" | "no") => {
      if (!capture) return;
      setReviewing(true);
      try {
        const res = await reviewCapture(capture.id, decision);
        setCapture(res.capture);
        setToast(decision === "yes" ? "Marcat pentru raportare." : "Marcat ca neraportabil.");
      } catch {
        setSubmitError("Nu am putut salva decizia de raportare.");
      } finally {
        setReviewing(false);
      }
    },
    [capture],
  );
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track edited fields
  const originalFormRef = useRef<FormState | null>(null);

  const loadCapture = useCallback(async () => {
    try {
      const c = await getCapture(captureId);
      setCapture(c);
      if (c.status === "extracted" && !form) {
        const f = initForm(c);
        setForm(f);
        originalFormRef.current = f;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la încărcare");
    } finally {
      setLoading(false);
    }
  }, [captureId, form]);

  useEffect(() => {
    loadCapture();
  }, [loadCapture]);

  // Polling for processing status
  useEffect(() => {
    if (capture && (capture.status === "pending" || capture.status === "processing")) {
      pollingRef.current = setTimeout(() => {
        loadCapture();
      }, 2000);
    }
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, [capture, loadCapture]);

  // ─── Field helpers ──────────────────────────────────────────────────────────

  function isEdited(key: keyof FormState): boolean {
    if (!form || !originalFormRef.current) return false;
    return form[key] !== originalFormRef.current[key];
  }

  function updateAmount(val: string) {
    const cents = parseMDLToCents(val);
    setForm((prev) => prev && { ...prev, amount_str: val, amount_cents: cents });
  }

  function updateVat(val: string) {
    const cents = parseMDLToCents(val);
    setForm((prev) => prev && { ...prev, vat_amount_str: val, vat_amount_cents: cents });
  }

  // ─── Validation ─────────────────────────────────────────────────────────────

  const canSubmit =
    form != null &&
    form.amount_cents != null &&
    form.amount_cents > 0 &&
    form.expense_date.length === 10;

  // ─── Submit ─────────────────────────────────────────────────────────────────

  async function handleConfirm() {
    if (!form || !canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await confirmCapture(captureId, {
        fields: {
          vendor_name: form.vendor_name || undefined,
          amount_cents: form.amount_cents!,
          vat_amount_cents: form.vat_amount_cents ?? 0,
          vat_deductible: form.vat_deductible,
          expense_date: form.expense_date,
          category: form.category,
          reference: form.reference || undefined,
          description: form.description || undefined,
        },
      });
      setCapture(result.capture);
      setToast("Cheltuiala a fost creată");
      setTimeout(() => {
        navigate("/app/fin/expenses");
      }, 1500);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Eroare la confirmare");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <AppShell pageTitle="Invoice Reporting">
        <div className="flex min-h-[200px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Se încarcă" />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell pageTitle="Invoice Reporting — Eroare">
        <div className="mx-auto max-w-2xl p-6 text-center">
          <XCircle className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => navigate("/app/fin/captures")}
            className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Înapoi la capturi
          </button>
        </div>
      </AppShell>
    );
  }

  if (!capture) return null;

  return (
    <AppShell pageTitle="Invoice Reporting — Verificare">
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              onClick={() => navigate("/app/fin/captures")}
              className="mb-2 flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
              aria-label="Înapoi la lista de capturi"
            >
              <ArrowLeft className="h-4 w-4" />
              Capturi
            </button>
            <h1 className="text-lg font-semibold text-foreground">
              {capture.fileName}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <StatusBadge status={capture.status} />
              <span className="text-xs text-muted-foreground">
                {new Date(capture.createdAt).toLocaleDateString("ro-MD", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
          <FileText className="h-8 w-8 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>

        {/* Toast */}
        {toast && (
          <div className="flex items-center gap-2 rounded-lg bg-green-100 px-4 py-3 text-green-800 dark:bg-green-900/40 dark:text-green-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-sm font-medium">{toast}</span>
          </div>
        )}

        {/* Invoice Reporting: AI verdict + reviewer approve/reject */}
        {(capture.status === "extracted" || capture.status === "confirmed") && (
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Verdict raportare (AI)
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-sm font-semibold",
                      capture.reportable === "yes"
                        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                        : capture.reportable === "no"
                          ? "bg-muted text-muted-foreground"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
                    )}
                  >
                    {REPORTABLE_LABELS[capture.reportable]}
                  </span>
                  {capture.reportableConfidenceBp > 0 && (
                    <span className="text-xs text-muted-foreground">
                      încredere {Math.round(capture.reportableConfidenceBp / 100)}%
                    </span>
                  )}
                </div>
                {capture.reportableReason && (
                  <p className="mt-1.5 text-sm text-muted-foreground">{capture.reportableReason}</p>
                )}
                {capture.reviewedAt && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Confirmat manual ·{" "}
                    {new Date(capture.reviewedAt).toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleReview("yes")}
                  disabled={reviewing}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                  Pentru raportare
                </button>
                <button
                  onClick={() => handleReview("no")}
                  disabled={reviewing}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  <XCircle className="h-4 w-4" aria-hidden="true" />
                  Neraportabil
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Processing state */}
        {(capture.status === "pending" || capture.status === "processing") && (
          <div
            data-testid="processing-spinner"
            className="flex flex-col items-center gap-3 rounded-xl border border-border bg-card p-8 text-center"
          >
            <Loader2 className="h-10 w-10 animate-spin text-primary" aria-label="Se procesează" />
            <p className="text-sm font-medium text-foreground">
              AI procesează documentul...
            </p>
            <p className="text-xs text-muted-foreground">
              Extragerea câmpurilor durează 10–30 de secunde.
            </p>
          </div>
        )}

        {/* Failed state */}
        {capture.status === "failed" && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center">
            <XCircle className="mx-auto mb-3 h-10 w-10 text-destructive" />
            <p className="text-sm font-semibold text-foreground">Eroare la extracția AI</p>
            {capture.errorMessage && (
              <p className="mt-1 text-xs text-muted-foreground">{capture.errorMessage}</p>
            )}
            <button
              onClick={() => navigate("/app/fin/captures")}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm"
            >
              <RotateCcw className="h-4 w-4" />
              Reîncarcă documentul
            </button>
          </div>
        )}

        {/* Confirmed state */}
        {capture.status === "confirmed" && (
          <div className="rounded-xl border border-green-300 bg-green-50 p-6 dark:border-green-700 dark:bg-green-900/20">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 shrink-0 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Captură confirmată
                </p>
                {capture.expenseId && (
                  <button
                    onClick={() => navigate("/app/fin/expenses")}
                    className="mt-1 text-xs text-primary underline"
                  >
                    Vezi cheltuiala creată
                  </button>
                )}
                {!capture.expenseId && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Cheltuiala va fi disponibilă când modulul SPEND este activ.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Extracted state — main form */}
        {capture.status === "extracted" && form && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                Verificați câmpurile extrase de AI înainte de confirmare.
                Câmpurile cu border portocaliu au încredere scăzută.
              </p>
            </div>

            {/* Câmpuri */}
            <div className="space-y-2">
              {/* Furnizor */}
              <CaptureFieldRow
                label="Furnizor"
                confidence={getFieldConf(capture.extractedFields, "vendor_name")}
                edited={isEdited("vendor_name")}
              >
                <input
                  type="text"
                  value={form.vendor_name}
                  onChange={(e) =>
                    setForm((p) => p && { ...p, vendor_name: e.target.value })
                  }
                  placeholder="Denumire furnizor"
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Furnizor"
                />
              </CaptureFieldRow>

              {/* Sumă */}
              <CaptureFieldRow
                label="Sumă"
                confidence={getFieldConf(capture.extractedFields, "amount_cents")}
                required
                edited={isEdited("amount_str")}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.amount_str}
                    onChange={(e) => updateAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label="Sumă în MDL"
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">MDL</span>
                </div>
                {form.amount_cents == null && (
                  <p className="mt-1 text-xs text-destructive" role="alert">
                    Suma obligatorie
                  </p>
                )}
              </CaptureFieldRow>

              {/* TVA sumă */}
              <CaptureFieldRow
                label="TVA (sumă)"
                confidence={getFieldConf(capture.extractedFields, "vat_amount_cents")}
                edited={isEdited("vat_amount_str")}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={form.vat_amount_str}
                    onChange={(e) => updateVat(e.target.value)}
                    placeholder="0.00"
                    className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label="Sumă TVA în MDL"
                  />
                  <span className="shrink-0 text-xs text-muted-foreground">MDL</span>
                </div>
              </CaptureFieldRow>

              {/* TVA deductibil */}
              <CaptureFieldRow
                label="TVA deductibil"
                confidence={getFieldConf(capture.extractedFields, "vat_deductible")}
                edited={isEdited("vat_deductible")}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={form.vat_deductible}
                  onClick={() =>
                    setForm((p) => p && { ...p, vat_deductible: !p.vat_deductible })
                  }
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent",
                    "transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                    form.vat_deductible
                      ? "bg-primary"
                      : "bg-muted"
                  )}
                  aria-label="TVA deductibil"
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                      form.vat_deductible ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
                <span className="ml-2 text-sm text-foreground">
                  {form.vat_deductible ? "Da" : "Nu"}
                </span>
              </CaptureFieldRow>

              {/* Data cheltuielii */}
              <CaptureFieldRow
                label="Data documentului"
                confidence={getFieldConf(capture.extractedFields, "expense_date")}
                required
                edited={isEdited("expense_date")}
              >
                <input
                  type="date"
                  value={form.expense_date}
                  onChange={(e) =>
                    setForm((p) => p && { ...p, expense_date: e.target.value })
                  }
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Data documentului"
                />
              </CaptureFieldRow>

              {/* Categorie */}
              <CaptureFieldRow
                label="Categorie"
                confidence={getFieldConf(capture.extractedFields, "category")}
                edited={isEdited("category")}
              >
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm((p) => p && { ...p, category: e.target.value as ExpenseCategory })
                  }
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Categorie cheltuială"
                >
                  {(Object.keys(CATEGORY_LABELS) as ExpenseCategory[]).map((cat) => (
                    <option key={cat} value={cat}>
                      {CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
              </CaptureFieldRow>

              {/* Referință */}
              <CaptureFieldRow
                label="Referință"
                confidence={getFieldConf(capture.extractedFields, "reference")}
                edited={isEdited("reference")}
              >
                <input
                  type="text"
                  value={form.reference}
                  onChange={(e) =>
                    setForm((p) => p && { ...p, reference: e.target.value })
                  }
                  placeholder="Nr. factură sau referință bon"
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Referință"
                />
              </CaptureFieldRow>

              {/* Descriere */}
              <CaptureFieldRow
                label="Descriere"
                confidence={null}
                edited={isEdited("description")}
              >
                <textarea
                  value={form.description}
                  onChange={(e) =>
                    setForm((p) => p && { ...p, description: e.target.value })
                  }
                  placeholder="Descriere opțională"
                  rows={2}
                  className="w-full rounded border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Descriere"
                />
              </CaptureFieldRow>
            </div>

            {/* Eroare submit */}
            {submitError && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-4 py-3 text-destructive" role="alert">
                <XCircle className="h-4 w-4 shrink-0" />
                <span className="text-sm">{submitError}</span>
              </div>
            )}

            {/* Preview sumă */}
            {form.amount_cents != null && (
              <div className="rounded-lg border border-border bg-muted/40 px-4 py-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total</span>
                  <span className="font-semibold text-foreground">
                    {formatMDLCents(form.amount_cents)}
                  </span>
                </div>
                {form.vat_amount_cents != null && form.vat_amount_cents > 0 && (
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>din care TVA{form.vat_deductible ? " (deductibil)" : " (nedeductibil)"}</span>
                    <span>{formatMDLCents(form.vat_amount_cents)}</span>
                  </div>
                )}
              </div>
            )}

            {/* CTA */}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => navigate("/app/fin/captures")}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-muted"
              >
                Anulează
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canSubmit || submitting}
                aria-disabled={!canSubmit || submitting}
                className={cn(
                  "inline-flex min-h-[44px] items-center gap-2 rounded-lg px-5 py-2 text-sm font-medium",
                  "bg-primary text-primary-foreground hover:bg-primary/90",
                  "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-50"
                )}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Se confirmă...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    Confirmă cheltuiala
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
