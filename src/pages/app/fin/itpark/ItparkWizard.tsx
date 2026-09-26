/**
 * ITPARK-102: Wizard creare dosar (3 pași) + autocomplete date rezident din IDNO
 * Route: /app/fin/itpark/new
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §1
 *
 * Pasul 1: Rezident (denumire, IDNO, adresă, contract MITP)
 * Pasul 2: Perioadă + an + regim TVA + cost subcontractori
 * Pasul 3: Firma de audit + confirmare
 *
 * Autocomplete IDNO: GET /api/registry/companies/:idno → pre-completează denumire + adresă.
 * Fallback graceful dacă lookup eșuează (timeout/offline/404) — câmpurile rămân editabile manual.
 */
import { AppShell } from "@/components/app/AppShell";
import { useState, useRef, useCallback, useEffect } from "react";
import { createEngagement, getEngagement, updateEngagement, type ItparkEngagement } from "../../../../lib/api/itparkEngagements";
import { useRouter } from "@/router/HashRouter";
import { itparkIdFromPath, itparkListPath, itparkPath } from "@/lib/itpark/paths";

import { DateField } from "@/components/ds";
// ─── Types ────────────────────────────────────────────────────────────────────

interface WizardData {
  // Pasul 1 — rezident
  residentName: string;
  idno: string;
  legalAddress: string;
  subdivisionAddresses: string;
  mitpContractNo: string;
  mitpContractDate: string;
  // Pasul 2 — perioadă
  periodStart: string;
  periodEnd: string;
  reportingYear: string;
  vatPayer: boolean;
  subcontractorCostsCents: string;
  // Pasul 3 — audit
  auditFirmName: string;
}

const DEFAULT_DATA: WizardData = {
  residentName: "",
  idno: "",
  legalAddress: "",
  subdivisionAddresses: "",
  mitpContractNo: "",
  mitpContractDate: "",
  periodStart: "",
  periodEnd: "",
  reportingYear: new Date().getFullYear().toString(),
  vatPayer: false,
  subcontractorCostsCents: "0",
  auditFirmName: "",
};

// ─── IDNO lookup ──────────────────────────────────────────────────────────────

interface RegistryResult {
  name: string;
  address: string | null;
}

async function lookupIdno(idno: string): Promise<RegistryResult | null> {
  if (!idno || !/^\d{7,13}$/.test(idno)) return null;
  try {
    const res = await fetch(`/api/registry/companies/${encodeURIComponent(idno)}`, {
      credentials: "include",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const { data } = await res.json();
    if (!data?.name) return null;
    const fullAddress = [data.address, data.city].filter(Boolean).join(", ");
    return { name: data.name, address: fullAddress || null };
  } catch {
    // Timeout, offline, 404 — fallback graceful
    return null;
  }
}

// ─── Input + Label helpers ────────────────────────────────────────────────────

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  children: React.ReactNode;
  error?: string;
  hint?: string;
}

function Field({ id, label, required, children, error, hint }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span aria-hidden="true" className="ml-0.5 text-destructive">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

const inputClass =
  "block w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed min-h-[44px]";

// ─── Step 1 — Rezident ────────────────────────────────────────────────────────

interface Step1Props {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
  errors: Partial<Record<keyof WizardData, string>>;
}

function Step1({ data, onChange, errors }: Step1Props) {
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupResult, setLookupResult] = useState<string | null>(null);
  const idnoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleIdnoChange = useCallback(
    (val: string) => {
      onChange({ idno: val });
      if (idnoTimerRef.current) clearTimeout(idnoTimerRef.current);
      if (!/^\d{7,13}$/.test(val)) {
        setLookupResult(null);
        return;
      }
      idnoTimerRef.current = setTimeout(async () => {
        setLookingUp(true);
        setLookupResult(null);
        const result = await lookupIdno(val);
        setLookingUp(false);
        if (result) {
          setLookupResult(`Găsit: ${result.name}`);
          onChange({
            residentName: result.name,
            legalAddress: result.address ?? data.legalAddress,
          });
        } else {
          setLookupResult(null);
        }
      }, 600);
    },
    [onChange, data.legalAddress]
  );

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Pasul 1 — Date rezident</h2>

      {/* IDNO — triggerul autocomplete */}
      <Field id="idno" label="IDNO (cod fiscal)" required error={errors.idno}
        hint="13 cifre — datele firmei se vor completa automat dacă IDNO e găsit în registru">
        <div className="relative">
          <input
            id="idno"
            type="text"
            value={data.idno}
            onChange={(e) => handleIdnoChange(e.target.value)}
            placeholder="ex. 1234567890123"
            maxLength={13}
            aria-required="true"
            aria-describedby={errors.idno ? "idno-error" : "idno-hint"}
            className={`${inputClass} pr-10`}
          />
          {lookingUp && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-label="Se caută IDNO...">
              <svg className="animate-spin h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </span>
          )}
        </div>
        {lookupResult && (
          <p className="text-xs text-green-700 dark:text-green-400 mt-1" role="status">{lookupResult}</p>
        )}
      </Field>

      <Field id="residentName" label="Denumire firmă rezidentă" required error={errors.residentName}>
        <input
          id="residentName"
          type="text"
          value={data.residentName}
          onChange={(e) => onChange({ residentName: e.target.value })}
          placeholder="ex. Vector Academy SRL"
          aria-required="true"
          aria-describedby={errors.residentName ? "residentName-error" : undefined}
          className={inputClass}
        />
      </Field>

      <Field id="legalAddress" label="Adresă juridică">
        <input
          id="legalAddress"
          type="text"
          value={data.legalAddress}
          onChange={(e) => onChange({ legalAddress: e.target.value })}
          placeholder="ex. mun. Chișinău, str. Alba Iulia 75"
          className={inputClass}
        />
      </Field>

      <Field id="subdivisionAddresses" label="Adrese subdiviziuni"
        hint="Completați doar dacă firma are filiale/subdiviziuni declarate (Anexa 2 rând 4)">
        <textarea
          id="subdivisionAddresses"
          value={data.subdivisionAddresses}
          onChange={(e) => onChange({ subdivisionAddresses: e.target.value })}
          rows={2}
          placeholder="Optional — lăsați gol dacă nu există subdiviziuni"
          className="block w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field id="mitpContractNo" label="Nr. contract MITP">
          <input
            id="mitpContractNo"
            type="text"
            value={data.mitpContractNo}
            onChange={(e) => onChange({ mitpContractNo: e.target.value })}
            placeholder="ex. 2368"
            className={inputClass}
          />
        </Field>
        <Field id="mitpContractDate" label="Data contractului MITP">
          <DateField
            id="mitpContractDate"
            value={data.mitpContractDate}
            onChange={(e) => onChange({ mitpContractDate: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

// ─── Step 2 — Perioadă + regim ────────────────────────────────────────────────

interface Step2Props {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
  errors: Partial<Record<keyof WizardData, string>>;
}

function Step2({ data, onChange, errors }: Step2Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Pasul 2 — Perioadă + regim</h2>

      <div className="grid grid-cols-2 gap-4">
        <Field id="periodStart" label="Perioadă — start" required error={errors.periodStart}>
          <DateField
            id="periodStart"
            value={data.periodStart}
            onChange={(e) => {
              const val = e.target.value;
              const year = val ? new Date(val).getFullYear().toString() : data.reportingYear;
              onChange({ periodStart: val, reportingYear: year });
            }}
            aria-required="true"
            aria-describedby={errors.periodStart ? "periodStart-error" : undefined}
          />
        </Field>
        <Field id="periodEnd" label="Perioadă — end" required error={errors.periodEnd}>
          <DateField
            id="periodEnd"
            value={data.periodEnd}
            onChange={(e) => {
              const val = e.target.value;
              const year = val ? new Date(val).getFullYear().toString() : data.reportingYear;
              onChange({ periodEnd: val, reportingYear: year });
            }}
            aria-required="true"
            aria-describedby={errors.periodEnd ? "periodEnd-error" : undefined}
          />
        </Field>
      </div>

      <Field id="reportingYear" label="An de raportare" required error={errors.reportingYear}>
        <input
          id="reportingYear"
          type="number"
          min={2000}
          max={2100}
          value={data.reportingYear}
          onChange={(e) => onChange({ reportingYear: e.target.value })}
          aria-required="true"
          className={inputClass}
        />
      </Field>

      <div className="flex items-center gap-3 py-2">
        <input
          id="vatPayer"
          type="checkbox"
          checked={data.vatPayer}
          onChange={(e) => onChange({ vatPayer: e.target.checked })}
          className="h-5 w-5 rounded border-input text-primary focus:ring-primary focus:ring-2"
          aria-label="Plătitor TVA"
        />
        <label htmlFor="vatPayer" className="text-sm font-medium text-foreground cursor-pointer select-none">
          Firma e plătitoare de TVA (Anexa 2 rând 3)
        </label>
      </div>

      <Field id="subcontractorCostsCents" label="Cost subcontractori străini (MDL)"
        hint="Valoarea brută în MDL — se va converti în cents intern. Completați cu 0 dacă nu există.">
        <div className="relative">
          <input
            id="subcontractorCostsCents"
            type="number"
            min={0}
            step={1}
            value={data.subcontractorCostsCents}
            onChange={(e) => onChange({ subcontractorCostsCents: e.target.value })}
            className={`${inputClass} pr-12`}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">MDL</span>
        </div>
      </Field>
    </div>
  );
}

// ─── Step 3 — Firma de audit + confirmare ─────────────────────────────────────

interface Step3Props {
  data: WizardData;
  onChange: (patch: Partial<WizardData>) => void;
}

function Step3({ data, onChange }: Step3Props) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">Pasul 3 — Firma de audit</h2>

      <Field id="auditFirmName" label="Denumire firmă de audit"
        hint="Optional — poate fi completat ulterior din detaliu dosar">
        <input
          id="auditFirmName"
          type="text"
          value={data.auditFirmName}
          onChange={(e) => onChange({ auditFirmName: e.target.value })}
          placeholder="ex. KPMG Moldova SRL"
          className={inputClass}
        />
      </Field>

      {/* Sumar confirmare */}
      <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-2 text-sm">
        <h3 className="font-semibold text-foreground mb-3">Sumar dosar</h3>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Rezident</span>
          <span className="font-medium text-foreground text-right">{data.residentName || "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">IDNO</span>
          <span className="font-mono text-foreground">{data.idno || "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">An raportare</span>
          <span className="text-foreground">{data.reportingYear || "—"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Perioadă</span>
          <span className="text-foreground">{data.periodStart || "?"} – {data.periodEnd || "?"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">TVA</span>
          <span className="text-foreground">{data.vatPayer ? "Plătitor TVA" : "Neplătitor TVA"}</span>
        </div>
        {data.auditFirmName && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Firma de audit</span>
            <span className="text-foreground">{data.auditFirmName}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Wizard shell ─────────────────────────────────────────────────────────────

type StepNum = 1 | 2 | 3;

const STEP_LABELS: Record<StepNum, string> = {
  1: "Rezident",
  2: "Perioadă",
  3: "Confirmare",
};

function validate(step: StepNum, data: WizardData): Partial<Record<keyof WizardData, string>> {
  const errors: Partial<Record<keyof WizardData, string>> = {};

  if (step >= 1) {
    if (!data.idno) errors.idno = "IDNO este obligatoriu";
    else if (!/^\d{7,13}$/.test(data.idno)) errors.idno = "IDNO trebuie să conțină 7–13 cifre";
    if (!data.residentName.trim()) errors.residentName = "Denumirea firmei este obligatorie";
  }

  if (step >= 2) {
    if (!data.periodStart) errors.periodStart = "Data de start este obligatorie";
    if (!data.periodEnd) errors.periodEnd = "Data de end este obligatorie";
    if (data.periodStart && data.periodEnd && data.periodStart > data.periodEnd)
      errors.periodStart = "Data de start trebuie să fie ≤ data de end";
    const year = parseInt(data.reportingYear, 10);
    if (!data.reportingYear || isNaN(year) || year < 2000 || year > 2100)
      errors.reportingYear = "Anul trebuie să fie între 2000 și 2100";
    if (data.periodEnd) {
      const endYear = new Date(data.periodEnd).getFullYear();
      if (year !== endYear) errors.reportingYear = `Anul trebuie să coincidă cu ${endYear} (din data de end)`;
    }
  }

  return errors;
}

/** Dosarul existent → câmpurile formularului (sumele în lei, ca la creare). */
function toWizardData(eng: ItparkEngagement): WizardData {
  return {
    residentName: eng.residentName,
    idno: eng.idno,
    legalAddress: eng.legalAddress ?? "",
    subdivisionAddresses: eng.subdivisionAddresses ?? "",
    mitpContractNo: eng.mitpContractNo ?? "",
    mitpContractDate: eng.mitpContractDate ?? "",
    periodStart: eng.periodStart,
    periodEnd: eng.periodEnd,
    reportingYear: String(eng.reportingYear),
    vatPayer: eng.vatPayer,
    subcontractorCostsCents: String((eng.subcontractorCostsCents ?? 0) / 100),
    auditFirmName: eng.auditFirmName ?? "",
  };
}

export interface ItparkWizardProps {
  /**
   * NAV-11: „edit" încarcă dosarul din rută și îl salvează cu PUT. Fișa avea un buton „Editează"
   * spre o rută care nu exista; API-ul de actualizare exista, formularul nu.
   */
  mode?: "create" | "edit";
}

export default function ItparkWizard({ mode = "create" }: ItparkWizardProps) {
  const { path } = useRouter();
  const editId = mode === "edit" ? itparkIdFromPath(path) : "";
  const [original, setOriginal] = useState<ItparkEngagement | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<StepNum>(1);
  const [data, setData] = useState<WizardData>(DEFAULT_DATA);

  useEffect(() => {
    if (mode !== "edit") return;
    if (!editId) {
      setLoadError("Dosarul nu există sau linkul e greșit.");
      return;
    }
    getEngagement(editId)
      .then((eng) => {
        setOriginal(eng);
        setData(toWizardData(eng));
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Dosarul nu a putut fi încărcat."));
  }, [mode, editId]);
  const [errors, setErrors] = useState<Partial<Record<keyof WizardData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleChange = useCallback((patch: Partial<WizardData>) => {
    setData((prev) => ({ ...prev, ...patch }));
    // Clear errors for changed fields
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch) as (keyof WizardData)[]) delete next[key];
      return next;
    });
  }, []);

  function handleNext() {
    const errs = validate(step, data);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setStep((s) => Math.min(3, s + 1) as StepNum);
  }

  function handleBack() {
    setStep((s) => Math.max(1, s - 1) as StepNum);
  }

  async function handleSubmit() {
    const errs = validate(3, data);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    const fields = {
      residentName: data.residentName.trim(),
      idno: data.idno.trim(),
      mitpContractNo: data.mitpContractNo || null,
      mitpContractDate: data.mitpContractDate || null,
      legalAddress: data.legalAddress || null,
      subdivisionAddresses: data.subdivisionAddresses || null,
      vatPayer: data.vatPayer,
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      reportingYear: parseInt(data.reportingYear, 10),
      auditFirmName: data.auditFirmName || null,
      subcontractorCostsCents: Math.round(parseFloat(data.subcontractorCostsCents || "0") * 100),
    };
    if (mode === "edit" && original) {
      try {
        // PUT validează corpul întreg cu valori implicite: câmpurile pe care formularul nu le arată
        // (starea, venitul ajustat, vânzările calculate din anexe) se retrimit neschimbate — altfel o
        // corectură de adresă ar fi readus dosarul la „Ciornă" și ar fi șters calculul.
        await updateEngagement(original.id, {
          ...fields,
          status: original.status,
          subcontractorCostsPct: original.subcontractorCostsPct,
          totalSalesCents: original.totalSalesCents,
          adjustedRevenueCents: original.adjustedRevenueCents,
          employeeInfoProcedure: original.employeeInfoProcedure,
        });
        window.location.hash = `#${itparkPath(original.id)}`;
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : "Eroare la salvare");
        setSubmitting(false);
      }
      return;
    }
    try {
      const eng = await createEngagement({ ...fields, status: "draft", adjustedRevenueCents: 0 });
      // Redirect la detaliu
      window.location.hash = `#${itparkPath(eng.id)}`;
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Eroare la salvare");
      setSubmitting(false);
    }
  }

  const stepNums: StepNum[] = [1, 2, 3];

  const isEdit = mode === "edit";
  if (isEdit && (loadError || !original)) {
    return (
      <AppShell pageTitle="Editează dosarul">
        {loadError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive" role="alert">
            <p className="text-sm">{loadError}</p>
            <a href={`#${itparkListPath()}`} className="mt-2 inline-block text-sm underline">Înapoi la dosare</a>
          </div>
        ) : (
          <div className="flex min-h-64 items-center justify-center" aria-busy="true" aria-label="Se încarcă dosarul">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-primary" role="status" />
          </div>
        )}
      </AppShell>
    );
  }

  return (
    <AppShell
      pageTitle={isEdit ? `Editează: ${original?.residentName ?? "dosar"}` : "Dosar IT Park nou"}
      pageDescription="Rezidentul, perioada și contractul MITP — apoi liniile de venit."
    >
    {/* NAV-08: pagina n-avea shell; titlul stă în antet, nu într-un <h1> propriu. */}
    <div className="max-w-xl space-y-6">
      {/* Header */}
      <div>
        <nav aria-label="Navigare" className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <a href="#/business/fin/itpark" className="hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary rounded">
            Rezidenți IT Park
          </a>
          <svg aria-hidden="true" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <span className="text-foreground font-medium">{isEdit ? "Editare" : "Dosar nou"}</span>
        </nav>
      </div>

      {/* Step progress */}
      <nav aria-label="Pași wizard" className="flex items-center gap-0">
        {stepNums.map((n, i) => (
          <div key={n} className="flex items-center flex-1">
            <div className="flex items-center gap-2">
              <div
                className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${
                  n < step
                    ? "bg-primary text-primary-foreground"
                    : n === step
                    ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                    : "bg-muted text-muted-foreground"
                }`}
                aria-current={n === step ? "step" : undefined}
              >
                {n < step ? (
                  <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  n
                )}
              </div>
              <span
                className={`text-sm hidden sm:block ${
                  n === step ? "font-medium text-foreground" : "text-muted-foreground"
                }`}
              >
                {STEP_LABELS[n]}
              </span>
            </div>
            {i < stepNums.length - 1 && (
              <div className={`flex-1 h-0.5 mx-3 ${n < step ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        ))}
      </nav>

      {/* Step content */}
      <div className="rounded-xl border border-border bg-card shadow-sm p-6">
        {step === 1 && <Step1 data={data} onChange={handleChange} errors={errors} />}
        {step === 2 && <Step2 data={data} onChange={handleChange} errors={errors} />}
        {step === 3 && <Step3 data={data} onChange={handleChange} />}

        {submitError && (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive" role="alert">
            {submitError}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={handleBack}
          disabled={step === 1}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm hover:bg-muted transition-colors min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Înapoi
        </button>

        <div className="text-sm text-muted-foreground">
          {step} / 3
        </div>

        {step < 3 ? (
          <button
            onClick={handleNext}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors min-h-[44px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Continuă
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors min-h-[44px] disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            {submitting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Se salvează...
              </>
            ) : (
              <>
                {isEdit ? "Salvează modificările" : "Creează dosarul"}
                <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </>
            )}
          </button>
        )}
      </div>
    </div>
    </AppShell>
  );
}
