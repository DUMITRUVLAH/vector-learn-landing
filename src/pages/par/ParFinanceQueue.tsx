/**
 * PAR-112 — /business/par/finance
 *
 * Finance queue: lista de PAR-uri aprobate (execute_payment) + cele in_finance / reapproval_required.
 * Acțiuni:
 *   - Completare secțiune 16 (PAR BL / Received By / Assigned To) → PAR → in_finance
 *   - Înregistrare plată (suma reală, dată, referință, dovadă) → PAR → paid sau reapproval_required
 *   - Vizualizare status 10%-overage cu notă de re-aprobare necesară
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
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { ParStatusChip } from "@/components/par/ParStatusChip";
import {
  getFinanceQueue,
  submitSection16,
  executePayment,
  uploadAttachment,
  formatMDL,
  downloadDosar,
  type ParFinanceQueueItem,
  type Section16Payload,
  type PayPayload,
} from "@/lib/api/par";
import { cn } from "@/lib/utils";

// ─── Section-16 modal ─────────────────────────────────────────────────────────

interface Section16ModalProps {
  par: ParFinanceQueueItem;
  onClose: () => void;
  onSaved: () => void;
}

function Section16Modal({ par, onClose, onSaved }: Section16ModalProps) {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <div className="bg-card border border-border rounded-lg shadow-lg p-6 w-full max-w-lg space-y-4">
        <h2 id="s16-title" className="text-lg font-semibold text-card-foreground">
          Secțiunea 16 — Payment Internal Use Only
        </h2>
        <p className="text-sm text-muted-foreground">
          {par.requestNo} · {formatMDL(par.totalEstimatedCents)}
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
            <input
              id="par-bl"
              type="text"
              value={parBl}
              onChange={(e) => setParBl(e.target.value)}
              placeholder="ex. OPS-2026-07"
              maxLength={200}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="received-by" className="block text-sm font-medium text-foreground mb-1">
              Received By (user ID sau nume)
            </label>
            <input
              id="received-by"
              type="text"
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              placeholder="ID sau lăsați gol (se va folosi userul curent)"
              maxLength={200}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="assigned-to" className="block text-sm font-medium text-foreground mb-1">
              Assigned To (user ID)
            </label>
            <input
              id="assigned-to"
              type="text"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="ID utilizator responsabil"
              maxLength={200}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
            Salvează &amp; Marchează in_finance
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
}

/** Convert a "1234.56" / "1234,56" MDL string to integer cents. */
function mdlStringToCents(s: string): number {
  const major = parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(major) ? Math.round(major * 100) : NaN;
}

function PayModal({ par, onClose, onPaid }: PayModalProps) {
  // Suma reală este în MDL și se pre-completează cu suma integrală (estimatul) — editabilă.
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  // Warn user when amount exceeds +10%
  const updateWarning = (mdlStr: string) => {
    const amt = mdlStringToCents(mdlStr);
    if (!isNaN(amt) && par.above_micro_threshold) {
      const max = Math.floor((par.totalEstimatedCents * 110) / 100);
      setWarning(
        amt > max
          ? `Suma (${formatMDL(amt)}) depășește estimatul cu >10% (max ${formatMDL(max)}). ` +
              "Va fi necesar un re-aprobare înainte de plată."
          : null
      );
    } else {
      setWarning(null);
    }
  };

  const fileToDataUrl = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(f);
    });

  const handlePay = async () => {
    const amt = mdlStringToCents(actualAmountMdl);
    if (isNaN(amt) || amt <= 0) {
      setError("Suma reală trebuie să fie un număr pozitiv (în MDL).");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // Attach the payment-confirmation PDF to the dossier (section 13) BEFORE recording the payment.
      if (proofFile) {
        const dataUrl = await fileToDataUrl(proofFile);
        await uploadAttachment(par.id, {
          file_name: `Dovadă plată — ${par.requestNo}${proofFile.name ? ` (${proofFile.name})` : ""}`,
          file_url: dataUrl,
          mime: proofFile.type || "application/pdf",
          kind: "other",
        });
      }
      const payload: PayPayload = {
        actual_amount_cents: amt,
        payment_date: paymentDate,
        payment_ref: paymentRef.trim() || null,
      };
      await executePayment(par.id, payload);
      onPaid();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Eroare la procesarea plății");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pay-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
    >
      <div className="bg-card border border-border rounded-lg shadow-lg p-6 w-full max-w-lg space-y-4">
        <h2 id="pay-title" className="text-lg font-semibold text-card-foreground">
          Înregistrare plată
        </h2>
        <p className="text-sm text-muted-foreground">
          {par.requestNo} · Estimat: {formatMDL(par.totalEstimatedCents)}
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
          <div role="status" className="flex items-start gap-2 text-amber-700 dark:text-amber-400 text-sm bg-amber-50 dark:bg-amber-900/20 rounded px-3 py-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
            {warning}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label htmlFor="actual-amount" className="block text-sm font-medium text-foreground mb-1">
              Suma reală (MDL) <span aria-hidden="true" className="text-destructive">*</span>
            </label>
            <input
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
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Pre-completat cu suma estimată ({formatMDL(par.totalEstimatedCents)}). Schimbă dacă plata reală diferă.
            </p>
          </div>

          <div>
            <label htmlFor="payment-date" className="block text-sm font-medium text-foreground mb-1">
              Data plății <span aria-hidden="true" className="text-destructive">*</span>
            </label>
            <input
              id="payment-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="payment-ref" className="block text-sm font-medium text-foreground mb-1">
              Referință plată <span className="text-muted-foreground font-normal">(opțional)</span>
            </label>
            <input
              id="payment-ref"
              type="text"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="ex. OP-2026-0047"
              maxLength={500}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label htmlFor="proof-file" className="block text-sm font-medium text-foreground mb-1">
              Dovada plății (PDF, opțional)
            </label>
            <input
              id="proof-file"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setProofFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:text-primary-foreground file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-primary/90 file:cursor-pointer"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {proofFile ? `Se atașează la dosar: ${proofFile.name}` : "Confirmarea de plată se atașează la dosarul cererii (secțiunea Atașamente)."}
            </p>
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
            onClick={handlePay}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Marchează plătit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ParFinanceQueue() {
  const [items, setItems] = useState<ParFinanceQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [s16Par, setS16Par] = useState<ParFinanceQueueItem | null>(null);
  const [payPar, setPayPar] = useState<ParFinanceQueueItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFinanceQueue();
      setItems(data.items);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Eroare la încărcarea cozii");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const statusLabel: Record<string, string> = {
    approved: "Aprobat — de primit",
    in_finance: "La finanțe",
    reapproval_required: "Re-aprobare necesară",
  };

  return (
    <AppShell pageTitle="Coadă finanțe" pageDescription="PAR-uri aprobate — plată internă">
      <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Coadă finanțe</h1>
            <p className="text-sm text-muted-foreground mt-1">
              PAR-uri aprobate de tip &ldquo;execute payment&rdquo; — secțiunea 16 + plată
            </p>
          </div>
          <button
            onClick={() => void load()}
            aria-label="Reîncarcă lista"
            className="flex items-center gap-2 px-3 py-2 rounded-md border border-input bg-background text-sm text-foreground hover:bg-accent transition-colors"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Reîncarcă
          </button>
        </div>

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
            <BanknoteIcon className="h-12 w-12 mb-4 opacity-30" aria-hidden="true" />
            <p className="text-lg font-medium">Nicio cerere în coadă</p>
            <p className="text-sm mt-1">PAR-urile aprobate de tip &ldquo;execute payment&rdquo; vor apărea aici.</p>
          </div>
        )}

        {/* Queue table */}
        {!loading && !error && items.length > 0 && (
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm" role="table" aria-label="Coadă finanțe">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nr.</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Beneficiar</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Proiect</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Solicitant</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Aprobat de</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Estimat</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Secț. 16</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acțiuni</th>
                </tr>
              </thead>
              <tbody>
                {items.map((par, idx) => (
                  <tr
                    key={par.id}
                    className={cn(
                      "border-b border-border last:border-0 hover:bg-muted/30 transition-colors",
                      idx % 2 === 0 ? "bg-background" : "bg-muted/10"
                    )}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{par.requestNo}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        <ParStatusChip status={par.status} />
                        {par.status === "reapproval_required" && (
                          <span className="text-xs text-amber-700 dark:text-amber-400 font-medium">
                            Re-aprobare necesară (&gt;10% depășire)
                          </span>
                        )}
                        {par.above_micro_threshold && (
                          <span className="text-xs text-muted-foreground">
                            (peste prag micro-purchase)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-foreground text-xs max-w-[160px] truncate" title={par.payeeName ?? ""}>
                      {par.payeeName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-foreground text-xs max-w-[140px] truncate" title={par.projectName ?? ""}>
                      {par.projectName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-foreground text-xs">
                      {par.requestedByName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-foreground text-xs max-w-[160px] truncate" title={(par.approverNames ?? []).join(", ")}>
                      {par.approverNames && par.approverNames.length > 0 ? par.approverNames.join(", ") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-foreground">
                      {formatMDL(par.totalEstimatedCents)}
                    </td>
                    <td className="px-4 py-3">
                      {par.payment ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
                          <span>
                            {par.payment.parBl ? (
                              <><ClipboardList className="inline h-3 w-3 mr-0.5" aria-hidden="true" />{par.payment.parBl}</>
                            ) : "Fără BL"}
                          </span>
                          {par.payment.assignedToUserId && (
                            <span className="ml-1">
                              <User className="inline h-3 w-3 mr-0.5" aria-hidden="true" />
                              asignat
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">Necompletat</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end flex-wrap">
                        {/* Section 16 button — available on approved / in_finance */}
                        {["approved", "in_finance"].includes(par.status) && (
                          <button
                            onClick={() => setS16Par(par)}
                            aria-label={`Completează secțiunea 16 pentru ${par.requestNo}`}
                            className="px-3 py-1.5 rounded-md border border-input bg-background text-xs text-foreground hover:bg-accent transition-colors whitespace-nowrap"
                          >
                            Secț. 16
                          </button>
                        )}
                        {/* Pay button — available on in_finance */}
                        {par.status === "in_finance" && (
                          <button
                            onClick={() => setPayPar(par)}
                            aria-label={`Înregistrează plata pentru ${par.requestNo}`}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
                          >
                            <BanknoteIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            Înregistrează plata
                          </button>
                        )}
                        {/* Note for reapproval_required — after re-approval the pay button re-enables */}
                        {par.status === "reapproval_required" && par.payment?.overageReapproved && (
                          <button
                            onClick={() => setPayPar(par)}
                            aria-label={`Reîncearcă plata pentru ${par.requestNo} (re-aprobare acordată)`}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors whitespace-nowrap"
                          >
                            <BanknoteIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            Plătește (re-aprobat)
                          </button>
                        )}
                        {par.status === "reapproval_required" && !par.payment?.overageReapproved && (
                          <span className="text-xs text-amber-700 dark:text-amber-400 whitespace-nowrap">
                            Așteptare re-aprobare…
                          </span>
                        )}
                        {/* VM1-12: Dosar complet PDF — visible for all statuses */}
                        <button
                          onClick={async () => {
                            try { await downloadDosar(par.id, par.requestNo); }
                            catch { /* silent — user can retry */ }
                          }}
                          aria-label={`Descarcă dosarul complet PDF pentru ${par.requestNo}`}
                          title="Descarcă dosarul complet (PDF)"
                          className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-border bg-background text-xs text-foreground hover:bg-accent transition-colors whitespace-nowrap"
                        >
                          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                          Dosar PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
          />
        )}
      </div>
    </AppShell>
  );
}
