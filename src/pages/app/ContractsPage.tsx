/**
 * CONTRACT-501 — /app/contracts
 *
 * Generator de contracte cu:
 *   - Pas 1: tab Foto Document (OCR) / Text Manual
 *   - Pas 2: toggle PF / PJ + detalii curs
 *   - Sidebar: Contracte recente
 *   - Pre-fill din lead/student via query params
 */
import { useEffect, useState, useRef, useCallback } from "react";
import {
  FileText, Upload, ChevronRight, ChevronLeft, Download,
  Loader2, AlertCircle, CheckCircle2, User, Building2,
  FilePlus, Clock,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  listContracts,
  createContract,
  getContractPdfUrl,
  uploadOcr,
  type Contract,
  type BeneficiaryType,
  type ContractFormat,
  type ContractCurrency,
  type CreateContractPayload,
} from "@/lib/api/contracts";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2;
type InputTab = "foto" | "manual";

interface FormState {
  beneficiaryType: BeneficiaryType;
  // PF
  beneficiaryName: string;
  idn: string;
  // PJ
  companyName: string;
  companyIdno: string;
  repName: string;
  repRole: string;
  // Course
  course: string;
  hours: string;
  scheduleText: string;
  language: string;
  format: ContractFormat | "";
  location: string;
  priceCents: string; // as string for input, parsed on submit
  currency: ContractCurrency;
  persons: string;
}

const EMPTY_FORM: FormState = {
  beneficiaryType: "pf",
  beneficiaryName: "",
  idn: "",
  companyName: "",
  companyIdno: "",
  repName: "",
  repRole: "",
  course: "",
  hours: "",
  scheduleText: "",
  language: "",
  format: "",
  location: "",
  priceCents: "",
  currency: "MDL",
  persons: "1",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

function parseQueryParams(path: string): Record<string, string> {
  const idx = path.indexOf("?");
  if (idx === -1) return {};
  const qs = path.slice(idx + 1);
  const result: Record<string, string> = {};
  for (const pair of qs.split("&")) {
    const [k, v] = pair.split("=");
    if (k) result[decodeURIComponent(k)] = decodeURIComponent(v ?? "");
  }
  return result;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ContractsPage() {
  const { status: sessionStatus } = useSession();
  const { path, navigate } = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [inputTab, setInputTab] = useState<InputTab>("manual");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [recentContracts, setRecentContracts] = useState<Contract[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successContract, setSuccessContract] = useState<Contract | null>(null);

  // OCR state
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrNote, setOcrNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Pre-fill from query params (coming from lead/student card)
  useEffect(() => {
    const params = parseQueryParams(path);
    if (
      params.name ||
      params.phone ||
      params.email ||
      params.course ||
      params.valueCents
    ) {
      setForm((prev) => ({
        ...prev,
        beneficiaryName: params.name ?? prev.beneficiaryName,
        course: params.course ?? prev.course,
        priceCents: params.valueCents
          ? String(Math.round(Number(params.valueCents) / 100))
          : prev.priceCents,
      }));
    }
  }, [path]);

  useEffect(() => {
    if (sessionStatus === "unauthenticated") navigate("/app/login");
  }, [sessionStatus, navigate]);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const { contracts } = await listContracts({ limit: 20 });
      setRecentContracts(contracts);
    } catch {
      // non-critical
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === "authenticated") loadRecent();
  }, [sessionStatus, loadRecent]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleOcrUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    setOcrNote(null);
    try {
      const { ocr } = await uploadOcr(file);
      if (ocr.beneficiaryName) setField("beneficiaryName", ocr.beneficiaryName);
      if (ocr.idn) setField("idn", ocr.idn);
      if (ocr.companyName) setField("companyName", ocr.companyName);
      if (ocr.companyIdno) setField("companyIdno", ocr.companyIdno);
      setOcrNote(ocr.note ?? null);
    } catch {
      setOcrNote("Eroare la procesarea imaginii. Completați manual.");
    } finally {
      setOcrLoading(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: CreateContractPayload = {
        beneficiaryType: form.beneficiaryType,
        beneficiaryName: form.beneficiaryName || null,
        idn: form.idn || null,
        companyName: form.companyName || null,
        companyIdno: form.companyIdno || null,
        repName: form.repName || null,
        repRole: form.repRole || null,
        course: form.course || null,
        hours: form.hours ? parseInt(form.hours, 10) : null,
        scheduleText: form.scheduleText || null,
        language: form.language || null,
        format: (form.format as ContractFormat) || null,
        location: form.location || null,
        priceCents: form.priceCents ? Math.round(parseFloat(form.priceCents) * 100) : 0,
        currency: form.currency,
        persons: form.persons ? parseInt(form.persons, 10) : 1,
      };

      // Pass CRM IDs if present in query
      const params = parseQueryParams(path);
      if (params.leadId) payload.leadId = params.leadId;
      if (params.studentId) payload.studentId = params.studentId;

      const { contract } = await createContract(payload);
      setSuccessContract(contract);
      setRecentContracts((prev) => [contract, ...prev.slice(0, 19)]);
    } catch {
      setSubmitError("Contractul nu a putut fi generat. Verificați conexiunea și reîncercați.");
    } finally {
      setSubmitting(false);
    }
  }

  if (successContract) {
    return (
      <AppShell pageTitle="Generator contracte">
        <ContractSuccess
          contract={successContract}
          onNew={() => {
            setSuccessContract(null);
            setForm(EMPTY_FORM);
            setStep(1);
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell pageTitle="Generator contracte">
      <div className="flex gap-6 min-h-[calc(100vh-6rem)]">
        {/* ─── Main area ─────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          {/* Progress indicator */}
          <div className="flex items-center gap-2 mb-6">
            <StepBadge active={step === 1} done={step > 1} number={1}>
              Date beneficiar
            </StepBadge>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            <StepBadge active={step === 2} done={false} number={2}>
              Detalii curs
            </StepBadge>
          </div>

          {step === 1 && (
            <Step1
              inputTab={inputTab}
              setInputTab={setInputTab}
              form={form}
              setField={setField}
              ocrLoading={ocrLoading}
              ocrNote={ocrNote}
              fileInputRef={fileInputRef}
              onOcrUpload={handleOcrUpload}
              onNext={() => setStep(2)}
            />
          )}

          {step === 2 && (
            <Step2
              form={form}
              setField={setField}
              onBack={() => setStep(1)}
              onSubmit={handleSubmit}
              submitting={submitting}
              submitError={submitError}
            />
          )}
        </div>

        {/* ─── Sidebar: Contracte recente ───────────────────────────────── */}
        <aside className="hidden lg:block w-72 shrink-0">
          <div className="sticky top-20 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Contracte recente</span>
            </div>
            {loadingRecent ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Se încarcă...</span>
              </div>
            ) : recentContracts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Niciun contract generat.</p>
            ) : (
              <ul className="space-y-2">
                {recentContracts.map((c) => (
                  <li key={c.id}>
                    <a
                      href={getContractPdfUrl(c.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 p-2 rounded-lg hover:bg-muted transition-colors group"
                      aria-label={`Contract ${c.number}`}
                    >
                      <FileText className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-mono font-semibold truncate group-hover:text-primary">
                          {c.number}
                        </p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {c.beneficiaryType === "pf"
                            ? (c.beneficiaryName ?? "—")
                            : (c.companyName ?? "—")}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatPrice(c.priceCents, c.currency)}
                        </p>
                      </div>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </AppShell>
  );
}

// ─── Step 1 ───────────────────────────────────────────────────────────────────

interface Step1Props {
  inputTab: InputTab;
  setInputTab: (t: InputTab) => void;
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  ocrLoading: boolean;
  ocrNote: string | null;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  onOcrUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onNext: () => void;
}

function Step1({
  inputTab,
  setInputTab,
  form,
  setField,
  ocrLoading,
  ocrNote,
  fileInputRef,
  onOcrUpload,
  onNext,
}: Step1Props) {
  const isPf = form.beneficiaryType === "pf";

  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-6">
      <h2 className="text-base font-semibold">Pas 1 — Date beneficiar</h2>

      {/* Input method tabs */}
      <div className="flex rounded-lg border border-border overflow-hidden" role="tablist">
        <TabButton
          active={inputTab === "foto"}
          onClick={() => setInputTab("foto")}
          role="tab"
          aria-selected={inputTab === "foto"}
        >
          <Upload className="h-4 w-4" />
          Foto Document
        </TabButton>
        <TabButton
          active={inputTab === "manual"}
          onClick={() => setInputTab("manual")}
          role="tab"
          aria-selected={inputTab === "manual"}
        >
          <FileText className="h-4 w-4" />
          Text Manual
        </TabButton>
      </div>

      {/* OCR upload area */}
      {inputTab === "foto" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Încărcați o fotografie a buletinului / ID-ului. Datele vor fi extrase automat.
          </p>
          <div
            className={cn(
              "border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 transition-colors",
              ocrLoading && "opacity-60 pointer-events-none"
            )}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => e.key === "Enter" && fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Încărcați fotografie buletin"
          >
            {ocrLoading ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin" />
                <span className="text-sm">Se procesează imaginea...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Upload className="h-8 w-8" />
                <span className="text-sm">Click sau drag & drop</span>
                <span className="text-xs">JPG, PNG, PDF — max 10MB</span>
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,application/pdf"
            className="sr-only"
            aria-label="Selectați fișierul pentru OCR"
            onChange={onOcrUpload}
          />
          {ocrNote && (
            <div className="flex items-start gap-2 rounded-lg bg-warning/10 border border-warning/30 p-3 text-sm text-warning-foreground">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{ocrNote}</span>
            </div>
          )}
        </div>
      )}

      {/* PF / PJ toggle */}
      <div>
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Tip beneficiar
        </label>
        <div className="flex gap-3 mt-2">
          <TypeButton
            active={isPf}
            onClick={() => setField("beneficiaryType", "pf")}
            icon={<User className="h-4 w-4" />}
            label="Persoană Fizică"
          />
          <TypeButton
            active={!isPf}
            onClick={() => setField("beneficiaryType", "pj")}
            icon={<Building2 className="h-4 w-4" />}
            label="Persoană Juridică"
          />
        </div>
      </div>

      {/* PF fields */}
      {isPf && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField
            label="Nume și Prenume"
            required
            htmlFor="beneficiary-name"
          >
            <input
              id="beneficiary-name"
              type="text"
              value={form.beneficiaryName}
              onChange={(e) => setField("beneficiaryName", e.target.value)}
              placeholder="Ex: Popescu Ion"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>
          <FormField label="IDNP" htmlFor="idn">
            <input
              id="idn"
              type="text"
              value={form.idn}
              onChange={(e) => setField("idn", e.target.value)}
              placeholder="Ex: 2000000000000"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>
        </div>
      )}

      {/* PJ fields */}
      {!isPf && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormField label="Denumire companie" required htmlFor="company-name">
            <input
              id="company-name"
              type="text"
              value={form.companyName}
              onChange={(e) => setField("companyName", e.target.value)}
              placeholder="Ex: ABC SRL"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>
          <FormField label="IDNO / Cod fiscal" htmlFor="company-idno">
            <input
              id="company-idno"
              type="text"
              value={form.companyIdno}
              onChange={(e) => setField("companyIdno", e.target.value)}
              placeholder="Ex: 1001600012345"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>
          <FormField label="Reprezentant" htmlFor="rep-name">
            <input
              id="rep-name"
              type="text"
              value={form.repName}
              onChange={(e) => setField("repName", e.target.value)}
              placeholder="Ex: Maria Ionescu"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>
          <FormField label="Funcție reprezentant" htmlFor="rep-role">
            <input
              id="rep-role"
              type="text"
              value={form.repRole}
              onChange={(e) => setField("repRole", e.target.value)}
              placeholder="Ex: Director"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          Continuă
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Step 2 ───────────────────────────────────────────────────────────────────

interface Step2Props {
  form: FormState;
  setField: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
  onBack: () => void;
  onSubmit: () => void;
  submitting: boolean;
  submitError: string | null;
}

function Step2({ form, setField, onBack, onSubmit, submitting, submitError }: Step2Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-6">
      <h2 className="text-base font-semibold">Pas 2 — Detalii curs</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <FormField label="Cursul" htmlFor="course">
          <input
            id="course"
            type="text"
            value={form.course}
            onChange={(e) => setField("course", e.target.value)}
            placeholder="Ex: Engleză A1"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </FormField>
        <FormField label="Nr. ore" htmlFor="hours">
          <input
            id="hours"
            type="number"
            min="1"
            value={form.hours}
            onChange={(e) => setField("hours", e.target.value)}
            placeholder="Ex: 60"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </FormField>
        <FormField label="Orar (text liber)" htmlFor="schedule-text" className="sm:col-span-2">
          <input
            id="schedule-text"
            type="text"
            value={form.scheduleText}
            onChange={(e) => setField("scheduleText", e.target.value)}
            placeholder="Ex: Luni–Miercuri 18:00–19:30, start 02.06.2026"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </FormField>
        <FormField label="Limbă" htmlFor="language">
          <input
            id="language"
            type="text"
            value={form.language}
            onChange={(e) => setField("language", e.target.value)}
            placeholder="Ex: Engleză"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </FormField>
        <FormField label="Format" htmlFor="format">
          <select
            id="format"
            value={form.format}
            onChange={(e) => setField("format", e.target.value as ContractFormat | "")}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— Selectează —</option>
            <option value="fizic">Fizic</option>
            <option value="online">Online</option>
          </select>
        </FormField>
        <FormField label="Locație" htmlFor="location">
          <input
            id="location"
            type="text"
            value={form.location}
            onChange={(e) => setField("location", e.target.value)}
            placeholder="Ex: Chișinău, str. Independenței 1"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </FormField>
        <FormField label="Nr. persoane" htmlFor="persons">
          <input
            id="persons"
            type="number"
            min="1"
            value={form.persons}
            onChange={(e) => setField("persons", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </FormField>
        <FormField label="Preț" htmlFor="price-cents">
          <input
            id="price-cents"
            type="number"
            min="0"
            step="0.01"
            value={form.priceCents}
            onChange={(e) => setField("priceCents", e.target.value)}
            placeholder="Ex: 360.00"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </FormField>
        <FormField label="Valută" htmlFor="currency">
          <select
            id="currency"
            value={form.currency}
            onChange={(e) => setField("currency", e.target.value as ContractCurrency)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="MDL">MDL</option>
            <option value="EUR">EUR</option>
            <option value="RON">RON</option>
          </select>
        </FormField>
      </div>

      {submitError && (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{submitError}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          disabled={submitting}
        >
          <ChevronLeft className="h-4 w-4" />
          Înapoi
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="inline-flex items-center gap-2 justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 min-w-[180px] disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Se generează...
            </>
          ) : (
            <>
              <FilePlus className="h-4 w-4" />
              Generează contract
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Success screen ───────────────────────────────────────────────────────────

interface ContractSuccessProps {
  contract: Contract;
  onNew: () => void;
}

function ContractSuccess({ contract, onNew }: ContractSuccessProps) {
  return (
    <div className="max-w-lg mx-auto py-16 flex flex-col items-center gap-6 text-center">
      <div className="h-16 w-16 rounded-full bg-success/15 flex items-center justify-center">
        <CheckCircle2 className="h-8 w-8 text-success" />
      </div>
      <div>
        <h2 className="text-xl font-bold mb-1">Contract generat</h2>
        <p className="text-sm text-muted-foreground">
          Număr contract:{" "}
          <span className="font-mono font-semibold text-foreground">{contract.number}</span>
        </p>
      </div>
      <div className="flex gap-3">
        <a
          href={getContractPdfUrl(contract.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Download className="h-4 w-4" />
          Descarcă PDF
        </a>
        <button type="button" onClick={onNew} className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted">
          Contract nou
        </button>
      </div>
    </div>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

interface StepBadgeProps {
  active: boolean;
  done: boolean;
  number: number;
  children: React.ReactNode;
}

function StepBadge({ active, done, number, children }: StepBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
        active && "bg-primary text-primary-foreground",
        done && "bg-success/15 text-success",
        !active && !done && "text-muted-foreground"
      )}
    >
      <span
        className={cn(
          "h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold",
          active && "bg-primary-foreground/20",
          done && "bg-success/20",
          !active && !done && "bg-muted"
        )}
      >
        {done ? <CheckCircle2 className="h-3 w-3" /> : number}
      </span>
      {children}
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  role?: string;
  "aria-selected"?: boolean;
}

function TabButton({ active, onClick, children, ...rest }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-muted-foreground"
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

interface TypeButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function TypeButton({ active, onClick, icon, label }: TypeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors touch-target",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border hover:border-primary/50 text-muted-foreground"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

interface FormFieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

function FormField({ label, htmlFor, required, className, children }: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
