/**
 * PAR-112 — /business/par/finance
 *
 * Finance queue: lista de PAR-uri aprobate (execute_payment) + cele in_finance / reapproval_required.
 * Acțiuni:
 *   - Completare secțiune 16 (PAR BL / Received By / Assigned To) → PAR → in_finance
 *   - Înregistrare plată (suma reală, dată, referință, dovadă) → PAR → paid sau reapproval_required
 *   - Vizualizare status 10%-overage cu notă de re-aprobare necesară
 *   - VM4-05: arhivare — cererile moarte ies din lista de lucru într-un tab separat, reversibil
 *
 * CORE: backlog/par/PAR-CORE.md §0.16, §3, §4, §6
 * Design system: Vector 365 tokens only, light + dark, WCAG AA
 */
import { useState, useEffect, useCallback } from "react";
import {
  Loader2,
  BanknoteIcon,
  AlertCircle,
  RefreshCcw,
  CheckCircle2,
  ClipboardList,
  User,
  Paperclip,
  Copy,
  Check,
  FileText,
  X,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import {
  Alert,
  Button,
  Card,
  Input,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  Textarea,
} from "@/components/ds";
import { ParStatusChip } from "@/components/par/ParStatusChip";
import { ParBackdatedBadge } from "@/components/par/ParBackdatedBadge";
import { ParUrgentBadge } from "@/components/par/ParUrgentBadge";
import {
  getFinanceQueue,
  submitSection16,
  executePayment,
  financeReturnPar,
  financeArchivePar,
  financeUnarchivePar,
  uploadAttachmentDirect,
  reconcileInBackground,
  listAttachments,
  formatMDL,
  formatCurrency,
  downloadDosar,
  type ParFinanceQueueItem,
  type ParFinanceReturn,
  type ParFinanceArchive,
  type ParAttachment,
  type Section16Payload,
  type PayPayload,
} from "@/lib/api/par";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL, attachmentTooLargeMessage } from "@/lib/par/attachmentLimits";
import { viewParAttachment } from "@/lib/parFiles";
import { attachmentKindLabel } from "@/lib/par/attachmentKinds";
import { useRouter } from "@/router/HashRouter";
import { cn } from "@/lib/utils";
import { useIsPhone } from "@/hooks/useIsPhone";

// ─── Section-16 modal ─────────────────────────────────────────────────────────

interface Section16ModalProps {
  par: ParFinanceQueueItem;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Escape închide dialogul. Cele trei modale de aici sunt scrise de mână (fără bibliotecă de
 * dialog), așa că tasta trebuia legată explicit: fără ea, un utilizator care lucrează de la
 * tastatură rămâne blocat în dialog și trebuie să găsească butonul „Anulare" cu mouse-ul.
 */
function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

function Section16Modal({ par, onClose, onSaved }: Section16ModalProps) {
  useEscapeToClose(onClose);
  const [parBl, setParBl] = useState(par.payment?.parBl ?? "");
  const [receivedBy, setReceivedBy] = useState(par.payment?.receivedByUserId ?? "");
  const [assignedTo, setAssignedTo] = useState(par.payment?.assignedToUserId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: Section16Payload = {
        par_bl: parBl.trim() || null,
        received_by_user_id: receivedBy.trim() || null,
        assigned_to_user_id: assignedTo.trim() || null,
      };
      await submitSection16(par.id, payload);
      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Eroare la salvare");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="s16-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-lg">
        <h2 id="s16-title" className="text-lg font-semibold text-card-foreground">
          Secțiunea 16 — Payment Internal Use Only
        </h2>
        <p className="text-sm text-muted-foreground">
          {par.requestNo} · {parAmount(par.totalEstimatedCents, par.currency)}
          {mdlHint(par) ? ` · ${mdlHint(par)}` : ""}
        </p>

        {error && (
          <div role="alert" className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label htmlFor="par-bl" className="block text-sm font-medium text-foreground mb-1">
              PAR BL (budget line)
            </label>
            <Input
              id="par-bl"
              type="text"
              value={parBl}
              onChange={(e) => setParBl(e.target.value)}
              placeholder="ex. OPS-2026-07"
              maxLength={200}
                          />
          </div>

          <div>
            <label htmlFor="received-by" className="block text-sm font-medium text-foreground mb-1">
              Received By (user ID sau nume)
            </label>
            <Input
              id="received-by"
              type="text"
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              placeholder="ID sau lăsați gol (se va folosi userul curent)"
              maxLength={200}
                          />
          </div>

          <div>
            <label htmlFor="assigned-to" className="block text-sm font-medium text-foreground mb-1">
              Assigned To (user ID)
            </label>
            <Input
              id="assigned-to"
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="ID utilizator responsabil"
              maxLength={200}
                          />
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-input bg-background text-sm text-foreground hover:bg-accent transition-colors"
          >
            Anulare
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvează și trimite la finanțe
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pay modal ────────────────────────────────────────────────────────────────

interface PayModalProps {
  par: ParFinanceQueueItem;
  onClose: () => void;
  onPaid: () => void;
  /** VM4-02: deschide dialogul de refuz al plății pentru aceeași cerere. */
  onRefuse: () => void;
}

/** Convert a "1234.56" / "1234,56" MDL string to integer cents. */
function mdlStringToCents(s: string): number {
  const major = parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(major) ? Math.round(major * 100) : NaN;
}

/**
 * Suma unei cereri se scrie în MONEDA ei.
 *
 * `formatMDL` pe `totalEstimatedCents` scria „1.500,00 L" pentru o cerere de 1.500 USD — aceeași
 * greșeală care apărea și în inboxul aprobatorului (PAR-2026-0027). Aici cântărește mai mult:
 * ecranele astea sunt cele pe care se execută plata.
 */
function parAmount(cents: number, currency: string | null | undefined): string {
  return formatCurrency(cents, currency);
}

/** Echivalentul în lei, scris ca linie secundară — există doar pentru cererile în valută. */
function mdlHint(par: { currency: string; totalMdlCents?: number | null }): string | null {
  return par.currency && par.currency !== "MDL" && par.totalMdlCents != null
    ? `≈ ${formatMDL(par.totalMdlCents)}`
    : null;
}

/** Ce scrie sub buton la fiecare pas — în cuvintele omului de la finanțe, nu ale sistemului. */
const PAY_STEP_LABEL: Record<"upload" | "verify" | "pay", string> = {
  upload: "Se urcă ordinul de plată…",
  verify: "Se verifică fișierul și se atașează la dosar…",
  pay: "Se înregistrează plata și e anunțat solicitantul…",
};

function PayModal({ par, onClose, onPaid, onRefuse }: PayModalProps) {
  useEscapeToClose(onClose);
  // Suma reală se introduce în MONEDA CERERII — serverul o compară direct cu estimatul când aplică
  // regula de 10% (applyTenRule), deci un câmp etichetat „MDL" pe o cerere în USD ar fi trimis lei
  // într-o comparație făcută în dolari. Se pre-completează cu estimatul integral, editabilă.
  const [actualAmountMdl, setActualAmountMdl] = useState(
    (((par.payment?.actualAmountCents ?? par.totalEstimatedCents) || 0) / 100).toFixed(2)
  );
  const [paymentDate, setPaymentDate] = useState(
    par.payment?.paymentDate
      ? new Date(par.payment.paymentDate).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10)
  );
  const [paymentRef, setPaymentRef] = useState(par.payment?.paymentRef ?? "");
  const [proofFile, setProofFile] = useState<File | null>(null);
  // VM4-04: print screen-ul din bancă vine din clipboard, nu dintr-un fișier salvat pe disc.
  const [proofPasted, setProofPasted] = useState(false);
  // VM4-03: pasul de confirmare. „Din greșeală am apăsat plătit" — un singur click nu mai
  // schimbă statutul cererii; a doua apăsare se face pe un rezumat al plății.
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  /**
   * La ce pas suntem. Confirmarea plății nu e o singură cerere: fișierul urcă în Storage, serverul
   * îl verifică și abia apoi se scrie plata și pleacă notificarea. Owner-ul, 13.09: „confirmarea e
   * foarte lentă" — jumătate din problemă era că butonul nu spunea NIMIC în tot acest timp, deci
   * secundele arătau ca o aplicație blocată, nu ca o treabă în curs.
   */
  const [step, setStep] = useState<null | "upload" | "verify" | "pay">(null);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  // VM1-05: show "salvat în registru ✓" indicator when vendor was auto-saved on payment
  const [vendorAutoSaved, setVendorAutoSaved] = useState(false);

  // Warn user when amount exceeds +10%
  const updateWarning = (mdlStr: string) => {
    const amt = mdlStringToCents(mdlStr);
    if (!isNaN(amt) && par.above_micro_threshold) {
      const max = Math.floor((par.totalEstimatedCents * 110) / 100);
      setWarning(
        amt > max
          ? `Suma (${parAmount(amt, par.currency)}) depășește estimatul cu >10% (max ${parAmount(max, par.currency)}). ` +
              "Va fi necesar un re-aprobare înainte de plată."
          : null
      );
    } else {
      setWarning(null);
    }
  };

  // VM4-04 — Violeta: „de inserat printr-un comentariu ca imagine când fac print screen la ordinul
  // de plată". Ordinul de plată e pe ecran exact în momentul plății, dar nu ca fișier: e în
  // clipboard. Ctrl+V oriunde în dialog îl atașează, fără drumul prin „salvează pe desktop".
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      e.preventDefault();
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(attachmentTooLargeMessage("Imaginea lipită"));
        return;
      }
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      setError(null);
      setProofFile(new File([file], `ordin-de-plata-${stamp}.png`, { type: file.type || "image/png" }));
      setProofPasted(true);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const handlePay = async () => {
    const amt = mdlStringToCents(actualAmountMdl);
    if (isNaN(amt) || amt <= 0) {
      setError(`Suma reală trebuie să fie un număr pozitiv (în ${par.currency || "MDL"}).`);
      setConfirming(false);
      return;
    }
    // PERF: uploaded as base64 JSON — see attachmentLimits.ts for why the cap is 3 MB, not 10.
    // Checked again here (not just in the file input's onChange) in case a bigger file was
    // dropped in some other way; the upload must never even attempt an oversized payload.
    if (proofFile && proofFile.size > MAX_ATTACHMENT_BYTES) {
      setError(attachmentTooLargeMessage(proofFile.name));
      return;
    }

    setSaving(true);
    setStep(proofFile ? "upload" : "pay");
    setError(null);
    try {
      // Attach the payment-confirmation PDF to the dossier (section 13) BEFORE recording the payment.
      if (proofFile) {
        const att = await uploadAttachmentDirect(par.id, proofFile, {
          // Tipul real, nu „Altul": dosarul trebuie să arate un ordin de plată acolo unde e unul,
          // iar ecranul de dovezi știe astfel care cereri plătite mai au nevoie de dovadă.
          kind: "payment_order",
          fileName: `Ordin de plată — ${par.requestNo}${proofFile.name ? ` (${proofFile.name})` : ""}`,
          onStep: (s) => setStep(s === "upload" ? "upload" : "verify"),
        });
        reconcileInBackground(par.id, att.id);
      }
      setStep("pay");
      const payload: PayPayload = {
        actual_amount_cents: amt,
        payment_date: paymentDate,
        payment_ref: paymentRef.trim() || null,
      };
      const result = await executePayment(par.id, payload);
      // VM1-05: if vendor was auto-saved (new vendorId on the returned PAR, previously none),
      // show indicator briefly before closing the modal.
      const autoSaved =
        result.status === "paid" &&
        !par.vendorId &&
        !!result.par.vendorId;
      if (autoSaved) {
        setVendorAutoSaved(true);
        // Give the user 2 seconds to see the indicator, then close
        await new Promise<void>((res) => setTimeout(res, 2000));
      }
      onPaid();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Eroare la procesarea plății");
    } finally {
      setSaving(false);
      setStep(null);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pay-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-lg">
        <h2 id="pay-title" className="text-lg font-semibold text-card-foreground">
          Înregistrare plată
        </h2>
        <p className="text-sm text-muted-foreground">
          {par.requestNo} · Estimat: {parAmount(par.totalEstimatedCents, par.currency)}
          {mdlHint(par) ? ` · ${mdlHint(par)}` : ""}
        </p>

        {par.above_micro_threshold && (
          <div className="text-xs text-muted-foreground bg-muted rounded px-3 py-2">
            Regula 10%: suma reală nu poate depăși estimatul cu mai mult de 10% fără re-aprobare.
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}
        {warning && (
          <Alert variant="warning" icon={<AlertCircle className="h-4 w-4" />}>
            {warning}
          </Alert>
        )}

        {/* VM1-05: auto-save vendor indicator — shown briefly after successful payment */}
        {vendorAutoSaved && (
          <Alert variant="success" icon={<CheckCircle2 className="h-4 w-4" />}>
            Prestator salvat în registru ✓
          </Alert>
        )}

        <div className="space-y-3">
          <div>
            <label htmlFor="actual-amount" className="block text-sm font-medium text-foreground mb-1">
              Suma reală ({par.currency || "MDL"}) <span aria-hidden="true" className="text-destructive">*</span>
            </label>
            <Input
              id="actual-amount"
              type="number"
              min={0}
              step="0.01"
              value={actualAmountMdl}
              onChange={(e) => {
                setActualAmountMdl(e.target.value);
                updateWarning(e.target.value);
              }}
              placeholder="ex. 7000"
                          />
            <p className="text-xs text-muted-foreground mt-1">
              Pre-completat cu suma estimată ({parAmount(par.totalEstimatedCents, par.currency)}). Schimbă dacă plata reală diferă.
            </p>
          </div>

          <div>
            <label htmlFor="payment-date" className="block text-sm font-medium text-foreground mb-1">
              Data plății <span aria-hidden="true" className="text-destructive">*</span>
            </label>
            <Input
              id="payment-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
                          />
          </div>

          <div>
            <label htmlFor="payment-ref" className="block text-sm font-medium text-foreground mb-1">
              Referință plată <span className="text-muted-foreground font-normal">(opțional)</span>
            </label>
            <Input
              id="payment-ref"
              type="text"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="ex. OP-2026-0047"
              maxLength={500}
                          />
          </div>

          <div>
            <label htmlFor="proof-file" className="block text-sm font-medium text-foreground mb-1">
              Ordinul de plată <span className="font-normal text-muted-foreground">(PDF sau imagine, opțional)</span>
            </label>
            <Input
              id="proof-file"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f && f.size > MAX_ATTACHMENT_BYTES) {
                  setError(attachmentTooLargeMessage(f.name));
                  e.target.value = "";
                  setProofFile(null);
                  return;
                }
                setError(null);
                setProofFile(f);
                setProofPasted(false);
              }}
              className="w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-primary/90 file:cursor-pointer"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {proofFile
                ? `Se atașează la dosar ca „Ordin de plată": ${proofFile.name}${proofPasted ? " — lipit din clipboard" : ""}`
                : `Fă print screen la ordinul de plată din bancă și apasă Ctrl+V aici — se atașează la dosar (max ${MAX_ATTACHMENT_LABEL}).`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Extrasul ștampilat de bancă, care vine a doua zi, se adaugă mai târziu — pentru toate
              plățile odată — din <span className="font-medium">Finanțe → Dovezi de plată</span>.
            </p>
          </div>
        </div>

        {/* VM4-03: rezumatul plății, arătat între cele două clickuri. Statutul „Plătită" e
            ireversibil pentru solicitant (primește notificare pe loc), deci merită o secundă de
            citit: cui, cât, în ce cont. */}
        {confirming && (
          <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
            <p className="font-medium">Confirmi că plata a fost executată?</p>
            <p>
              {parAmount(mdlStringToCents(actualAmountMdl) || 0, par.currency)} către{" "}
              <span className="font-medium">{par.payeeName ?? "beneficiar nespecificat"}</span>
              {par.payeeIban ? <> · <span className="font-mono text-xs">{par.payeeIban}</span></> : null}
            </p>
            <p className="text-xs text-muted-foreground">
              Cererea trece în „Plătită", iar solicitantul e anunțat. Dacă ai greșit, plata se poate
              anula din pagina cererii („Anulează plata").
            </p>
          </div>
        )}

        {/* Ce se întâmplă ACUM. Fără linia asta, între click și închiderea dialogului treceau
            secunde în care ecranul arăta identic cu unul înghețat. */}
        {step && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            <span>{PAY_STEP_LABEL[step]}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          {/* VM4-02: alternativa lipsă. Până acum dialogul avea un singur drum înainte — „plătit" —
              chiar și când plata NU trebuia făcută. */}
          <button
            onClick={onRefuse}
            disabled={saving}
            className="mr-auto rounded-md px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
          >
            Refuză plata
          </button>
          <button
            onClick={confirming ? () => setConfirming(false) : onClose}
            disabled={saving}
            className="px-4 py-2 rounded-md border border-input bg-background text-sm text-foreground hover:bg-accent transition-colors disabled:opacity-50"
          >
            {confirming ? "Înapoi" : "Anulare"}
          </button>
          <button
            onClick={() => (confirming ? void handlePay() : setConfirming(true))}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {saving ? "Se înregistrează…" : confirming ? "Da, confirmă plata" : "Marchează plătit"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VM4-02: refuzul plății ───────────────────────────────────────────────────
// Violeta: „am vrut să apăs refuzat". Butonul nu exista: finanțele puteau doar plăti. Cererea
// refuzată se întoarce la solicitant ca „Modificări cerute" — o corectează și o retrimite.

interface RefusePaymentModalProps {
  par: ParFinanceQueueItem;
  onClose: () => void;
  onReturned: () => void;
}

function RefusePaymentModal({ par, onClose, onReturned }: RefusePaymentModalProps) {
  useEscapeToClose(onClose);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRefuse = async () => {
    setSaving(true);
    setError(null);
    try {
      await financeReturnPar(par.id, reason.trim());
      onReturned();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Eroare la refuzul plății");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="refuse-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-lg">
        <h2 id="refuse-title" className="text-lg font-semibold text-card-foreground">
          Refuză plata
        </h2>
        <p className="text-sm text-muted-foreground">
          {par.requestNo} · {par.payeeName ?? "beneficiar nespecificat"} ·{" "}
          {parAmount(par.totalEstimatedCents, par.currency)}
        </p>

        {error && (
          <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        <div>
          <label htmlFor="refuse-reason" className="mb-1 block text-sm font-medium text-foreground">
            Motivul refuzului <span aria-hidden="true" className="text-destructive">*</span>
          </label>
          <Textarea
            id="refuse-reason"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="ex. IBAN-ul din cerere nu corespunde cu cel din contract"
            maxLength={500}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Cererea se întoarce la solicitant ca „Modificări cerute", cu motivul tău. După
            corectare o retrimite, iar lanțul de aprobare se reia.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            Anulare
          </button>
          <button
            onClick={() => void handleRefuse()}
            disabled={saving || reason.trim().length < 3}
            className="flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmă refuzul
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── VM4-05: arhivare / restaurare ───────────────────────────────────────────
// O cerere refuzată pe care solicitantul o abandonează stă în coadă la nesfârșit — și dacă e
// marcată „urgentă", stă chiar pe primul rând, peste lucrul adevărat. Arhivarea o mută într-un tab
// separat fără să-i schimbe statusul și fără să șteargă nimic; restaurarea o aduce înapoi.

interface ArchiveModalProps {
  par: ParFinanceQueueItem;
  /** „archive" scoate cererea din listă, „restore" o readuce. */
  mode: "archive" | "restore";
  onClose: () => void;
  onDone: () => void;
}

/** Statusurile în care cererea așteaptă lucru CHIAR de la finanțe — arhivarea lor merită un avertisment. */
const AWAITING_FINANCE = ["approved", "in_finance"];

function ArchiveModal({ par, mode, onClose, onDone }: ArchiveModalProps) {
  useEscapeToClose(onClose);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const archiving = mode === "archive";

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      if (archiving) await financeArchivePar(par.id, note.trim() || null);
      else await financeUnarchivePar(par.id, note.trim() || null);
      onDone();
      onClose();
    } catch (e: unknown) {
      setError(
        e instanceof Error
          ? e.message
          : archiving
            ? "Eroare la arhivare"
            : "Eroare la restaurare"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="archive-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-lg">
        <h2 id="archive-title" className="text-lg font-semibold text-card-foreground">
          {archiving ? "Arhivează cererea" : "Readu cererea în coadă"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {par.requestNo} · {par.payeeName ?? "beneficiar nespecificat"} ·{" "}
          {parAmount(par.totalEstimatedCents, par.currency)}
        </p>

        {error && (
          <div role="alert" className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {/* Arhivarea unei cereri care încă așteaptă plata nu se blochează, dar nici nu trece în
            tăcere: omul trebuie să vadă că scoate din listă exact munca lui. */}
        {archiving && AWAITING_FINANCE.includes(par.status) && (
          <Alert variant="warning" icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}>
            Cererea așteaptă lucru din partea finanțelor
            {par.status === "in_finance" ? " (secțiunea 16 completată, plata neînregistrată)" : ""}.
            Arhivarea o scoate din listă — plata nu se mai vede de nimeni până la restaurare.
          </Alert>
        )}

        <div>
          <label htmlFor="archive-note" className="mb-1 block text-sm font-medium text-foreground">
            Notă <span className="font-normal text-muted-foreground">(opțional)</span>
          </label>
          <Textarea
            id="archive-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              archiving
                ? "ex. solicitantul a renunțat, se reface cererea în altă perioadă"
                : "ex. solicitantul a revenit cu documentele corecte"
            }
            maxLength={500}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {archiving
              ? "Statusul cererii nu se schimbă și nimic nu se șterge — o găsești oricând în tabul „Arhivate”. Dacă solicitantul o corectează și cererea e aprobată din nou, revine singură în listă."
              : "Cererea se întoarce în lista de lucru, exact în starea în care e acum."}
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Anulare
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : archiving ? (
              <Archive className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
            )}
            {archiving ? "Arhivează" : "Readu în coadă"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── VM3-01: copy-to-clipboard cell ──────────────────────────────────────────
// Violeta (finance): "se poți face copie de aici în bancă direct. Nu mai bat eu pe tastat."
// Display text stays selectable; the button copies the RAW value (e.g. "7000.00", the full IBAN)
// so it can be pasted straight into internet banking / 1C.

interface CopyValueProps {
  display: string;
  copyValue?: string;
  label: string; // for aria-label: "Copiază IBAN"
  mono?: boolean;
  maxWidthClass?: string;
}

function CopyValue({ display, copyValue, label, mono, maxWidthClass }: CopyValueProps) {
  const [copied, setCopied] = useState(false);
  const value = copyValue ?? display;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (http/permissions) — text stays selectable as fallback */
    }
  };

  if (!display) return <span className="text-muted-foreground">—</span>;

  return (
    <span className="inline-flex items-center gap-1 max-w-full">
      <span
        className={cn("select-text truncate", mono && "font-mono", maxWidthClass)}
        title={display}
      >
        {display}
      </span>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? `${label} copiat` : label}
        title={label}
        className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}

// ─── VM3-01: attachments modal (fetch on demand) ─────────────────────────────
// The queue list carries only attachment METADATA; file bodies (data-URLs) are fetched
// when the modal opens, via the existing GET /api/par/:id/attachments.

interface AttachmentsModalProps {
  par: ParFinanceQueueItem;
  onClose: () => void;
}

function AttachmentsModal({ par, onClose }: AttachmentsModalProps) {
  useEscapeToClose(onClose);
  const [items, setItems] = useState<ParAttachment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listAttachments(par.id)
      .then((r) => { if (!cancelled) setItems(r.items); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Eroare la încărcarea documentelor");
      });
    return () => { cancelled = true; };
  }, [par.id]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="att-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-4 overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="att-title" className="text-lg font-semibold text-card-foreground">
              Documente atașate
            </h2>
            <p className="text-sm text-muted-foreground">{par.requestNo} · {par.payeeName ?? "—"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {error}
          </div>
        )}

        {!error && items === null && (
          <div className="flex items-center justify-center py-8" role="status" aria-label="Se încarcă documentele...">
            <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
          </div>
        )}

        {!error && items !== null && items.length === 0 && (
          <p className="text-sm text-muted-foreground py-4">Niciun document atașat la această cerere.</p>
        )}

        {!error && items !== null && items.length > 0 && (
          <ul className="divide-y divide-border">
            {items.map((att) => (
              <li key={att.id} className="py-2.5 flex items-center gap-3">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => viewParAttachment(par.id, att.id, att.fileName)}
                    className="text-sm text-primary hover:underline truncate block max-w-full text-left"
                    aria-label={`Deschide ${att.fileName}`}
                  >
                    {att.fileName}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {attachmentKindLabel(att.kind, att.kindOther)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Dosar PDF: progres vizibil ───────────────────────────────────────────────
// Dosarul se construiește pe server din formular + toate documentele atașate și poate dura
// câteva secunde bune. Până acum butonul nu spunea nimic în tot acest timp — nici spinner, nici
// eroare (catch-ul era gol) — așa că finanțele apăsau, nu se întâmpla nimic vizibil și credeau
// că s-a blocat aplicația. Acum apăsarea deschide o fereastră care spune ce se întâmplă, iar
// dacă generarea eșuează rămâne acolo cu motivul și cu „Reîncearcă".

interface DosarJob {
  par: ParFinanceQueueItem;
  status: "loading" | "error";
  error?: string;
}

interface DosarProgressModalProps {
  job: DosarJob;
  onClose: () => void;
  onRetry: () => void;
}

function DosarProgressModal({ job, onClose, onRetry }: DosarProgressModalProps) {
  useEscapeToClose(onClose);
  const loading = job.status === "loading";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="dosar-title"
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4 backdrop-blur-sm"
    >
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md space-y-4 overflow-y-auto rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="flex items-start gap-3">
          {loading ? (
            <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-primary" aria-hidden="true" />
          ) : (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
          )}
          <div className="space-y-1">
            <h2 id="dosar-title" className="text-lg font-semibold text-card-foreground">
              {loading ? "Generăm dosarul PDF…" : "Dosarul nu a putut fi generat"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {job.par.requestNo}
              {job.par.payeeName ? ` · ${job.par.payeeName}` : ""}
            </p>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">
            Punem la un loc formularul și toate documentele atașate într-un singur PDF. Poate dura
            câteva secunde — fereastra se închide singură când începe descărcarea.
          </p>
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {job.error ?? "Eroare necunoscută."}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          {loading ? (
            <Button variant="outline" onClick={onClose}>
              Ascunde
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onClose}>
                Închide
              </Button>
              <Button onClick={onRetry}>Reîncearcă</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}


/**
 * Acțiunile unui rând din coadă — o singură definiție, folosită și de tabel (ecran mare) și de
 * carduri (telefon). În două locuri, un buton nou ar fi apărut doar într-unul, iar cine lucrează de
 * pe telefon ar fi rămas fără el fără să observe cineva.
 *
 * Toate trec prin DS Button: diferă prin variantă, nu prin dimensiune. Pe telefon se împachetează
 * pe rânduri (`wrap`), pe ecran mare stau într-o linie.
 */
interface QueueActionsProps {
  par: ParFinanceQueueItem;
  dosarJob: DosarJob | null;
  onSection16: (par: ParFinanceQueueItem) => void;
  onPay: (par: ParFinanceQueueItem) => void;
  onDosar: (par: ParFinanceQueueItem) => void;
  onArchive: (par: ParFinanceQueueItem) => void;
  onRestore: (par: ParFinanceQueueItem) => void;
  /** Ce listă se vede acum — în arhivă nu se lucrează, deci acolo rămân doar dosarul și restaurarea. */
  archivedView?: boolean;
  wrap?: boolean;
}

function QueueActions({
  par,
  dosarJob,
  onSection16,
  onPay,
  onDosar,
  onArchive,
  onRestore,
  archivedView = false,
  wrap = false,
}: QueueActionsProps) {
  return (
    <div className={cn("flex items-center justify-start gap-2", wrap ? "flex-wrap" : "flex-nowrap")}>
      {/* Secțiunea 16 — pe cererile aprobate / ajunse la finanțe */}
      {!archivedView && ["approved", "in_finance"].includes(par.status) && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onSection16(par)}
          aria-label={`Completează secțiunea 16 pentru ${par.requestNo}`}
        >
          Secț. 16
        </Button>
      )}
      {/* Plata — pe cererile ajunse la finanțe */}
      {!archivedView && par.status === "in_finance" && (
        <Button size="sm" onClick={() => onPay(par)} aria-label={`Înregistrează plata pentru ${par.requestNo}`}>
          <BanknoteIcon className="h-4 w-4" aria-hidden="true" />
          Înregistrează plata
        </Button>
      )}
      {/* După re-aprobarea depășirii, plata se poate relua */}
      {!archivedView && par.status === "reapproval_required" && par.payment?.overageReapproved && (
        <Button
          size="sm"
          onClick={() => onPay(par)}
          aria-label={`Reîncearcă plata pentru ${par.requestNo} (re-aprobare acordată)`}
        >
          <BanknoteIcon className="h-4 w-4" aria-hidden="true" />
          Plătește (re-aprobat)
        </Button>
      )}
      {!archivedView && par.status === "reapproval_required" && !par.payment?.overageReapproved && (
        <span className="whitespace-nowrap text-sm text-warning">Așteptare re-aprobare…</span>
      )}
      {/* VM1-12: dosarul complet PDF — pe orice status */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => onDosar(par)}
        disabled={dosarJob?.status === "loading" && dosarJob.par.id === par.id}
        aria-label={`Descarcă dosarul complet PDF pentru ${par.requestNo}`}
        title="Descarcă dosarul complet (PDF)"
      >
        {dosarJob?.status === "loading" && dosarJob.par.id === par.id ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Paperclip className="h-4 w-4" aria-hidden="true" />
        )}
        Dosar PDF
      </Button>
      {/* VM4-05: scoate din listă / readu în listă */}
      {archivedView ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onRestore(par)}
          aria-label={`Readu ${par.requestNo} în coada de finanțe`}
          title="Readu cererea în coada de lucru"
        >
          <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
          Restaurează
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onArchive(par)}
          aria-label={`Arhivează cererea ${par.requestNo}`}
          title="Scoate cererea din lista de lucru (reversibil)"
        >
          <Archive className="h-4 w-4" aria-hidden="true" />
          Arhivează
        </Button>
      )}
    </div>
  );
}

/**
 * Un rând din coadă, așa cum încape pe un telefon.
 *
 * Coada e un tabel de 13 coloane cu `min-w-[1280px]`: pe un ecran de 390px asta însemna o fereastră
 * de o coloană, deschisă chiar peste „Acțiuni" — omul de la finanțe vedea trei butoane și niciun
 * număr de cerere, niciun beneficiar, nicio sumă, decât dacă trăgea pagina lateral. Aceleași date,
 * în ordinea în care le citește: CINE, CÂT, PENTRU CE, apoi ce poate face.
 */
interface QueueCardProps extends Omit<QueueActionsProps, "wrap"> {
  onOpen: (par: ParFinanceQueueItem) => void;
  onDocuments: (par: ParFinanceQueueItem) => void;
}

function QueueCard({
  par,
  dosarJob,
  onSection16,
  onPay,
  onDosar,
  onArchive,
  onRestore,
  archivedView,
  onOpen,
  onDocuments,
}: QueueCardProps) {
  return (
    <li className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => onOpen(par)}
          className="font-mono text-sm text-foreground hover:text-primary hover:underline"
          aria-label={`Deschide cererea ${par.requestNo}`}
        >
          {par.requestNo}
        </button>
        <span className="font-mono text-base font-semibold text-foreground">
          {parAmount(par.totalEstimatedCents, par.currency)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <ParStatusChip
          status={par.status}
          label={par.financeReturn ? "Refuzată de finanțe" : undefined}
          className={par.financeReturn ? "bg-destructive/10 text-destructive" : undefined}
        />
        {par.isUrgent && (
          <ParUrgentBadge reason={par.urgentReason} reasonNote={par.urgentReasonNote} dueDate={par.urgentDueDate} />
        )}
        <ParBackdatedBadge dateOfRequest={par.dateOfRequest} submittedAt={par.submittedAt} />
      </div>

      {/* Beneficiarul și IBAN-ul rămân copiabile: de aici se completează ordinul în bancă, inclusiv
          de pe telefon. */}
      <div className="space-y-1 text-sm">
        <p className="font-medium text-foreground">{par.payeeName ?? "Beneficiar nespecificat"}</p>
        {par.payeeIban && <CopyValue display={par.payeeIban} label="Copiază IBAN" mono maxWidthClass="max-w-full" />}
        {par.payeeIdnp && <CopyValue display={par.payeeIdnp} label="Copiază IDNO" mono maxWidthClass="max-w-full" />}
        {par.endUse && <p className="text-muted-foreground">{par.endUse}</p>}
        {(par.projectName || par.budgetCodeLabel) && (
          <p className="text-xs text-muted-foreground">
            {[par.projectName, par.budgetCodeLabel].filter(Boolean).join(" · ")}
          </p>
        )}
        {par.approverDecisions && par.approverDecisions.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Aprobat de {par.approverDecisions.map((d) => d.name).join(", ")}
          </p>
        )}
        {par.status === "reapproval_required" && (
          <p className="text-xs font-medium text-warning">Re-aprobare necesară (&gt;10% depășire)</p>
        )}
        {par.financeArchive && financeArchiveLine(par.financeArchive) && (
          <p className="text-xs text-muted-foreground">Arhivată · {financeArchiveLine(par.financeArchive)}</p>
        )}
      </div>

      <div className="space-y-2 border-t border-border pt-3">
        <QueueActions
          par={par}
          dosarJob={dosarJob}
          onSection16={onSection16}
          onPay={onPay}
          onDosar={onDosar}
          onArchive={onArchive}
          onRestore={onRestore}
          archivedView={archivedView}
          wrap
        />
        {par.attachmentsMeta && par.attachmentsMeta.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDocuments(par)}
            aria-label={`Vezi ${par.attachmentsMeta.length} documente pentru ${par.requestNo}`}
          >
            <FileText className="h-4 w-4" aria-hidden="true" />
            {par.attachmentsMeta.length} doc.
          </Button>
        )}
      </div>
    </li>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

/** VM3-01: "cine a aprobat și la ce dată" — short ro-MD date for the queue. */
function fmtShortDate(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("ro-MD", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** „Violeta Bordeniuc · 11.09.2026 · nu există așa companie" — ce încape pe un rând de tabel. */
function financeReturnLine(ret: ParFinanceReturn): string {
  return [ret.byName, fmtShortDate(ret.returnedAt), ret.reason].filter(Boolean).join(" · ");
}

/** Cine a arhivat, când și cu ce notă — aceeași formă scurtă, pentru tabul „Arhivate". */
function financeArchiveLine(arch: ParFinanceArchive): string {
  return [arch.byName, fmtShortDate(arch.archivedAt), arch.note].filter(Boolean).join(" · ");
}

export default function ParFinanceQueue() {
  const { navigate } = useRouter();
  const [items, setItems] = useState<ParFinanceQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [s16Par, setS16Par] = useState<ParFinanceQueueItem | null>(null);
  const [payPar, setPayPar] = useState<ParFinanceQueueItem | null>(null);
  const [attPar, setAttPar] = useState<ParFinanceQueueItem | null>(null);
  const [dosarJob, setDosarJob] = useState<DosarJob | null>(null);
  // Tabelul de 13 coloane nu încape pe un telefon; acolo aceleași cereri se citesc ca niște carduri.
  const isPhone = useIsPhone();
  const [refusePar, setRefusePar] = useState<ParFinanceQueueItem | null>(null);
  // VM4-05: ce listă se vede — cea de lucru sau arhiva. Contoarele vin din același răspuns,
  // deci tabul inactiv își știe numărul fără o a doua cerere.
  const [view, setView] = useState<"active" | "archived">("active");
  const [counts, setCounts] = useState<{ active: number; archived: number }>({ active: 0, archived: 0 });
  const [archivePar, setArchivePar] = useState<{ par: ParFinanceQueueItem; mode: "archive" | "restore" } | null>(null);
  const [filterQ, setFilterQ] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");

  const archivedView = view === "archived";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFinanceQueue({ archived: archivedView });
      setItems(data.items);
      setCounts({
        active: data.activeCount ?? (archivedView ? 0 : data.items.length),
        archived: data.archivedCount ?? (archivedView ? data.items.length : 0),
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Eroare la încărcarea cozii");
    } finally {
      setLoading(false);
    }
  }, [archivedView]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Descărcarea dosarului, cu fereastra de progres pornită ÎNAINTE de cerere. */
  const startDosar = useCallback(async (par: ParFinanceQueueItem) => {
    setDosarJob({ par, status: "loading" });
    try {
      await downloadDosar(par.id, par.requestNo);
      setDosarJob(null);
    } catch (e: unknown) {
      setDosarJob({
        par,
        status: "error",
        error: e instanceof Error ? e.message : "Dosarul nu a putut fi generat.",
      });
    }
  }, []);

  const filteredItems = items.filter((par) => {
    const haystack = `${par.requestNo} ${par.payeeName ?? ""} ${par.payeeIdnp ?? ""} ${par.payeeIban ?? ""} ${par.projectName ?? ""} ${par.endUse ?? ""}`.toLocaleLowerCase("ro");
    const created = new Date(par.submittedAt ?? par.createdAt);
    return (!filterQ.trim() || haystack.includes(filterQ.trim().toLocaleLowerCase("ro")))
      && (!projectFilter || par.projectName === projectFilter)
      && (!statusFilter || par.status === statusFilter)
      && (!dateFrom || created >= new Date(dateFrom))
      && (!dateTo || created <= new Date(`${dateTo}T23:59:59`))
      && (!minTotal || par.totalEstimatedCents >= Number(minTotal) * 100)
      && (!maxTotal || par.totalEstimatedCents <= Number(maxTotal) * 100);
  });

  return (
    <AppShell
      pageTitle="Coadă finanțe"
      pageDescription={'PAR-uri aprobate de tip "execute payment" — secțiunea 16 + plată'}
      actions={
        <Button variant="outline" onClick={() => void load()} aria-label="Reîncarcă lista">
          <RefreshCcw className="h-4 w-4" aria-hidden="true" />
          Reîncarcă
        </Button>
      }
    >
      <div className="space-y-6">

        {/* VM4-05: lista de lucru și arhiva, separate. Contorul de pe tabul „Arhivate" e acolo ca
            nimeni să nu uite că a scos ceva din listă. */}
        <Tabs
          aria-label="Ce listă de cereri se vede"
          tabs={[
            { value: "active", label: "În lucru", count: counts.active },
            { value: "archived", label: "Arhivate", count: counts.archived },
          ]}
          value={view}
          onChange={(next) => setView(next as "active" | "archived")}
          className="w-fit max-w-full"
        />

        {!loading && !error && items.length > 0 && (
          <Card className="flex flex-wrap gap-2 p-3">
            <Input value={filterQ} onChange={(e) => setFilterQ(e.target.value)} placeholder="Caută PAR, beneficiar, IBAN…" aria-label={archivedView ? "Caută în arhiva finanțelor" : "Caută în coada finanțe"} className="min-w-[240px] flex-1" />
            <Select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Filtru proiect" className="w-auto"><option value="">Toate proiectele</option>{[...new Set(items.map((i) => i.projectName).filter(Boolean))].map((p) => <option key={p!} value={p!}>{p}</option>)}</Select>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filtru statut" className="w-auto"><option value="">Toate statusurile</option><option value="approved">Aprobate</option><option value="in_finance">În finanțe</option><option value="reapproval_required">Reaprobare</option><option value="changes_requested">Refuzate de finanțe</option></Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} aria-label="De la" className="w-auto" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} aria-label="Până la" className="w-auto" />
            <Input type="number" value={minTotal} onChange={(e) => setMinTotal(e.target.value)} placeholder="Min. MDL" aria-label="Sumă minimă" className="w-28" />
            <Input type="number" value={maxTotal} onChange={(e) => setMaxTotal(e.target.value)} placeholder="Max. MDL" aria-label="Sumă maximă" className="w-28" />
          </Card>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-16" role="status" aria-label="Se încarcă...">
            <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div role="alert" className="flex items-center gap-3 text-destructive bg-destructive/10 rounded-lg px-4 py-3">
            <AlertCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            {archivedView ? (
              <>
                <Archive className="h-12 w-12 mb-4 opacity-30" aria-hidden="true" />
                <p className="text-lg font-medium">Arhiva e goală</p>
                <p className="text-sm mt-1">
                  Cererile scoase din lista de lucru ajung aici și pot fi readuse oricând.
                </p>
              </>
            ) : (
              <>
                <BanknoteIcon className="h-12 w-12 mb-4 opacity-30" aria-hidden="true" />
                <p className="text-lg font-medium">Nicio cerere în coadă</p>
                <p className="text-sm mt-1">PAR-urile aprobate de tip &ldquo;execute payment&rdquo; vor apărea aici.</p>
              </>
            )}
          </div>
        )}

        {/* Queue table — VM3-01: coloanele cerute de finance (IDNO / IBAN / sumă / destinație /
            budget line), text copiabil, nr. PAR clickabil, aprobatori cu data deciziei. */}
        {/* Pe telefon: carduri. De la tabletă în sus: tabelul complet, cu toate coloanele. */}
        {!loading && !error && items.length > 0 && isPhone && (
          <ul className="space-y-3" aria-label={archivedView ? "Cereri arhivate" : "Coadă finanțe"}>
            {filteredItems.map((par) => (
              <QueueCard
                key={par.id}
                par={par}
                dosarJob={dosarJob}
                onSection16={setS16Par}
                onPay={setPayPar}
                onDosar={(p) => void startDosar(p)}
                onArchive={(p) => setArchivePar({ par: p, mode: "archive" })}
                onRestore={(p) => setArchivePar({ par: p, mode: "restore" })}
                archivedView={archivedView}
                onOpen={(p) => navigate(`/business/par/${p.id}`)}
                onDocuments={setAttPar}
              />
            ))}
          </ul>
        )}

        {!loading && !error && items.length > 0 && !isPhone && (
          <Table className="min-w-[1280px]" aria-label={archivedView ? "Cereri arhivate" : "Coadă finanțe"}>
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">Acțiuni</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">Nr.</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">Beneficiar</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">IDNO</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">IBAN</th>
                  <th className="text-right px-3 py-3 font-medium text-muted-foreground">Suma</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">Destinația plății</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">Proiect</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">Budget line</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">Aprobat de</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">Secț. 16</th>
                  <th className="text-left px-3 py-3 font-medium text-muted-foreground">Documente</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((par, idx) => (
                  <tr
                    key={par.id}
                    className={cn(
                      "border-b border-border last:border-0 hover:bg-muted/30 transition-colors",
                      idx % 2 === 0 ? "bg-background" : "bg-muted/10"
                    )}
                  >
                    <td className="px-3 py-3">
                      <QueueActions
                        par={par}
                        dosarJob={dosarJob}
                        onSection16={setS16Par}
                        onPay={setPayPar}
                        onDosar={(p) => void startDosar(p)}
                        onArchive={(p) => setArchivePar({ par: p, mode: "archive" })}
                        onRestore={(p) => setArchivePar({ par: p, mode: "restore" })}
                        archivedView={archivedView}
                      />
                    </td>
                    <td className="px-3 py-3">
                      {/* VM3-01: deschide PAR-ul direct din coadă ("tu nu poți să deschizi aici") */}
                      {/* Aceeași tratare ca în inbox: numărul e text normal care devine albastru la
                          hover. Albastru permanent aici se bătea cu chip-ul de status și cu butonul
                          primar — trei albastruri diferite pe același rând. */}
                      <button
                        type="button"
                        onClick={() => navigate(`/business/par/${par.id}`)}
                        className="whitespace-nowrap font-mono text-foreground hover:text-primary hover:underline"
                        aria-label={`Deschide cererea ${par.requestNo}`}
                      >
                        {par.requestNo}
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* VM4-02b: un singur chip. „Modificări solicitate" plus „Refuzată de
                              finanțe" dedesubt spuneau același lucru de două ori și făceau rândul
                              de patru ori mai înalt decât vecinii lui. */}
                          <ParStatusChip
                            status={par.status}
                            label={par.financeReturn ? "Refuzată de finanțe" : undefined}
                            className={par.financeReturn ? "bg-destructive/10 text-destructive" : undefined}
                          />
                          {par.isUrgent && (
                            <ParUrgentBadge reason={par.urgentReason} reasonNote={par.urgentReasonNote} dueDate={par.urgentDueDate} />
                          )}
                          {/* Datată în urmă: finanțele plătesc într-o perioadă, cererea poate fi
                              scrisă pentru alta — semnul apare înainte de plată, nu la reconciliere. */}
                          <ParBackdatedBadge dateOfRequest={par.dateOfRequest} submittedAt={par.submittedAt} />
                        </div>
                        {/* Cine a refuzat, când și de ce — pe UN rând discret, tăiat la lățimea
                            coloanei, cu textul întreg în tooltip. Detaliul complet stă oricum în
                            cronologia cererii; aici e doar cât să recunoști rândul. */}
                        {par.financeReturn && financeReturnLine(par.financeReturn) && (
                          <span
                            className="max-w-[220px] truncate text-xs text-muted-foreground"
                            title={financeReturnLine(par.financeReturn)}
                          >
                            {financeReturnLine(par.financeReturn)}
                          </span>
                        )}
                        {par.status === "reapproval_required" && (
                          <span className="text-xs font-medium text-warning">
                            Re-aprobare necesară (&gt;10% depășire)
                          </span>
                        )}
                        {par.above_micro_threshold && (
                          <span className="text-xs text-muted-foreground">
                            (peste prag micro-purchase)
                          </span>
                        )}
                        {/* În arhivă, cine a scos-o din listă și când — altfel rândul nu explică
                            de ce nu mai e în coadă. */}
                        {par.financeArchive && financeArchiveLine(par.financeArchive) && (
                          <span
                            className="max-w-[220px] truncate text-xs text-muted-foreground"
                            title={`Arhivată · ${financeArchiveLine(par.financeArchive)}`}
                          >
                            Arhivată · {financeArchiveLine(par.financeArchive)}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-foreground">
                      <CopyValue
                        display={par.payeeName ?? ""}
                        label="Copiază beneficiarul"
                        maxWidthClass="max-w-[150px]"
                      />
                    </td>
                    <td className="px-3 py-3 text-foreground">
                      <CopyValue display={par.payeeIdnp ?? ""} label="Copiază IDNO" mono />
                    </td>
                    <td className="px-3 py-3 text-foreground">
                      {/* Un IBAN moldovenesc are 24 de caractere; la scara tabelului încap în ~250px.
                          Lățimea veche (190px) era calibrată pe text-xs și, după unificarea mărimii,
                          tăia IBAN-ul cu „…" — exact câmpul pentru care finanțele deschid ecranul. */}
                      <CopyValue
                        display={par.payeeIban ?? ""}
                        label="Copiază IBAN"
                        mono
                        maxWidthClass="max-w-[250px]"
                      />
                    </td>
                    {/* Suma poartă aceeași greutate ca în inbox: e cifra pe care o cauți cu ochiul
                        pe ambele ecrane, deci se scrie la fel pe amândouă. */}
                    <td className="px-3 py-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">
                      <CopyValue
                        display={parAmount(par.totalEstimatedCents, par.currency)}
                        copyValue={(par.totalEstimatedCents / 100).toFixed(2)}
                        label="Copiază suma"
                        mono
                      />
                    </td>
                    <td className="px-3 py-3 text-foreground">
                      <CopyValue
                        display={par.endUse ?? ""}
                        label="Copiază destinația plății"
                        maxWidthClass="max-w-[200px]"
                      />
                    </td>
                    <td className="px-3 py-3 text-foreground max-w-[130px] truncate" title={par.projectName ?? ""}>
                      {par.projectName ?? "—"}
                    </td>
                    <td className="px-3 py-3 text-foreground">
                      <CopyValue
                        display={par.budgetCodeLabel ?? (par.payment?.parBl || "")}
                        label="Copiază budget line"
                        maxWidthClass="max-w-[150px]"
                      />
                    </td>
                    <td className="px-3 py-3 text-foreground">
                      {/* VM3-01: audit — "două persoane au aprobat la ce dată" */}
                      {par.approverDecisions && par.approverDecisions.length > 0 ? (
                        <ul className="space-y-0.5">
                          {par.approverDecisions.map((d) => (
                            <li key={`${par.id}-step-${d.step}`} className="whitespace-nowrap">
                              <span className="text-foreground">{d.name}</span>
                              {d.decidedAt && (
                                <span className="text-muted-foreground"> · {fmtShortDate(d.decidedAt)}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {par.payment ? (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                          <span>
                            {par.payment.parBl ? (
                              <><ClipboardList className="inline h-4 w-4 mr-0.5" aria-hidden="true" />{par.payment.parBl}</>
                            ) : "Fără BL"}
                          </span>
                          {par.payment.assignedToUserId && (
                            <span className="ml-1">
                              <User className="inline h-4 w-4 mr-0.5" aria-hidden="true" />
                              asignat
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">Necompletat</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {/* VM3-01: documentele atașate, vizibile din coadă (nu doar Dosarul PDF) */}
                      {par.attachmentsMeta && par.attachmentsMeta.length > 0 ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAttPar(par)}
                          aria-label={`Vezi ${par.attachmentsMeta.length} documente pentru ${par.requestNo}`}
                        >
                          <FileText className="h-4 w-4" aria-hidden="true" />
                          {par.attachmentsMeta.length} doc.
                        </Button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
          </Table>
        )}

        {/* Modals */}
        {s16Par && (
          <Section16Modal
            par={s16Par}
            onClose={() => setS16Par(null)}
            onSaved={() => void load()}
          />
        )}
        {payPar && (
          <PayModal
            par={payPar}
            onClose={() => setPayPar(null)}
            onPaid={() => void load()}
            onRefuse={() => { setRefusePar(payPar); setPayPar(null); }}
          />
        )}
        {refusePar && (
          <RefusePaymentModal
            par={refusePar}
            onClose={() => setRefusePar(null)}
            onReturned={() => void load()}
          />
        )}
        {attPar && (
          <AttachmentsModal
            par={attPar}
            onClose={() => setAttPar(null)}
          />
        )}
        {archivePar && (
          <ArchiveModal
            par={archivePar.par}
            mode={archivePar.mode}
            onClose={() => setArchivePar(null)}
            onDone={() => void load()}
          />
        )}
        {dosarJob && (
          <DosarProgressModal
            job={dosarJob}
            onClose={() => setDosarJob(null)}
            onRetry={() => void startDosar(dosarJob.par)}
          />
        )}
      </div>
    </AppShell>
  );
}
