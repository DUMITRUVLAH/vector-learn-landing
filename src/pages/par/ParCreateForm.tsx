/**
 * /business/par/new — Cerere nouă de plată (PAR), TOT pe un singur ecran.
 *
 * Înlocuiește vechiul wizard în 7 pași. Toate secțiunile (1–13) sunt pe o pagină;
 * o bară lipită jos arată totalul + „Trimite pentru aprobare". Validarea e clară:
 * un sumar sus + erori sub câmpuri (nu mai apare codul brut „validation_failed").
 *
 * Design system: Vector 365 tokens only, light + dark, WCAG AA.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import {
  FileText, Loader2, Plus, Trash2, Upload, X, AlertCircle, CheckCircle2, Paperclip, Save,
  Search, Building2, BookmarkPlus, BookOpen, Sparkles, Info,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { detectPayeeType, type PayeeType } from "@/lib/par/payeeTypeDetector";
import { isValidMoldovaIBAN } from "@/lib/par/ibanCheck";
import type { ParPayeeCandidate } from "@/lib/par/parCandidateTypes";
import { QuotesSection } from "@/components/par/QuotesSection";
import { ApiError } from "@/lib/api";
import {
  createPar, updatePar, submitPar,
  addLineItem, deleteLineItem,
  uploadAttachment, deleteAttachment,
  listDepartments, listProjects, listEvents, listBudgetCodes, listVendors, createVendor,
  searchRegistryCompanies, getBudgetCodeBalance,
  listParTemplates, saveParTemplate, instantiateParTemplate,
  prefillParFromDocument,
  formatMDL,
  type ParRequest, type ParLineItem, type ParAttachment,
  type ParDepartment, type ParProject, type ParEvent, type ParBudgetCode, type ParVendor,
  type ParPurpose, type ParChargeTo, type ParAttachmentKind,
  type RegistryCompany, type BudgetCodeBalance, type ParTemplate,
  type ParPrefillResult,
} from "@/lib/api/par";
import { cn } from "@/lib/utils";

const ATTACHMENT_KIND_LABELS: Record<ParAttachmentKind, string> = {
  act_of_receipt: "Act de primire", contract: "Contract", quotation: "Ofertă",
  invoice: "Factură", par_pdf: "PAR PDF", other: "Altul",
};

/** Map server submit `errors[].field` → friendly RO message for the summary + inline. */
const FIELD_MESSAGES: Record<string, string> = {
  line_items: "Adaugă cel puțin un articol în secțiunea „Articole” (totalul trebuie să fie > 0).",
  total: "Totalul estimat trebuie să fie mai mare ca 0 — adaugă articole.",
  end_use: "Completează „Descrierea utilizării finale” (obligatoriu pentru plăți).",
  payee: "Completează beneficiarul: nume + IBAN (sau alege un furnizor salvat).",
  payee_iban: "IBAN invalid.",
  payee_idnp: "IDNP invalid.",
};

const inputCls =
  "h-11 rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
const today = () => new Date().toISOString().slice(0, 10);

// VF-203: format minor units in a given currency (MDL uses the existing "L" symbol via formatMDL).
function fmtMoney(cents: number, currency: string): string {
  if (currency === "MDL") return formatMDL(cents);
  const v = (cents / 100).toLocaleString("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v} ${currency}`;
}

function Field({ label, htmlFor, required, hint, error, children }: {
  label: string; htmlFor: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}{required && <span className="text-destructive ml-1" aria-hidden>*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle className="h-3 w-3 flex-shrink-0" aria-hidden />{error}
        </p>
      )}
    </div>
  );
}

function Section({ id, n, title, children }: { id?: string; n: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="rounded-xl border border-border bg-card p-4 space-y-3 scroll-mt-24">
      <h2 className="text-sm font-semibold text-foreground">
        <span className="text-muted-foreground font-normal mr-1.5">{n}</span>{title}
      </h2>
      {children}
    </section>
  );
}

export function ParCreateForm() {
  const { data: session } = useSession();
  const { navigate } = useRouter();

  const [parId, setParId] = useState<string | null>(null);
  const [par, setPar] = useState<ParRequest | null>(null);
  const [lineItems, setLineItems] = useState<ParLineItem[]>([]);
  const [attachments, setAttachments] = useState<ParAttachment[]>([]);
  const [totalCents, setTotalCents] = useState(0);
  const [aboveThreshold, setAboveThreshold] = useState(false);

  const [departments, setDepartments] = useState<ParDepartment[]>([]);
  const [projects, setProjects] = useState<ParProject[]>([]);
  const [events, setEvents] = useState<ParEvent[]>([]);
  const [budgetCodes, setBudgetCodes] = useState<ParBudgetCode[]>([]);
  const [vendors, setVendors] = useState<ParVendor[]>([]);

  // Feature 1: Registry search
  const [registryQuery, setRegistryQuery] = useState("");
  const [registryResults, setRegistryResults] = useState<RegistryCompany[]>([]);
  const [registrySearching, setRegistrySearching] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const registryDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Feature 2: Budget balance
  const [budgetBalance, setBudgetBalance] = useState<BudgetCodeBalance | null>(null);
  const [budgetBalanceLoading, setBudgetBalanceLoading] = useState(false);

  // Feature 3: Templates
  const [templates, setTemplates] = useState<ParTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);

  // Header (1–7)
  const [dateOfRequest, setDateOfRequest] = useState(today());
  const [requestorTitle, setRequestorTitle] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [dateNeeded, setDateNeeded] = useState("");
  const [projectId, setProjectId] = useState("");
  const [eventId, setEventId] = useState(""); // VM1-04
  const [budgetCodeId, setBudgetCodeId] = useState("");
  const [budgetCodeNote, setBudgetCodeNote] = useState("");
  // Classification. chargeTo stays a fixed default; VF-501 makes purpose selectable so the
  // "obtain quotations" flow (RFQ + quotes) is reachable from the UI.
  const [purpose, setPurpose] = useState<ParPurpose>("execute_payment");
  const chargeTo: ParChargeTo = "program";
  // VF-203: currency (MDL default). Editable while draft.
  const [currency, setCurrency] = useState<"MDL" | "EUR" | "USD">("MDL");
  // End-use (11)
  const [endUse, setEndUse] = useState("");
  // Payee (12)
  const [vendorId, setVendorId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [payeeIdnp, setPayeeIdnp] = useState("");
  const [payeeIban, setPayeeIban] = useState("");
  const [payeeBank, setPayeeBank] = useState("");
  // Feature 1: persoană fizică vs juridică toggle
  const [payeeType, setPayeeType] = useState<PayeeType>("juridic");
  // Attachments (13)
  const [attachmentsPresent, setAttachmentsPresent] = useState(false);
  const [attachmentsNote, setAttachmentsNote] = useState("");
  const [uploadKind, setUploadKind] = useState<ParAttachmentKind>("contract");
  const [uploadingFile, setUploadingFile] = useState(false);

  // New line-item draft row
  const [nlDesc, setNlDesc] = useState("");
  const [nlQty, setNlQty] = useState("1");
  const [nlUnit, setNlUnit] = useState("");
  const [nlPrice, setNlPrice] = useState("");
  const [lineError, setLineError] = useState<string | null>(null);
  const [addingLine, setAddingLine] = useState(false);

  // VM1-13: AI prefill state
  const [aiPrefilling, setAiPrefilling] = useState(false);
  const [aiPrefillResult, setAiPrefillResult] = useState<ParPrefillResult | null>(null);
  const [aiPrefillError, setAiPrefillError] = useState<string | null>(null);
  const aiPrefillFileRef = useRef<HTMLInputElement>(null);
  // PAR AI overhaul: when the document has 2+ equally-plausible payees the user must pick one.
  const [payeeCandidates, setPayeeCandidates] = useState<ParPayeeCandidate[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);

  // Load config + create the draft up-front (so line items / attachments work immediately).
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [depts, projs, evts, codes, vends, tmplRes] = await Promise.all([
          listDepartments(), listProjects(), listEvents(),
          listBudgetCodes(), listVendors(),
          listParTemplates().catch(() => ({ templates: [] })),
        ]);
        if (!alive) return;
        setDepartments(depts.items.filter((d) => d.active));
        setProjects(projs.items.filter((p) => p.active));
        setEvents(evts.events.filter((e) => e.active));
        setBudgetCodes(codes.items.filter((c) => c.active));
        setVendors(vends.items.filter((v) => v.active));
        setTemplates(tmplRes.templates ?? []);
      } catch { /* config load is non-blocking */ }
      try {
        const created = await createPar({
          date_of_request: new Date(dateOfRequest).toISOString(),
          purpose, charge_to: chargeTo,
        });
        if (!alive) return;
        setParId(created.id);
        setPar(created);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Eroare la crearea ciornei");
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patchHeader = useCallback(async (id: string) => {
    await updatePar(id, {
      date_of_request: new Date(dateOfRequest).toISOString(),
      requestor_title: requestorTitle || null,
      department_id: departmentId || null,
      date_needed: dateNeeded ? new Date(dateNeeded).toISOString() : null,
      project_id: projectId || null,
      event_id: eventId || null, // VM1-04
      budget_code_id: budgetCodeId || null,
      budget_code_note: budgetCodeNote || null,
      purpose, charge_to: chargeTo, charge_billing_code: null,
      end_use: endUse || null,
      vendor_id: vendorId || null,
      payee_name: payeeName || null, payee_idnp: payeeIdnp || null,
      payee_iban: payeeIban || null, payee_bank: payeeBank || null,
      payee_type: payeeType,
      attachments_present: attachmentsPresent, attachments_note: attachmentsNote || null,
      currency,
    });
  }, [dateOfRequest, requestorTitle, departmentId, dateNeeded, projectId, eventId, budgetCodeId,
      budgetCodeNote, purpose, chargeTo, endUse, vendorId, payeeName,
      payeeIdnp, payeeIban, payeeBank, payeeType, attachmentsPresent, attachmentsNote, currency]);

  // Feature 2: fetch budget balance when a budget code is selected
  useEffect(() => {
    if (!budgetCodeId) { setBudgetBalance(null); return; }
    setBudgetBalanceLoading(true);
    getBudgetCodeBalance(budgetCodeId)
      .then((b) => setBudgetBalance(b))
      .catch(() => setBudgetBalance(null))
      .finally(() => setBudgetBalanceLoading(false));
  }, [budgetCodeId]);

  // Feature 1: Registry company search (debounced 400ms)
  const doRegistrySearch = useCallback((q: string) => {
    if (q.trim().length < 2) { setRegistryResults([]); return; }
    setRegistrySearching(true);
    setRegistryError(null);
    searchRegistryCompanies(q.trim(), 10)
      .then((results) => setRegistryResults(results))
      .catch(() => setRegistryError("Eroare la căutarea în registru"))
      .finally(() => setRegistrySearching(false));
  }, []);

  const onRegistryQueryChange = (q: string) => {
    setRegistryQuery(q);
    if (registryDebounce.current) clearTimeout(registryDebounce.current);
    registryDebounce.current = setTimeout(() => doRegistrySearch(q), 400);
  };

  const onRegistrySelect = (company: RegistryCompany) => {
    setPayeeName(company.name);
    setPayeeIdnp(company.idno ?? "");
    // Selecting from company registry → always juridic
    setPayeeType("juridic");
    setRegistryQuery("");
    setRegistryResults([]);
    setVendorId("");
  };

  // VM1-13: AI Prefill — upload document, extract fields, propose to user
  const handleAiPrefillFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setAiPrefillError(null);
    setAiPrefillResult(null);
    setPayeeCandidates([]);
    setAiPrefilling(true);
    try {
      const result = await prefillParFromDocument(file);
      setAiPrefillResult(result);

      // Common (non-payee) fields always apply, ambiguous or not.
      if (result.endUse.value) setEndUse(String(result.endUse.value));
      if (result.currency.value && ["MDL", "EUR", "USD"].includes(String(result.currency.value))) {
        setCurrency(result.currency.value as "MDL" | "EUR" | "USD");
      }
      // Clear vendor selection so the AI-derived payee takes precedence.
      setVendorId("");

      if (result.needsClarification && result.candidates.length > 0) {
        // 2+ equally-plausible payees → ask the user. DON'T fill name/IBAN/IDNO yet.
        setPayeeCandidates(result.candidates);
      } else {
        // Single resolved payee → fill from the (server-routed) fields.
        setPayeeCandidates([]);
        applyResolvedPayee(result);
      }
    } catch (err) {
      setAiPrefillError(err instanceof Error ? err.message : "Eroare la analiza documentului.");
    } finally {
      setAiPrefilling(false);
    }
  };

  /**
   * Fill the payee fields from a SINGLE resolved prefill result. The server already routed
   * IDNO-vs-IBAN authoritatively (choosePayee/routeIdAndIban), so the frontend no longer guesses;
   * we keep one defensive `isValidMoldovaIBAN` guard so an invalid IBAN never lands in the box.
   */
  const applyResolvedPayee = (result: ParPrefillResult) => {
    if (result.payeeName.value) {
      const extractedName = String(result.payeeName.value);
      setPayeeName(extractedName);
    }
    // payeeType: prefer the server's detection, fall back to the client detector on the name.
    const serverType = result.payeeType?.value ?? null;
    const name = result.payeeName.value ? String(result.payeeName.value) : "";
    const type = serverType ?? detectPayeeType(name);
    if (type) setPayeeType(type);
    // IDNO/IDNP — pre-routed by the server; fill as-is.
    if (result.payeeIdno?.value) setPayeeIdnp(String(result.payeeIdno.value));
    // Feature 3 (PAR-F3): bank name.
    if (result.payeeBank?.value) setPayeeBank(String(result.payeeBank.value));
    // IBAN — defensive: only fill a structurally valid MD IBAN even though the server validated it.
    if (result.payeeIban.value) {
      const ibanRaw = String(result.payeeIban.value).replace(/\s/g, "").toUpperCase();
      if (isValidMoldovaIBAN(ibanRaw)) setPayeeIban(ibanRaw);
    }
  };

  /** User picked one of the candidate payees from the "Care companie e beneficiarul plății?" chooser. */
  const pickCandidate = (c: ParPayeeCandidate) => {
    setPayeeName(c.name);
    setPayeeType(c.payeeType ?? detectPayeeType(c.name) ?? "juridic");
    setPayeeIdnp(c.idno ?? "");
    setPayeeBank(c.bank ?? "");
    // Defensive IBAN guard — leave empty (→ "⚠ de verificat") if it isn't a valid MD IBAN.
    if (c.iban && isValidMoldovaIBAN(c.iban)) {
      setPayeeIban(c.iban.replace(/\s/g, "").toUpperCase());
    } else {
      setPayeeIban("");
    }
    setVendorId("");
    setPayeeCandidates([]); // hide the chooser once a choice is made
  };

  // Feature 3: instantiate a template into the current draft
  const onInstantiateTemplate = async (tmpl: ParTemplate) => {
    if (!tmpl.snapshot) return;
    setShowTemplates(false);
    // Navigate to the instantiated draft instead of the current empty one
    try {
      setBusy(true);
      const { par: newPar } = await instantiateParTemplate(tmpl.id);
      navigate(`/business/par/${newPar.id}`);
    } catch {
      setError("Eroare la pornirea din șablon");
    } finally {
      setBusy(false);
    }
  };

  const onSaveTemplate = async () => {
    if (!parId || !templateName.trim()) return;
    setSavingTemplate(true);
    try {
      await patchHeader(parId);
      const saved = await saveParTemplate({ name: templateName.trim(), parId });
      setTemplates((prev) => [...prev, saved]);
      setTemplateName("");
      setShowSaveTemplate(false);
    } catch {
      setError("Eroare la salvarea șablonului");
    } finally {
      setSavingTemplate(false);
    }
  };

  const addLine = async () => {
    if (!parId) return;
    const qty = parseInt(nlQty, 10);
    const price = parseInt(nlPrice.replace(/[^0-9]/g, ""), 10);
    if (!nlDesc.trim()) return setLineError("Descrierea este obligatorie");
    if (!qty || qty <= 0) return setLineError("Cantitatea trebuie să fie > 0");
    if (isNaN(price) || price < 0) return setLineError("Prețul trebuie să fie ≥ 0");
    setLineError(null); setAddingLine(true);
    try {
      const res = await addLineItem(parId, {
        description: nlDesc.trim(), quantity: qty, unit: nlUnit.trim() || null, unit_price_cents: price,
      });
      setLineItems((p) => [...p, res.line_item]);
      setTotalCents(res.par_total_estimated_cents);
      setAboveThreshold(res.above_micro_threshold);
      setNlDesc(""); setNlQty("1"); setNlUnit(""); setNlPrice("");
      setFieldErrors((p) => { const { line_items, total, ...rest } = p; void line_items; void total; return rest; });
    } catch (e) {
      setLineError(e instanceof Error ? e.message : "Eroare la adăugare");
    } finally { setAddingLine(false); }
  };

  const removeLine = async (lineId: string) => {
    if (!parId) return;
    try {
      const res = await deleteLineItem(parId, lineId);
      setLineItems((p) => p.filter((l) => l.id !== lineId));
      setTotalCents(res.par_total_estimated_cents);
      setAboveThreshold(res.above_micro_threshold);
    } catch { /* non-blocking */ }
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!parId || !e.target.files?.length) return;
    // VM1-06: accept multiple files in one go (max 10 attachments per PAR).
    const MAX_ATTACHMENTS = 10;
    const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    const picked = Array.from(e.target.files);
    e.target.value = "";
    let slots = MAX_ATTACHMENTS - attachments.length;
    if (slots <= 0) return setError(`Maxim ${MAX_ATTACHMENTS} fișiere per cerere.`);
    if (picked.length > slots) {
      setError(`Maxim ${MAX_ATTACHMENTS} fișiere per cerere — se încarcă primele ${slots}.`);
    }
    setUploadingFile(true);
    try {
      for (const file of picked) {
        if (slots <= 0) break;
        if (!ALLOWED.includes(file.type)) { setError(`${file.name}: tip neacceptat (PDF, PNG, JPEG).`); continue; }
        if (file.size > 10 * 1024 * 1024) { setError(`${file.name}: depășește 10 MB.`); continue; }
        const dataUrl = await fileToDataUrl(file);
        const att = await uploadAttachment(parId, {
          file_name: file.name, file_url: dataUrl, mime: file.type, kind: uploadKind, size_bytes: file.size,
        });
        setAttachments((p) => [...p, att]);
        setAttachmentsPresent(true);
        slots--;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la upload");
    } finally { setUploadingFile(false); }
  };

  const onVendorSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value; setVendorId(id);
    const v = vendors.find((x) => x.id === id);
    if (v) {
      setPayeeName(v.name);
      setPayeeIdnp(v.idnp ?? "");
      setPayeeIban(v.iban ?? "");
      setPayeeBank(v.bank ?? "");
      // Feature 1: auto-detect from vendor name
      const detected = detectPayeeType(v.name);
      if (detected) setPayeeType(detected);
    }
  };

  /** Client pre-validation → friendly field errors. Returns true if OK. */
  function clientValidate(): boolean {
    const errs: Record<string, string> = {};
    if (lineItems.length === 0 || totalCents <= 0) errs.line_items = FIELD_MESSAGES.line_items;
    if (payeeIban && !/^MD\d{2}[A-Z0-9]{20}$/.test(payeeIban)) errs.payee_iban = "IBAN invalid — format MD + 2 cifre + 20 caractere.";
    if (payeeIdnp && !/^\d{13}$/.test(payeeIdnp)) errs.payee_idnp = "IDNP trebuie să aibă exact 13 cifre.";
    if (purpose === "execute_payment") {
      if (!endUse.trim()) errs.end_use = FIELD_MESSAGES.end_use;
      const hasPayee = !!vendorId || (!!payeeName.trim() && !!payeeIban.trim());
      if (!hasPayee) errs.payee = FIELD_MESSAGES.payee;
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) {
      setError("Mai sunt câmpuri de completat înainte de trimitere — vezi mai jos.");
      summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  }

  const saveDraft = async () => {
    if (!parId) return;
    setBusy(true); setError(null);
    try { await patchHeader(parId); const fresh = await updatePar(parId, {}); setPar(fresh); }
    catch (e) { setError(e instanceof Error ? e.message : "Eroare la salvare"); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!parId) return;
    setError(null); setFieldErrors({});
    if (!clientValidate()) return;
    setBusy(true);
    try {
      await patchHeader(parId);
      // VM1-05: auto-save EVERY inline beneficiary that has a (valid) IBAN to the registry for
      // reuse — manual or AI-filled, no checkbox needed. The server dedups by IBAN, so re-saving
      // the same beneficiary just links to the existing entry. Non-blocking.
      if (!vendorId && payeeName.trim() && payeeIban.trim()) {
        try {
          await createVendor({
            name: payeeName.trim(),
            idnp: payeeIdnp || null,
            iban: payeeIban.trim().toUpperCase(),
            bank: payeeBank || null,
          });
        } catch { /* non-blocking — don't fail submit if vendor save fails */ }
      }
      const submitted = await submitPar(parId);
      navigate(`/business/par/${submitted.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.details.length) {
        const mapped: Record<string, string> = {};
        for (const d of e.details) mapped[d.field] = FIELD_MESSAGES[d.field] ?? d.message;
        setFieldErrors(mapped);
        setError("Cererea nu a putut fi trimisă — vezi câmpurile marcate mai jos.");
      } else {
        setError(e instanceof Error ? e.message : "Eroare la trimitere");
      }
      summaryRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    } finally { setBusy(false); }
  };

  const requestorName = session?.user ? (session.user.name || session.user.email) : "";
  const isAdmin = session?.user?.role === "admin";
  const summaryErrors = Object.entries(fieldErrors).filter(([, v]) => v);

  // Feature 2: non-blocking budget overage warning
  const budgetOverageWarn =
    budgetBalance &&
    budgetBalance.allocatedCents > 0 &&
    totalCents > 0 &&
    totalCents > budgetBalance.availableCents;

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto px-4 py-6 pb-28 space-y-4">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary flex-shrink-0" aria-hidden />
          <div>
            <h1 className="text-xl font-semibold text-foreground">Cerere nouă de plată (PAR)</h1>
            <p className="text-sm text-muted-foreground">{par?.requestNo ? `Număr: ${par.requestNo}` : "Ciornă nouă"}</p>
          </div>
        </div>

        {/* Validation / error summary */}
        <div ref={summaryRef}>
          {error && (
            <div role="alert" className="rounded-lg bg-destructive/10 text-destructive text-sm p-3 space-y-1">
              <div className="flex items-start gap-2 font-medium">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden /><span>{error}</span>
              </div>
              {summaryErrors.length > 0 && (
                <ul className="list-disc pl-9 space-y-0.5">
                  {summaryErrors.map(([k, v]) => <li key={k}>{v}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* 1–7 Header */}
        <Section n="1–7" title="Antet">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Data cererii" htmlFor="dor" required>
              <input id="dor" type="date" className={inputCls} value={dateOfRequest} onChange={(e) => setDateOfRequest(e.target.value)} />
            </Field>
            <Field label="Scop" htmlFor="purpose" hint="Obținere oferte pornește fluxul de achiziție (RFQ).">
              <select id="purpose" className={inputCls} value={purpose}
                onChange={(e) => setPurpose(e.target.value as ParPurpose)} aria-label="Scopul cererii">
                <option value="execute_payment">Executare plată</option>
                <option value="obtain_quotations">Obținere oferte</option>
                <option value="provide_estimate">Estimare cost</option>
              </select>
            </Field>
            <Field label="Solicitant (nume)" htmlFor="rn">
              <input id="rn" type="text" className={inputCls} value={requestorName} disabled aria-label="Numele solicitantului (din cont)" />
            </Field>
            <Field label="Funcție / Cod" htmlFor="rt">
              <input id="rt" type="text" placeholder="ex. Procurement Specialist / M13" className={inputCls} value={requestorTitle} onChange={(e) => setRequestorTitle(e.target.value)} />
            </Field>
            <Field label="Departament" htmlFor="dep">
              <select id="dep" className={inputCls} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} aria-label="Departament">
                <option value="">— Selectează —</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Data necesară" htmlFor="dn" hint="Opțional">
              <input id="dn" type="date" className={inputCls} value={dateNeeded} min={dateOfRequest} onChange={(e) => setDateNeeded(e.target.value)} />
            </Field>
            <Field label="Proiect / Program" htmlFor="proj">
              <select id="proj" className={inputCls} value={projectId}
                onChange={(e) => { setProjectId(e.target.value); setEventId(""); }}
                aria-label="Proiect">
                <option value="">— Selectează —</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            {/* VM1-04: Event — filtered by selected project */}
            {(() => {
              const filteredEvents = projectId
                ? events.filter((ev) => ev.projectId === projectId)
                : events;
              return filteredEvents.length > 0 ? (
                <Field label="Eveniment" htmlFor="evtId">
                  <select id="evtId" className={inputCls} value={eventId}
                    onChange={(e) => setEventId(e.target.value)}
                    aria-label="Eveniment">
                    <option value="">— Selectează —</option>
                    {filteredEvents.map((ev) => (
                      <option key={ev.id} value={ev.id}>{ev.name}</option>
                    ))}
                  </select>
                </Field>
              ) : null;
            })()}
            <Field label="Cod bugetar" htmlFor="bc">
              <select id="bc" className={inputCls} value={budgetCodeId} onChange={(e) => setBudgetCodeId(e.target.value)} aria-label="Cod bugetar">
                <option value="">— Selectează —</option>
                {budgetCodes.map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
              </select>
              {/* Feature 2: budget balance */}
              {budgetCodeId && (
                budgetBalanceLoading ? (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" aria-hidden />Se calculează soldul...
                  </span>
                ) : budgetBalance ? (
                  <span className={cn(
                    "text-xs font-medium flex items-center gap-1",
                    budgetBalance.availableCents <= 0 && budgetBalance.allocatedCents > 0
                      ? "text-destructive"
                      : "text-emerald-600 dark:text-emerald-400"
                  )}>
                    {budgetBalance.allocatedCents > 0
                      ? `Disponibil: ${formatMDL(budgetBalance.availableCents)} din ${formatMDL(budgetBalance.allocatedCents)}`
                      : "Fără plafon alocat"}
                  </span>
                ) : null
              )}
              {isAdmin && (
                <a href="#/business/par/admin" className="text-xs text-primary hover:underline w-fit">
                  Gestionează codurile / departamentele / proiectele în Admin →
                </a>
              )}
            </Field>
            <Field label="Notă cod bugetar" htmlFor="bcn">
              <input id="bcn" type="text" placeholder="ex. conform planificării lunare" className={inputCls} value={budgetCodeNote} onChange={(e) => setBudgetCodeNote(e.target.value)} />
            </Field>
          </div>
        </Section>

        {/* 10 Line items */}
        <Section id="sec-lines" n="10" title="Articole / Servicii solicitate">
          {fieldErrors.line_items && (
            <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" aria-hidden />{fieldErrors.line_items}</p>
          )}
          {lineItems.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-3 font-medium">#</th><th className="pb-2 pr-3 font-medium">Descriere</th>
                    <th className="pb-2 pr-3 font-medium text-right">Cant.</th><th className="pb-2 pr-3 font-medium">UM</th>
                    <th className="pb-2 pr-3 font-medium text-right">Preț/u</th><th className="pb-2 pr-3 font-medium text-right">Total</th>
                    <th className="pb-2 font-medium"></th>
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
                        <button type="button" aria-label={`Șterge rândul ${li.position}`} onClick={() => removeLine(li.id)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add row — description full width, then qty/UM/price below */}
          <div className="rounded-lg border border-dashed border-border p-4 space-y-3">
            <Field label="Descriere / Specificații" htmlFor="nlDesc">
              <input id="nlDesc" type="text" placeholder="ex. Servicii de consultanță psihologică de grup, 120–180 min, pe Zoom"
                className={inputCls} value={nlDesc}
                onChange={(e) => setNlDesc(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLine()} />
            </Field>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:max-w-md">
              <Field label="Cant." htmlFor="nlQty"><input id="nlQty" type="number" min="1" className={inputCls} value={nlQty} onChange={(e) => setNlQty(e.target.value)} /></Field>
              <Field label="UM" htmlFor="nlUnit"><input id="nlUnit" type="text" placeholder="sesie" className={inputCls} value={nlUnit} onChange={(e) => setNlUnit(e.target.value)} /></Field>
              {/* Price is entered in the PAR's selected currency — keep the label in sync so the
                  user doesn't type MDL amounts while the request is in EUR/USD. */}
              <Field label={`Preț/u (${currency})`} htmlFor="nlPrice"><input id="nlPrice" type="number" min="0" placeholder="7000" className={inputCls} value={nlPrice}
                onChange={(e) => setNlPrice(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addLine()} /></Field>
            </div>
            {lineError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" aria-hidden />{lineError}</p>}
            <button type="button" onClick={addLine} disabled={addingLine || !parId}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[44px]">
              {addingLine ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}Adaugă articol
            </button>
          </div>

          <div className={cn("flex items-center justify-between p-3 rounded-lg",
            aboveThreshold ? "bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800" : "bg-muted")}>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-foreground">TOTAL ESTIMAT</span>
              {/* VF-203: currency selector (draft only) */}
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as typeof currency)}
                aria-label="Monedă"
                className="rounded-md border border-input bg-background text-xs px-2 py-1 min-h-[36px]"
              >
                <option value="MDL">MDL</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <span className={cn("text-base font-semibold", aboveThreshold ? "text-orange-700 dark:text-orange-300" : "text-foreground")}>{fmtMoney(totalCents, currency)}</span>
          </div>
          {currency !== "MDL" && (
            <p className="text-xs text-muted-foreground text-right">
              Cursul oficial BNM se aplică la trimitere; pragul de aprobare se calculează în MDL.
            </p>
          )}
          {aboveThreshold && (
            <p className="text-xs text-orange-600 dark:text-orange-400 flex items-start gap-1.5">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden />
              Peste pragul micro-achiziție. Dacă plata finală depășește estimarea cu peste 10%, e nevoie de re-aprobare.
            </p>
          )}
        </Section>

        {/* VF-501: quotes (RFQ) — only for obtain_quotations PARs */}
        {purpose === "obtain_quotations" && parId && (
          <QuotesSection parId={parId} vendors={vendors} />
        )}

        {/* 11 End-use */}
        <Section n="11" title="Descrierea utilizării finale (End-use)">
          <Field label="Descriere" htmlFor="endUse" required={purpose === "execute_payment"} error={fieldErrors.end_use}>
            <textarea id="endUse" rows={7}
              placeholder="Descrie detaliat serviciile/bunurile primite — ex. „Servicii de consultanță psihologică de grup, organizate în cadrul proiectului Digital Safeguard, cu durata de 120–180 min, pe platforma Zoom, pentru beneficiarii proiectului.”"
              className="min-h-[150px] rounded-md border border-input bg-background px-3 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full resize-y"
              value={endUse} onChange={(e) => { setEndUse(e.target.value); setFieldErrors((p) => ({ ...p, end_use: "" })); }} />
          </Field>
        </Section>

        {/* 12 Payee */}
        <Section n="12" title="Beneficiar plată (Payee)">
          {fieldErrors.payee && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" aria-hidden />{fieldErrors.payee}</p>}

          {/* Feature 1: Tip beneficiar toggle */}
          <div className="flex items-center gap-2 mb-3" role="group" aria-label="Tip beneficiar">
            <span className="text-sm font-medium text-foreground">Tip beneficiar:</span>
            <button
              type="button"
              onClick={() => setPayeeType("fizic")}
              aria-pressed={payeeType === "fizic"}
              className={cn(
                "px-3 py-1.5 rounded-l-md border text-sm font-medium transition-colors min-h-[36px]",
                payeeType === "fizic"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted"
              )}
            >
              Persoană fizică
            </button>
            <button
              type="button"
              onClick={() => setPayeeType("juridic")}
              aria-pressed={payeeType === "juridic"}
              className={cn(
                "px-3 py-1.5 rounded-r-md border-t border-b border-r text-sm font-medium transition-colors min-h-[36px]",
                payeeType === "juridic"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-foreground border-border hover:bg-muted"
              )}
            >
              Persoană juridică
            </button>
          </div>

          {/* VM1-13: AI Prefill — upload document to auto-fill payee/IBAN/scope */}
          <div className="flex flex-wrap items-center gap-2 pb-3 border-b border-border mb-2">
            <button
              type="button"
              onClick={() => aiPrefillFileRef.current?.click()}
              disabled={aiPrefilling || !parId}
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors min-h-[44px] disabled:opacity-50"
              aria-label="Completează automat din document"
              title={!parId ? "Salvează cererea mai întâi" : "Încarcă un document pentru a extrage câmpurile automat"}
            >
              {aiPrefilling ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              {aiPrefilling ? "Se analizează..." : "Completează automat din document"}
            </button>
            <span className="text-xs text-muted-foreground">
              AI extrage beneficiarul, IBAN-ul și scopul dintr-o factură/contract. Tu confirmi.
            </span>
            <input
              ref={aiPrefillFileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv"
              className="sr-only"
              aria-label="Alege document pentru analiză AI"
              onChange={handleAiPrefillFile}
            />
          </div>

          {/* AI prefill error */}
          {aiPrefillError && (
            <div role="alert" className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
              <span>{aiPrefillError}</span>
            </div>
          )}

          {/* AI prefill result panel */}
          {aiPrefillResult && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 mb-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-1.5 font-medium text-foreground">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                Câmpuri propuse de AI {aiPrefillResult.isStub && <span className="text-xs text-muted-foreground font-normal">(demo)</span>}
              </div>

              {/* Non-financial document guard */}
              {aiPrefillResult.documentClass.not_financial && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-warning/10 border border-warning/30 text-foreground text-xs">
                  <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-warning" aria-hidden />
                  <span>
                    Documentul nu pare a fi o factură sau bon financiar
                    {aiPrefillResult.documentClass.reason && ` — ${aiPrefillResult.documentClass.reason}`}.
                    Câmpurile precompletate pot fi incorecte.
                  </span>
                </div>
              )}

              {/* Per-field confidence indicators (only when a single payee was resolved) */}
              {!aiPrefillResult.needsClarification && [
                { label: "Beneficiar", field: aiPrefillResult.payeeName },
                { label: "IDNO/IDNP", field: aiPrefillResult.payeeIdno },
                { label: "IBAN", field: aiPrefillResult.payeeIban },
                { label: "Scop", field: aiPrefillResult.endUse },
              ].map(({ label, field }) => (
                field.value !== null && String(field.value) !== "" && (
                  <div key={label} className="flex items-baseline gap-2 text-xs">
                    <span className="text-muted-foreground w-16 flex-shrink-0">{label}:</span>
                    <span className="text-foreground truncate max-w-xs">{String(field.value)}</span>
                    {field.low_confidence && (
                      <span className="text-warning text-[10px] flex-shrink-0 ml-auto">⚠ de verificat</span>
                    )}
                  </div>
                )
              ))}
              {!aiPrefillResult.needsClarification && (
                <p className="text-xs text-muted-foreground pt-1">
                  Câmpurile de mai jos au fost completate. Verifică și corectează înainte de trimitere.
                </p>
              )}
            </div>
          )}

          {/* PAR AI overhaul: ambiguous payee → ask the user which company is the payee */}
          {payeeCandidates.length > 0 && (
            <div
              role="radiogroup"
              aria-label="Care companie e beneficiarul plății?"
              className="rounded-lg border border-primary/40 bg-primary/5 p-3 mb-3 space-y-2"
            >
              <p className="text-sm font-medium text-foreground flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-primary" aria-hidden />
                Care companie e beneficiarul plății?
              </p>
              <p className="text-xs text-muted-foreground">
                Documentul conține mai mulți posibili beneficiari. Alege cine primește plata:
              </p>
              <div className="space-y-2">
                {payeeCandidates.map((c) => (
                  <button
                    key={`${c.name}-${c.idno ?? ""}-${c.iban ?? ""}`}
                    type="button"
                    onClick={() => pickCandidate(c)}
                    className="touch-target w-full text-left rounded-lg border border-border bg-card hover:border-primary hover:bg-accent transition-colors p-3 space-y-0.5"
                  >
                    <span className="block font-medium text-foreground">{c.name}</span>
                    {c.idno && (
                      <span className="block text-xs text-muted-foreground">IDNO {c.idno}</span>
                    )}
                    {c.iban && (
                      <span className="block text-xs text-muted-foreground">
                        {c.iban}
                        {c.ibanForeign && (
                          <span className="text-warning"> (IBAN non-MD ⚠)</span>
                        )}
                      </span>
                    )}
                    {c.bank && (
                      <span className="block text-xs text-muted-foreground">{c.bank}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Feature 1: Registry search — only for juridic (companies) */}
          {payeeType === "juridic" && <Field label="Caută companie (contafirm.md)" htmlFor="reg-q" hint="Introdu cel puțin 2 caractere — caută după nume sau IDNO">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" aria-hidden />
              <input
                id="reg-q"
                type="text"
                className={cn(inputCls, "pl-9")}
                value={registryQuery}
                onChange={(e) => onRegistryQueryChange(e.target.value)}
                placeholder="ex. ATIC sau 1002600020555"
                autoComplete="off"
                aria-label="Caută companie în registrul contafirm.md"
              />
              {registrySearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
            </div>
            {registryError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" aria-hidden />{registryError}
              </p>
            )}
            {registryResults.length > 0 && (
              <ul className="mt-1 rounded-lg border border-border bg-popover shadow-md divide-y divide-border max-h-52 overflow-y-auto" role="listbox" aria-label="Rezultate căutare companie">
                {registryResults.map((co) => (
                  <li key={co.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={false}
                      onClick={() => onRegistrySelect(co)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors flex items-start gap-2 min-h-[44px]"
                    >
                      <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" aria-hidden />
                      <span>
                        <span className="font-medium text-foreground block">{co.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {co.idno && <span>IDNO: {co.idno}</span>}
                          {co.city && <span className="ml-2">{co.city}</span>}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>}

          {vendors.length > 0 && (
            <Field label="Beneficiar salvat" htmlFor="vsel" hint="Alege un beneficiar din registru sau introdu manual mai jos">
              <select id="vsel" className={inputCls} value={vendorId} onChange={onVendorSelect} aria-label="Beneficiar salvat">
                <option value="">— Introducere manuală —</option>
                {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={payeeType === "fizic" ? "Nume, Prenume" : "Denumire companie"}
              htmlFor="pn"
            >
              <input
                id="pn"
                type="text"
                placeholder={payeeType === "fizic" ? "ex. Roitman Daria" : "ex. ATIC SRL"}
                className={inputCls}
                value={payeeName}
                onChange={(e) => {
                  setPayeeName(e.target.value);
                  setVendorId("");
                  // Auto-detect as user types (only override if detector is confident)
                  const detected = detectPayeeType(e.target.value);
                  if (detected) setPayeeType(detected);
                }}
              />
            </Field>
            <Field
              label={payeeType === "fizic" ? "IDNP" : "IDNO"}
              htmlFor="pi"
              hint="13 cifre"
              error={fieldErrors.payee_idnp}
            >
              <input id="pi" type="text" maxLength={13} placeholder="2008001007903" value={payeeIdnp}
                className={cn(inputCls, fieldErrors.payee_idnp && "border-destructive")}
                onChange={(e) => { setPayeeIdnp(e.target.value); setFieldErrors((p) => ({ ...p, payee_idnp: "" })); }} />
            </Field>
            <Field label="IBAN" htmlFor="pb" hint="MD + 2 cifre + 20 caractere" error={fieldErrors.payee_iban}>
              <input id="pb" type="text" maxLength={34} placeholder="MD48ML000002259A19498121" value={payeeIban}
                className={cn(inputCls, fieldErrors.payee_iban && "border-destructive")}
                onChange={(e) => { setPayeeIban(e.target.value.toUpperCase()); setFieldErrors((p) => ({ ...p, payee_iban: "" })); }} />
            </Field>
            <Field label="Bancă" htmlFor="pbk"><input id="pbk" type="text" placeholder="ex. BC Moldindconbank S.A." className={inputCls} value={payeeBank} onChange={(e) => setPayeeBank(e.target.value)} /></Field>
          </div>
          {!vendorId && payeeName.trim() && payeeIban.trim() && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" aria-hidden />
              Beneficiarul cu IBAN se salvează automat în registru pentru reutilizare.
            </p>
          )}
          <p className="text-xs text-muted-foreground">Datele beneficiarului sunt confidențiale (GDPR) — vizibile doar solicitantului, aprobatorilor și finanțelor.</p>
        </Section>

        {/* 13 Attachments */}
        <Section n="13" title="Atașamente">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Tip document" htmlFor="uk">
              <select id="uk" className={inputCls} value={uploadKind} onChange={(e) => setUploadKind(e.target.value as ParAttachmentKind)} aria-label="Tip document">
                {(Object.entries(ATTACHMENT_KIND_LABELS) as [ParAttachmentKind, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <label className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium cursor-pointer hover:bg-secondary/80 transition-colors min-h-[44px]",
              (uploadingFile || !parId || attachments.length >= 10) && "opacity-50 cursor-not-allowed"
            )}>
              {uploadingFile ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
              <span>Încarcă fișiere</span>
              <input type="file" multiple className="sr-only" accept=".pdf,.png,.jpg,.jpeg" onChange={onUpload} disabled={uploadingFile || !parId || attachments.length >= 10} aria-label="Alege fișierele" />
            </label>
            <span className="text-xs text-muted-foreground">PDF, PNG, JPEG — max 10 MB · {attachments.length}/10 fișiere</span>
          </div>
          {attachments.length > 0 && (
            <ul className="space-y-2" aria-label="Fișiere atașate">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted">
                  <span className="flex items-center gap-2 min-w-0">
                    <Paperclip className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground truncate">{a.fileName}</span>
                      <span className="block text-xs text-muted-foreground">{ATTACHMENT_KIND_LABELS[a.kind]}</span>
                    </span>
                  </span>
                  <button type="button" aria-label={`Șterge ${a.fileName}`} onClick={async () => { if (parId) { try { await deleteAttachment(parId, a.id); setAttachments((p) => p.filter((x) => x.id !== a.id)); } catch { /* */ } } }}
                    className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center flex-shrink-0">
                    <X className="h-4 w-4" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Field label="Descriere atașamente (opțional)" htmlFor="anote">
            <input id="anote" type="text" placeholder="ex. Contract + act de primire" className={inputCls} value={attachmentsNote} onChange={(e) => setAttachmentsNote(e.target.value)} />
          </Field>
        </Section>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 z-20 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-3xl mx-auto px-4 py-3 space-y-2">
          {/* Feature 2: non-blocking budget overage warning */}
          {budgetOverageWarn && (
            <div role="status" className="flex items-center gap-2 p-2 rounded-md bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300 text-xs">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
              <span>Depășește bugetul disponibil pentru acest cod ({formatMDL(budgetBalance!.availableCents)} disponibil)</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm">
              <span className="text-muted-foreground">Total estimat: </span>
              <span className={cn("font-semibold", aboveThreshold ? "text-orange-600 dark:text-orange-400" : "text-foreground")}>{formatMDL(totalCents)}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {/* Feature 3: Templates */}
              {templates.length > 0 && (
                <div className="relative">
                  <button type="button" onClick={() => setShowTemplates((v) => !v)}
                    disabled={busy}
                    aria-label="Pornește din șablon"
                    aria-expanded={showTemplates}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors min-h-[44px]">
                    <BookOpen className="h-4 w-4" aria-hidden />Șabloane
                  </button>
                  {showTemplates && (
                    <div className="absolute bottom-full mb-1 right-0 w-64 rounded-lg border border-border bg-popover shadow-lg z-30 overflow-hidden">
                      <p className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border">Pornește din șablon</p>
                      <ul role="listbox" aria-label="Șabloane disponibile">
                        {templates.map((t) => (
                          <li key={t.id}>
                            <button type="button" role="option" aria-selected={false}
                              onClick={() => onInstantiateTemplate(t)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors min-h-[44px] text-foreground">
                              {t.name}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
              {/* Feature 3: Save as template */}
              {parId && (
                showSaveTemplate ? (
                  <div className="flex items-center gap-1">
                    <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="Nume șablon" className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-36"
                      aria-label="Numele șablonului" onKeyDown={(e) => e.key === "Enter" && onSaveTemplate()} />
                    <button type="button" onClick={onSaveTemplate} disabled={savingTemplate || !templateName.trim()}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 disabled:opacity-50 transition-colors min-h-[36px]"
                      aria-label="Confirmă salvarea șablonului">
                      {savingTemplate ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
                      OK
                    </button>
                    <button type="button" onClick={() => { setShowSaveTemplate(false); setTemplateName(""); }}
                      className="flex items-center px-2 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted min-h-[36px]"
                      aria-label="Anulează salvarea șablonului">
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowSaveTemplate(true)} disabled={busy}
                    aria-label="Salvează ca șablon"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors min-h-[44px]">
                    <BookmarkPlus className="h-4 w-4" aria-hidden />Salvează ca șablon
                  </button>
                )
              )}
              <button type="button" onClick={saveDraft} disabled={busy || !parId}
                className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 transition-colors min-h-[44px]">
                <Save className="h-4 w-4" aria-hidden />Salvează ciornă
              </button>
              <button type="button" onClick={submit} disabled={busy || !parId} aria-label="Trimite cererea pentru aprobare"
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors min-h-[44px]">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}Trimite pentru aprobare
              </button>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
