/**
 * PAR-105 — /app/par/new
 *
 * Wizard de creare PAR (Payment Action Request):
 *   Pas 1: Antet (secțiunile 1–7)
 *   Pas 2: Clasificare (secțiunile 8–9)
 *   Pas 3: Linii (secțiunea 10)
 *   Pas 4: End-use (secțiunea 11)
 *   Pas 5: Payee (secțiunea 12)
 *   Pas 6: Atașamente (secțiunea 13)
 *   Pas 7: Review
 *   Pas 8: Submit
 *
 * CORE: backlog/par/PAR-CORE.md §6
 * Design system: Vector 365 tokens only, light + dark, WCAG AA
 */
import { useState, useEffect, useCallback } from "react";
import {
  ChevronRight,
  ChevronLeft,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
  AlertCircle,
  CheckCircle2,
  Paperclip,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import {
  createPar,
  updatePar,
  submitPar,
  addLineItem,
  updateLineItem,
  deleteLineItem,
  uploadAttachment,
  deleteAttachment,
  listAttachments,
  listDepartments,
  listProjects,
  listBudgetCodes,
  listVendors,
  formatMDL,
  type ParRequest,
  type ParLineItem,
  type ParAttachment,
  type ParDepartment,
  type ParProject,
  type ParBudgetCode,
  type ParVendor,
  type ParPurpose,
  type ParChargeTo,
  type ParAttachmentKind,
} from "@/lib/api/par";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPS = [
  { id: 1, label: "Antet" },
  { id: 2, label: "Clasificare" },
  { id: 3, label: "Linii" },
  { id: 4, label: "End-use" },
  { id: 5, label: "Payee" },
  { id: 6, label: "Atașamente" },
  { id: 7, label: "Review" },
] as const;

type Step = (typeof STEPS)[number]["id"];

const ATTACHMENT_KIND_LABELS: Record<ParAttachmentKind, string> = {
  act_of_receipt: "Act de primire",
  contract: "Contract",
  quotation: "Ofertă",
  invoice: "Factură",
  par_pdf: "PAR PDF",
  other: "Altul",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatDateInput(d: Date): string {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD for <input type="date">
}

// ─── Sub-step components ──────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

function Field({ label, htmlFor, required, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-foreground"
      >
        {label}
        {required && <span className="text-destructive ml-1" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3 flex-shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

// ─── Main wizard component ────────────────────────────────────────────────────

export function ParCreateWizard() {
  const { data: session } = useSession();
  const { navigate } = useRouter();

  const [step, setStep] = useState<Step>(1);
  const [parId, setParId] = useState<string | null>(null);
  const [par, setPar] = useState<ParRequest | null>(null);
  const [lineItems, setLineItems] = useState<ParLineItem[]>([]);
  const [attachments, setAttachments] = useState<ParAttachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});

  // Config data
  const [departments, setDepartments] = useState<ParDepartment[]>([]);
  const [projects, setProjects] = useState<ParProject[]>([]);
  const [budgetCodes, setBudgetCodes] = useState<ParBudgetCode[]>([]);
  const [vendors, setVendors] = useState<ParVendor[]>([]);

  // Step 1 — Header
  const [dateOfRequest, setDateOfRequest] = useState(formatDateInput(new Date()));
  const [requestorTitle, setRequestorTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [dateNeeded, setDateNeeded] = useState("");
  const [projectId, setProjectId] = useState("");
  const [budgetCodeId, setBudgetCodeId] = useState("");
  const [budgetCodeNote, setBudgetCodeNote] = useState("");

  // Step 2 — Classification
  const [purpose, setPurpose] = useState<ParPurpose>("execute_payment");
  const [chargeTo, setChargeTo] = useState<ParChargeTo>("program");
  const [chargeBillingCode, setChargeBillingCode] = useState("");

  // Step 3 — Line items (managed through API)
  const [newLineDesc, setNewLineDesc] = useState("");
  const [newLineQty, setNewLineQty] = useState("1");
  const [newLineUnit, setNewLineUnit] = useState("");
  const [newLinePrice, setNewLinePrice] = useState("");
  const [lineError, setLineError] = useState<string | null>(null);
  const [addingLine, setAddingLine] = useState(false);
  const [totalCents, setTotalCents] = useState(0);
  const [aboveThreshold, setAboveThreshold] = useState(false);

  // Step 4 — End-use
  const [endUse, setEndUse] = useState("");

  // Step 5 — Payee
  const [vendorId, setVendorId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [payeeIdnp, setPayeeIdnp] = useState("");
  const [payeeIban, setPayeeIban] = useState("");
  const [payeeBank, setPayeeBank] = useState("");

  // Step 6 — Attachments
  const [attachmentsPresent, setAttachmentsPresent] = useState<boolean | null>(null);
  const [attachmentsNote, setAttachmentsNote] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadKind, setUploadKind] = useState<ParAttachmentKind>("other");
  const [attachWarning, setAttachWarning] = useState(false);

  // Load config on mount
  useEffect(() => {
    const load = async () => {
      try {
        const [depts, projs, codes, vends] = await Promise.all([
          listDepartments(),
          listProjects(),
          listBudgetCodes(),
          listVendors(),
        ]);
        setDepartments(depts.items.filter((d) => d.active));
        setProjects(projs.items.filter((p) => p.active));
        setBudgetCodes(codes.items.filter((c) => c.active));
        setVendors(vends.items.filter((v) => v.active));
      } catch {
        // Config load errors are non-blocking
      }
    };
    load();
  }, []);

  // Create PAR draft on first advance
  const ensurePar = useCallback(async (): Promise<string | null> => {
    if (parId) return parId;
    try {
      const created = await createPar({
        date_of_request: new Date(dateOfRequest).toISOString(),
        requestor_title: requestorTitle || null,
        department_id: departmentId || null,
        date_needed: dateNeeded ? new Date(dateNeeded).toISOString() : null,
        project_id: projectId || null,
        budget_code_id: budgetCodeId || null,
        budget_code_note: budgetCodeNote || null,
        purpose,
        charge_to: chargeTo,
        charge_billing_code: chargeBillingCode || null,
      });
      setParId(created.id);
      setPar(created);
      return created.id;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Eroare la creare PAR";
      setError(msg);
      return null;
    }
  }, [
    parId, dateOfRequest, requestorTitle, departmentId, dateNeeded,
    projectId, budgetCodeId, budgetCodeNote, purpose, chargeTo, chargeBillingCode,
  ]);

  // Save draft patch
  const saveDraft = useCallback(async (id: string) => {
    try {
      const updated = await updatePar(id, {
        date_of_request: new Date(dateOfRequest).toISOString(),
        requestor_title: requestorTitle || null,
        department_id: departmentId || null,
        date_needed: dateNeeded ? new Date(dateNeeded).toISOString() : null,
        project_id: projectId || null,
        budget_code_id: budgetCodeId || null,
        budget_code_note: budgetCodeNote || null,
        purpose,
        charge_to: chargeTo,
        charge_billing_code: chargeBillingCode || null,
        end_use: endUse || null,
        vendor_id: vendorId || null,
        payee_name: payeeName || null,
        payee_idnp: payeeIdnp || null,
        payee_iban: payeeIban || null,
        payee_bank: payeeBank || null,
        attachments_present: attachmentsPresent ?? false,
        attachments_note: attachmentsNote || null,
      });
      setPar(updated);
      setServerErrors({});
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Eroare la salvare";
      setError(msg);
    }
  }, [
    dateOfRequest, requestorTitle, departmentId, dateNeeded, projectId,
    budgetCodeId, budgetCodeNote, purpose, chargeTo, chargeBillingCode,
    endUse, vendorId, payeeName, payeeIdnp, payeeIban, payeeBank,
    attachmentsPresent, attachmentsNote,
  ]);

  const handleNext = async () => {
    setError(null);
    setLoading(true);
    try {
      if (step === 1) {
        const id = await ensurePar();
        if (!id) return;
        setStep(2);
      } else if (step === 2) {
        const id = parId;
        if (!id) { setError("PAR ID missing"); return; }
        await saveDraft(id);
        setStep(3);
      } else if (step === 3) {
        // Load latest attachments count
        setStep(4);
      } else if (step === 4) {
        // Validate: execute_payment requires end_use
        if (purpose === "execute_payment" && !endUse.trim()) {
          setServerErrors({ end_use: "Câmpul 'End use' este obligatoriu pentru plăți." });
          return;
        }
        const id = parId;
        if (id) await updatePar(id, { end_use: endUse || null });
        setStep(5);
      } else if (step === 5) {
        // Validate IBAN/IDNP client-side
        const newErrors: Record<string, string> = {};
        if (payeeIban && !payeeIban.match(/^MD\d{2}[A-Z0-9]{20}$/)) {
          newErrors.payee_iban = "IBAN invalid — format MD + 2 cifre + 20 caractere alfanumerice";
        }
        if (payeeIdnp && !payeeIdnp.match(/^\d{13}$/)) {
          newErrors.payee_idnp = "IDNP trebuie să conțină exact 13 cifre";
        }
        if (Object.keys(newErrors).length > 0) {
          setServerErrors(newErrors);
          return;
        }
        const id = parId;
        if (id) {
          try {
            await updatePar(id, {
              vendor_id: vendorId || null,
              payee_name: payeeName || null,
              payee_idnp: payeeIdnp || null,
              payee_iban: payeeIban || null,
              payee_bank: payeeBank || null,
            });
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : "Eroare validare";
            // Surface server-side IBAN/IDNP errors
            if (msg.includes("iban")) setServerErrors({ payee_iban: msg });
            else if (msg.includes("idnp")) setServerErrors({ payee_idnp: msg });
            else setError(msg);
            return;
          }
        }
        setStep(6);
      } else if (step === 6) {
        // Save attachments metadata
        const id = parId;
        if (id) {
          await updatePar(id, {
            attachments_present: attachmentsPresent ?? false,
            attachments_note: attachmentsNote || null,
          });
        }
        // Warning if "yes" but 0 files
        if (attachmentsPresent && attachments.length === 0) {
          setAttachWarning(true);
        }
        setStep(7);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setError(null);
    setServerErrors({});
    if (step > 1) setStep((s) => (s - 1) as Step);
  };

  // Line item management
  const handleAddLine = async () => {
    if (!parId) return;
    const qty = parseInt(newLineQty, 10);
    const price = parseInt(newLinePrice.replace(/[^0-9]/g, ""), 10);
    if (!newLineDesc.trim()) { setLineError("Descrierea este obligatorie"); return; }
    if (!qty || qty <= 0) { setLineError("Cantitatea trebuie să fie > 0"); return; }
    if (isNaN(price) || price < 0) { setLineError("Prețul trebuie să fie ≥ 0"); return; }

    setLineError(null);
    setAddingLine(true);
    try {
      const res = await addLineItem(parId, {
        description: newLineDesc.trim(),
        quantity: qty,
        unit: newLineUnit.trim() || null,
        unit_price_cents: price,
      });
      setLineItems((prev) => [...prev, res.line_item]);
      setTotalCents(res.par_total_estimated_cents);
      setAboveThreshold(res.above_micro_threshold);
      setNewLineDesc("");
      setNewLineQty("1");
      setNewLineUnit("");
      setNewLinePrice("");
    } catch (e: unknown) {
      setLineError(e instanceof Error ? e.message : "Eroare la adăugare");
    } finally {
      setAddingLine(false);
    }
  };

  const handleDeleteLine = async (lineId: string) => {
    if (!parId) return;
    try {
      const res = await deleteLineItem(parId, lineId);
      setLineItems((prev) => prev.filter((l) => l.id !== lineId));
      setTotalCents(res.par_total_estimated_cents);
      setAboveThreshold(res.above_micro_threshold);
    } catch {
      // Non-blocking
    }
  };

  // File upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!parId || !e.target.files?.length) return;
    const file = e.target.files[0];

    const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (!ALLOWED.includes(file.type)) {
      setError("Tip de fișier neacceptat. Acceptăm PDF, PNG, JPEG.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Fișierul depășește 10 MB.");
      return;
    }

    setUploadingFile(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const att = await uploadAttachment(parId, {
        file_name: file.name,
        file_url: dataUrl,
        mime: file.type,
        kind: uploadKind,
        size_bytes: file.size,
      });
      setAttachments((prev) => [...prev, att]);
      setAttachWarning(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Eroare la upload");
    } finally {
      setUploadingFile(false);
      e.target.value = "";
    }
  };

  const handleDeleteAttachment = async (attId: string) => {
    if (!parId) return;
    try {
      await deleteAttachment(parId, attId);
      setAttachments((prev) => prev.filter((a) => a.id !== attId));
    } catch {
      // non-blocking
    }
  };

  // Vendor selection
  const handleVendorSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value;
    setVendorId(id);
    if (id) {
      const v = vendors.find((v) => v.id === id);
      if (v) {
        setPayeeName(v.name);
        setPayeeIdnp(v.idnp ?? "");
        setPayeeIban(v.iban ?? "");
        setPayeeBank(v.bank ?? "");
      }
    }
  };

  // Submit PAR
  const handleSubmit = async () => {
    if (!parId) return;
    setLoading(true);
    setError(null);
    try {
      const submitted = await submitPar(parId);
      navigate(`/app/par/${submitted.id}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Eroare la trimitere";
      // Surface server validation errors
      if (msg.includes("end_use")) {
        setError("Câmpul End-use este obligatoriu pentru plăți. Revino la pasul 4.");
        setStep(4);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const requestorName = session?.user
    ? (session.user.name || session.user.email)
    : "";

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* Page title */}
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary flex-shrink-0" aria-hidden />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Cerere nouă de plată (PAR)</h1>
            <p className="text-sm text-muted-foreground">
              {par?.requestNo ? `Număr: ${par.requestNo}` : "Ciornă nouă"}
            </p>
          </div>
        </div>

        {/* Step indicator */}
        <nav aria-label="Pași wizard" className="flex items-center gap-1 flex-wrap">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1">
              <button
                type="button"
                aria-label={`Pasul ${s.id}: ${s.label}`}
                aria-current={step === s.id ? "step" : undefined}
                disabled={s.id > step || loading}
                onClick={() => s.id < step && setStep(s.id)}
                className={cn(
                  "h-8 w-8 rounded-full text-xs font-medium flex items-center justify-center transition-colors min-w-[44px] min-h-[44px]",
                  s.id === step
                    ? "bg-primary text-primary-foreground"
                    : s.id < step
                    ? "bg-primary/20 text-primary cursor-pointer hover:bg-primary/30"
                    : "bg-muted text-muted-foreground cursor-default"
                )}
              >
                {s.id < step ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : s.id}
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 w-4 sm:w-8 transition-colors",
                    s.id < step ? "bg-primary/40" : "bg-border"
                  )}
                  aria-hidden
                />
              )}
            </div>
          ))}
        </nav>

        {/* Error banner */}
        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden />
            <span>{error}</span>
          </div>
        )}

        {/* Step content */}
        <div className="rounded-xl border border-border bg-card p-6 space-y-5">
          {/* Step 1 — Header */}
          {step === 1 && (
            <fieldset>
              <legend className="text-base font-semibold text-foreground mb-4">
                Secțiunile 1–7: Antet
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Data cererii" htmlFor="dateOfRequest" required>
                  <input
                    id="dateOfRequest"
                    type="date"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                    value={dateOfRequest}
                    onChange={(e) => setDateOfRequest(e.target.value)}
                  />
                </Field>

                <Field label="Solicitant (nume)" htmlFor="requestorName">
                  <input
                    id="requestorName"
                    type="text"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                    value={requestorName}
                    disabled
                    aria-label="Numele solicitantului (din cont)"
                  />
                </Field>

                <Field label="Funcție / Cod" htmlFor="requestorTitle">
                  <input
                    id="requestorTitle"
                    type="text"
                    placeholder="ex. Procurement Specialist / M13"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                    value={requestorTitle}
                    onChange={(e) => setRequestorTitle(e.target.value)}
                  />
                </Field>

                <Field label="Departament" htmlFor="departmentId">
                  <select
                    id="departmentId"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    aria-label="Selectează departamentul"
                  >
                    <option value="">— Selectează —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Data necesară" htmlFor="dateNeeded"
                  hint="Opțional — data la care sunt necesare bunurile/serviciile">
                  <input
                    id="dateNeeded"
                    type="date"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                    value={dateNeeded}
                    onChange={(e) => setDateNeeded(e.target.value)}
                    min={dateOfRequest}
                  />
                </Field>

                <Field label="Proiect / Program" htmlFor="projectId">
                  <select
                    id="projectId"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    aria-label="Selectează proiectul"
                  >
                    <option value="">— Selectează —</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Cod bugetar" htmlFor="budgetCodeId">
                  <select
                    id="budgetCodeId"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                    value={budgetCodeId}
                    onChange={(e) => setBudgetCodeId(e.target.value)}
                    aria-label="Selectează codul bugetar"
                  >
                    <option value="">— Selectează —</option>
                    {budgetCodes.map((bc) => (
                      <option key={bc.id} value={bc.id}>{bc.code} — {bc.name}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Notă cod bugetar" htmlFor="budgetCodeNote"
                  hint="ex. conform planificării bugetare lunare">
                  <input
                    id="budgetCodeNote"
                    type="text"
                    placeholder="Notă opțională"
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                    value={budgetCodeNote}
                    onChange={(e) => setBudgetCodeNote(e.target.value)}
                  />
                </Field>
              </div>
            </fieldset>
          )}

          {/* Step 2 — Classification */}
          {step === 2 && (
            <fieldset>
              <legend className="text-base font-semibold text-foreground mb-4">
                Secțiunile 8–9: Clasificare
              </legend>
              <div className="space-y-5">
                <Field label="Scopul cererii (Purpose)" htmlFor="purpose" required
                  hint="Determină dacă PAR-ul implică o plată sau e pregătitor">
                  <div className="space-y-2" role="radiogroup" aria-labelledby="purpose-label">
                    {(
                      [
                        { value: "execute_payment", label: "Executare plată", desc: "PAR cu plată — parcurge tot fluxul de aprobare + finanțe" },
                        { value: "obtain_quotations", label: "Obținere oferte", desc: "Pregătire pentru achiziție — se închide după aprobare" },
                        { value: "provide_estimate", label: "Estimare costuri", desc: "Doar estimare — fără plată" },
                      ] as const
                    ).map((opt) => (
                      <label
                        key={opt.value}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors min-h-[44px]",
                          purpose === opt.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <input
                          type="radio"
                          name="purpose"
                          value={opt.value}
                          checked={purpose === opt.value}
                          onChange={() => setPurpose(opt.value)}
                          className="mt-0.5 accent-primary"
                        />
                        <div>
                          <span className="text-sm font-medium text-foreground">{opt.label}</span>
                          <p className="text-xs text-muted-foreground">{opt.desc}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </Field>

                <Field label="Imputat la (Charge To)" htmlFor="chargeTo" required>
                  <div className="space-y-2" role="radiogroup" aria-labelledby="chargeto-label">
                    {(
                      [
                        { value: "operations", label: "Operațional" },
                        { value: "program", label: "Program" },
                        { value: "other", label: "Altul (cod de facturare)" },
                      ] as const
                    ).map((opt) => (
                      <label
                        key={opt.value}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors min-h-[44px]",
                          chargeTo === opt.value
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <input
                          type="radio"
                          name="chargeTo"
                          value={opt.value}
                          checked={chargeTo === opt.value}
                          onChange={() => setChargeTo(opt.value)}
                          className="accent-primary"
                        />
                        <span className="text-sm font-medium text-foreground">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </Field>

                {chargeTo === "other" && (
                  <Field label="Cod de facturare" htmlFor="chargeBillingCode">
                    <input
                      id="chargeBillingCode"
                      type="text"
                      placeholder="ex. GRANT-2026-A"
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                      value={chargeBillingCode}
                      onChange={(e) => setChargeBillingCode(e.target.value)}
                    />
                  </Field>
                )}
              </div>
            </fieldset>
          )}

          {/* Step 3 — Line items */}
          {step === 3 && (
            <div>
              <h2 className="text-base font-semibold text-foreground mb-4">
                Secțiunea 10: Articole / Servicii solicitate
              </h2>

              {/* Existing line items */}
              {lineItems.length > 0 && (
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-sm border-collapse">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border">
                        <th className="pb-2 pr-3 font-medium">#</th>
                        <th className="pb-2 pr-3 font-medium">Descriere</th>
                        <th className="pb-2 pr-3 font-medium text-right">Cant.</th>
                        <th className="pb-2 pr-3 font-medium">UM</th>
                        <th className="pb-2 pr-3 font-medium text-right">Preț/u (MDL)</th>
                        <th className="pb-2 pr-3 font-medium text-right">Total (MDL)</th>
                        <th className="pb-2 font-medium" aria-label="Acțiuni"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((li) => (
                        <tr key={li.id} className="border-b border-border/50">
                          <td className="py-2 pr-3 text-muted-foreground">{li.position}</td>
                          <td className="py-2 pr-3">{li.description}</td>
                          <td className="py-2 pr-3 text-right">{li.quantity}</td>
                          <td className="py-2 pr-3 text-muted-foreground">{li.unit ?? "—"}</td>
                          <td className="py-2 pr-3 text-right">{(li.unitPriceCents / 100).toFixed(2)}</td>
                          <td className="py-2 pr-3 text-right font-medium">{(li.lineTotalCents / 100).toFixed(2)}</td>
                          <td className="py-2">
                            <button
                              type="button"
                              aria-label={`Șterge rândul ${li.position}: ${li.description}`}
                              onClick={() => handleDeleteLine(li.id)}
                              className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Total */}
              <div className={cn(
                "flex items-center justify-between p-3 rounded-lg mb-4",
                aboveThreshold ? "bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800" : "bg-muted"
              )}>
                <span className="text-sm font-medium text-foreground">TOTAL ESTIMATED COST</span>
                <span className={cn(
                  "text-base font-semibold",
                  aboveThreshold ? "text-orange-700 dark:text-orange-300" : "text-foreground"
                )}>
                  {formatMDL(totalCents)}
                </span>
              </div>
              {aboveThreshold && (
                <p className="text-xs text-orange-600 dark:text-orange-400 mb-4 flex items-start gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden />
                  Suma depășește pragul micro-achiziție. Dacă plata finală depășește bugetul estimat cu
                  mai mult de 10%, este necesară re-aprobare.
                </p>
              )}

              {/* Add new line */}
              <div className="border border-dashed border-border rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">Adaugă articol nou</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Descriere / Specificații" htmlFor="newLineDesc" required>
                    <input
                      id="newLineDesc"
                      type="text"
                      placeholder="ex. Servicii consultanță psihologică"
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                      value={newLineDesc}
                      onChange={(e) => setNewLineDesc(e.target.value)}
                    />
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Cant." htmlFor="newLineQty" required>
                      <input
                        id="newLineQty"
                        type="number"
                        min="1"
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                        value={newLineQty}
                        onChange={(e) => setNewLineQty(e.target.value)}
                      />
                    </Field>
                    <Field label="UM" htmlFor="newLineUnit">
                      <input
                        id="newLineUnit"
                        type="text"
                        placeholder="sesie"
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                        value={newLineUnit}
                        onChange={(e) => setNewLineUnit(e.target.value)}
                      />
                    </Field>
                    <Field label="Preț/u (MDL)" htmlFor="newLinePrice" required>
                      <input
                        id="newLinePrice"
                        type="number"
                        min="0"
                        placeholder="700000"
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                        value={newLinePrice}
                        onChange={(e) => setNewLinePrice(e.target.value)}
                      />
                    </Field>
                  </div>
                </div>
                {lineError && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" aria-hidden /> {lineError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleAddLine}
                  disabled={addingLine || !parId}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[44px]"
                >
                  {addingLine ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                  Adaugă articol
                </button>
              </div>
            </div>
          )}

          {/* Step 4 — End-use */}
          {step === 4 && (
            <fieldset>
              <legend className="text-base font-semibold text-foreground mb-4">
                Secțiunea 11: Scopul și descrierea utilizării finale
              </legend>
              <Field
                label="Descriere end-use"
                htmlFor="endUse"
                required={purpose === "execute_payment"}
                hint={
                  purpose === "execute_payment"
                    ? "Obligatoriu pentru plăți. Descrie serviciile/bunurile primite."
                    : "Opțional pentru oferte / estimări."
                }
                error={serverErrors.end_use}
              >
                <textarea
                  id="endUse"
                  rows={5}
                  placeholder="ex. Servicii de consultanță psihologică de grup, organizate în cadrul proiectului Digital Safeguard, cu durata 120-180 min, pe platforma Zoom."
                  className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full resize-none"
                  value={endUse}
                  onChange={(e) => {
                    setEndUse(e.target.value);
                    if (serverErrors.end_use) setServerErrors((prev) => ({ ...prev, end_use: "" }));
                  }}
                  aria-required={purpose === "execute_payment"}
                />
              </Field>
            </fieldset>
          )}

          {/* Step 5 — Payee */}
          {step === 5 && (
            <fieldset>
              <legend className="text-base font-semibold text-foreground mb-4">
                Secțiunea 12: Beneficiar plată (Payee)
              </legend>
              <div className="space-y-4">
                {vendors.length > 0 && (
                  <Field label="Selectează furnizor existent" htmlFor="vendorId"
                    hint="Populează câmpurile automat din registry">
                    <select
                      id="vendorId"
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                      value={vendorId}
                      onChange={handleVendorSelect}
                      aria-label="Selectează furnizor din registry"
                    >
                      <option value="">— Introducere manuală —</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </Field>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nume, Prenume" htmlFor="payeeName">
                    <input
                      id="payeeName"
                      type="text"
                      placeholder="ex. Roitman Daria"
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                      value={payeeName}
                      onChange={(e) => setPayeeName(e.target.value)}
                    />
                  </Field>

                  <Field label="IDNP" htmlFor="payeeIdnp"
                    hint="Codul personal Moldova — 13 cifre"
                    error={serverErrors.payee_idnp}>
                    <input
                      id="payeeIdnp"
                      type="text"
                      maxLength={13}
                      placeholder="2008001007903"
                      className={cn(
                        "h-10 rounded-md border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]",
                        serverErrors.payee_idnp ? "border-destructive" : "border-input"
                      )}
                      value={payeeIdnp}
                      onChange={(e) => {
                        setPayeeIdnp(e.target.value);
                        if (serverErrors.payee_idnp) setServerErrors((p) => ({ ...p, payee_idnp: "" }));
                      }}
                    />
                  </Field>

                  <Field label="IBAN" htmlFor="payeeIban"
                    hint="Format Moldova: MD + 2 cifre + 20 caractere"
                    error={serverErrors.payee_iban}>
                    <input
                      id="payeeIban"
                      type="text"
                      maxLength={34}
                      placeholder="MD48ML000002259A19498121"
                      className={cn(
                        "h-10 rounded-md border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]",
                        serverErrors.payee_iban ? "border-destructive" : "border-input"
                      )}
                      value={payeeIban}
                      onChange={(e) => {
                        setPayeeIban(e.target.value.toUpperCase());
                        if (serverErrors.payee_iban) setServerErrors((p) => ({ ...p, payee_iban: "" }));
                      }}
                    />
                  </Field>

                  <Field label="Bancă" htmlFor="payeeBank">
                    <input
                      id="payeeBank"
                      type="text"
                      placeholder="ex. BC Moldindconbank S.A."
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                      value={payeeBank}
                      onChange={(e) => setPayeeBank(e.target.value)}
                    />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">
                  Datele beneficiarului sunt confidențiale (GDPR) — accesibile doar solicitant, aprobatori și finanțe.
                </p>
              </div>
            </fieldset>
          )}

          {/* Step 6 — Attachments */}
          {step === 6 && (
            <div>
              <h2 className="text-base font-semibold text-foreground mb-4">
                Secțiunea 13: Atașamente
              </h2>

              {/* Yes/No radio */}
              <Field label="Există atașamente?" htmlFor="attachPresent" required>
                <div className="flex gap-4">
                  {([
                    { value: true, label: "Da, am atașat" },
                    { value: false, label: "Nu" },
                  ] as const).map((opt) => (
                    <label
                      key={String(opt.value)}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-colors min-h-[44px]",
                        attachmentsPresent === opt.value
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <input
                        type="radio"
                        name="attachmentsPresent"
                        checked={attachmentsPresent === opt.value}
                        onChange={() => {
                          setAttachmentsPresent(opt.value);
                          setAttachWarning(false);
                        }}
                        className="accent-primary"
                      />
                      <span className="text-sm font-medium text-foreground">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </Field>

              {attachmentsPresent === true && (
                <div className="mt-4 space-y-4">
                  {/* Describe */}
                  <Field label="Descriere atașamente" htmlFor="attachmentsNote">
                    <input
                      id="attachmentsNote"
                      type="text"
                      placeholder="ex. Contract + act de primire"
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full min-h-[44px]"
                      value={attachmentsNote}
                      onChange={(e) => setAttachmentsNote(e.target.value)}
                    />
                  </Field>

                  {/* Upload section */}
                  <div className="space-y-2">
                    <div className="flex gap-2 items-end flex-wrap">
                      <Field label="Tip document" htmlFor="uploadKind">
                        <select
                          id="uploadKind"
                          className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
                          value={uploadKind}
                          onChange={(e) => setUploadKind(e.target.value as ParAttachmentKind)}
                          aria-label="Tipul documentului de atașat"
                        >
                          {(Object.entries(ATTACHMENT_KIND_LABELS) as [ParAttachmentKind, string][]).map(
                            ([k, v]) => <option key={k} value={k}>{v}</option>
                          )}
                        </select>
                      </Field>

                      <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium cursor-pointer hover:bg-secondary/80 transition-colors min-h-[44px]">
                        {uploadingFile
                          ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          : <Upload className="h-4 w-4" aria-hidden />}
                        <span>Încarcă fișier</span>
                        <input
                          type="file"
                          className="sr-only"
                          accept=".pdf,.png,.jpg,.jpeg"
                          onChange={handleFileUpload}
                          disabled={uploadingFile || !parId}
                          aria-label="Alege fișierul de atașat"
                        />
                      </label>
                    </div>
                    <p className="text-xs text-muted-foreground">PDF, PNG, JPEG — max 10 MB</p>
                  </div>

                  {/* Attached files list */}
                  {attachments.length > 0 && (
                    <ul className="space-y-2" aria-label="Fișiere atașate">
                      {attachments.map((att) => (
                        <li
                          key={att.id}
                          className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{att.fileName}</p>
                              <p className="text-xs text-muted-foreground">{ATTACHMENT_KIND_LABELS[att.kind]}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            aria-label={`Șterge fișierul ${att.fileName}`}
                            onClick={() => handleDeleteAttachment(att.id)}
                            className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0"
                          >
                            <X className="h-4 w-4" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Warning if "yes" but no files */}
                  {attachWarning && attachments.length === 0 && (
                    <div role="alert" className="flex items-start gap-2 p-3 rounded-lg bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-300 text-sm">
                      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden />
                      <span>Ai indicat că există atașamente, dar nu ai încărcat niciun fișier. Poți continua, dar approverul poate solicita documente.</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 7 — Review */}
          {step === 7 && (
            <div className="space-y-5">
              <h2 className="text-base font-semibold text-foreground">Review — Verificare finală</h2>
              <p className="text-sm text-muted-foreground">
                Verifică datele înainte de a trimite pentru aprobare.
              </p>

              <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                <ReviewRow label="Număr PAR" value={par?.requestNo ?? "Va fi generat la creare"} />
                <ReviewRow label="Data cererii" value={dateOfRequest} />
                <ReviewRow label="Solicitant" value={requestorName} />
                <ReviewRow label="Funcție" value={requestorTitle || "—"} />
                <ReviewRow
                  label="Departament"
                  value={departments.find((d) => d.id === departmentId)?.name ?? "—"}
                />
                <ReviewRow
                  label="Proiect"
                  value={projects.find((p) => p.id === projectId)?.name ?? "—"}
                />
                <ReviewRow
                  label="Cod bugetar"
                  value={budgetCodes.find((bc) => bc.id === budgetCodeId)
                    ? `${budgetCodes.find((bc) => bc.id === budgetCodeId)!.code} — ${budgetCodes.find((bc) => bc.id === budgetCodeId)!.name}`
                    : "—"}
                />
                <ReviewRow label="Scop" value={
                  { execute_payment: "Executare plată", obtain_quotations: "Obținere oferte", provide_estimate: "Estimare costuri" }[purpose]
                } />
                <ReviewRow label="Imputat la" value={
                  { operations: "Operațional", program: "Program", other: `Altul: ${chargeBillingCode || "—"}` }[chargeTo]
                } />
                <ReviewRow label="Total estimat" value={formatMDL(totalCents)} highlight={aboveThreshold} />
                <ReviewRow label="End-use" value={endUse || "—"} />
                <ReviewRow label="Beneficiar" value={payeeName || "—"} />
                <ReviewRow label="IBAN" value={payeeIban || "—"} />
                <ReviewRow label="Atașamente" value={
                  attachmentsPresent === true ? `Da (${attachments.length} fișiere)` : "Nu"
                } />
              </div>

              {aboveThreshold && (
                <div role="note" className="flex items-start gap-2 p-3 rounded-lg bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-300 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden />
                  <span>
                    Suma depășește pragul micro-achiziție. Regula 10%: dacă plata finală depășește bugetul
                    cu mai mult de 10%, PAR-ul necesită re-aprobare.
                  </span>
                </div>
              )}

              <p className="text-sm text-muted-foreground">
                Apăsând „Trimite pentru aprobare", cererea va fi transmisă aprobatorilor conform matricei DOA.
                Nu mai poți modifica după trimitere.
              </p>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || !parId}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[44px]"
                aria-label="Trimite cererea pentru aprobare"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
                Trimite pentru aprobare
              </button>
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        {step < 7 && (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={handleBack}
              disabled={step === 1 || loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-default transition-colors min-h-[44px]"
              aria-label={step > 1 ? "Înapoi la pasul anterior" : undefined}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden />
              Înapoi
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[44px]"
              aria-label={step === 6 ? "Mergi la review" : "Pasul următor"}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {step === 6 ? "Review" : "Înainte"}
              {!loading && <ChevronRight className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// ─── Review row helper ────────────────────────────────────────────────────────

function ReviewRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="text-sm text-muted-foreground flex-shrink-0 w-32">{label}</span>
      <span className={cn(
        "text-sm font-medium text-right",
        highlight ? "text-orange-700 dark:text-orange-300" : "text-foreground"
      )}>
        {value}
      </span>
    </div>
  );
}
