/**
 * PAR-EFP — cardul „e-Factura de la prestator" din pagina cererii.
 *
 * Se afișează pe cererile ACHITATE și răspunde la o singură întrebare: a emis prestatorul factura
 * în SIA „e-Factura" sau nu? Când nu, dă butonul care trimite reminderul către solicitantul cererii
 * (el are relația cu prestatorul), plus marcarea manuală când factura a venit pe alt canal.
 *
 * Design system: doar tokeni semantici (HR365), light + dark, țintele de click ≥ 44px.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ReceiptText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Search,
  Send,
  Check,
  Settings,
} from "lucide-react";
import { Alert, Button, Input } from "@/components/ds";
import { ApiError } from "@/lib/api";
import {
  getParEfactura,
  scanParEfactura,
  sendParEfacturaReminder,
  markParEfacturaReceived,
  PAR_EFACTURA_STATUS_LABELS,
  type ParEfacturaDetail,
} from "@/lib/api/parEfactura";

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ro-MD", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString("ro-MD", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function ParEfacturaCard({ parId, onNavigate }: { parId: string; onNavigate?: (path: string) => void }) {
  const [data, setData] = useState<ParEfacturaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"scan" | "reminder" | "mark" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [markOpen, setMarkOpen] = useState(false);
  const [markSeria, setMarkSeria] = useState("");
  const [markNumber, setMarkNumber] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await getParEfactura(parId));
      setError(null);
    } catch {
      setError("Nu am putut încărca starea e-Facturii.");
    } finally {
      setLoading(false);
    }
  }, [parId]);

  useEffect(() => {
    void load();
  }, [load]);

  const runScan = async () => {
    setBusy("scan");
    setError(null);
    setInfo(null);
    try {
      const { result } = await scanParEfactura(parId);
      setInfo(result.message);
      await load();
    } catch {
      setError("Verificarea în SFS a eșuat.");
    } finally {
      setBusy(null);
    }
  };

  const sendReminder = async () => {
    setBusy("reminder");
    setError(null);
    setInfo(null);
    try {
      const res = await sendParEfacturaReminder(parId);
      setInfo(
        res.toAddress
          ? `Reminder trimis solicitantului (${res.toAddress}).`
          : "Reminder înregistrat, dar solicitantul nu are adresă de email."
      );
      await load();
    } catch (e) {
      // 429 „too_soon" și 409 „not_expected" au explicații scrise de server — le arătăm ca atare.
      const detail = e instanceof ApiError ? (e.body.detail as string | undefined) : undefined;
      setError(detail ?? "Nu am putut trimite reminderul.");
    } finally {
      setBusy(null);
    }
  };

  const markReceived = async () => {
    setBusy("mark");
    setError(null);
    setInfo(null);
    try {
      await markParEfacturaReceived(parId, {
        seria: markSeria.trim() || undefined,
        number: markNumber.trim() || undefined,
      });
      setMarkOpen(false);
      setMarkSeria("");
      setMarkNumber("");
      await load();
    } catch {
      setError("Nu am putut marca factura ca primită.");
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Se încarcă starea e-Facturii…
      </div>
    );
  }

  if (!data?.state) {
    return null;
  }

  const state = data.state;
  const missing = state.status === "expected";
  const settled = state.status === "found" || state.status === "received_manual";

  return (
    <section className="rounded-lg border border-border bg-card p-4 space-y-3" aria-labelledby="par-efactura-title">
      <div className="flex items-center gap-2 flex-wrap">
        <ReceiptText className="h-4 w-4 text-primary" aria-hidden />
        <h2 id="par-efactura-title" className="text-sm font-semibold text-foreground">
          e-Factura de la prestator
        </h2>
        <span
          className={
            settled
              ? "text-xs font-medium text-success"
              : missing
                ? "text-xs font-medium text-warning"
                : "text-xs font-medium text-muted-foreground"
          }
        >
          {PAR_EFACTURA_STATUS_LABELS[state.status]}
        </span>
      </div>

      {state.status === "not_applicable" && (
        <p className="text-sm text-muted-foreground">
          {state.lastScanMessage ?? "Pentru această cerere nu se așteaptă o e-Factura."}
        </p>
      )}

      {state.status === "found" && (
        <div className="text-sm text-foreground space-y-1">
          <p className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />
            <span>
              Factura <strong>{state.sfsSeria} {state.sfsNumber}</strong>
              {state.sfsInvoiceStatusLabel ? ` · ${state.sfsInvoiceStatusLabel}` : ""}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            Emisă {fmtDate(state.invoiceDate)}
            {state.invoiceTotalCents != null && ` · ${(state.invoiceTotalCents / 100).toFixed(2)} MDL`}
            {state.lastScanAt && ` · verificat ${fmtDateTime(state.lastScanAt)}`}
          </p>
        </div>
      )}

      {state.status === "received_manual" && (
        <div className="text-sm text-foreground space-y-1">
          <p className="flex items-center gap-2">
            <Check className="h-4 w-4 text-success" aria-hidden />
            Marcată ca primită în afara SFS
            {state.sfsSeria || state.sfsNumber ? ` (${[state.sfsSeria, state.sfsNumber].filter(Boolean).join(" ")})` : ""}
          </p>
          {state.markedNote && <p className="text-xs text-muted-foreground">{state.markedNote}</p>}
        </div>
      )}

      {missing && (
        <div className="space-y-2">
          {!data.sfs.configured ? (
            <Alert variant="warning" icon={<AlertTriangle className="h-4 w-4" />} title="Verificarea automată nu e disponibilă">
              Integrarea cu SIA „e-Factura" (SFS) nu e configurată, deci nu putem confirma dacă
              prestatorul a emis factura. Reminderul funcționează oricum.
              {onNavigate && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => onNavigate("/business/par/efactura")}
                >
                  <Settings className="h-4 w-4" aria-hidden />
                  Configurează SFS
                </Button>
              )}
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">
              {state.lastScanAt
                ? `${state.lastScanMessage ?? "Factura nu a fost găsită în SFS."} (verificat ${fmtDateTime(state.lastScanAt)})`
                : "Încă nu s-a făcut nicio verificare în SFS."}
            </p>
          )}

          {state.reminderCount > 0 && (
            <p className="text-xs text-muted-foreground">
              Remindere trimise: {state.reminderCount}
              {state.lastReminderAt && ` · ultimul ${fmtDateTime(state.lastReminderAt)}`}
              {state.lastReminderToEmail && ` către ${state.lastReminderToEmail}`}
            </p>
          )}
        </div>
      )}

      {error && <Alert variant="destructive" icon={<AlertTriangle className="h-4 w-4" />}>{error}</Alert>}
      {info && !error && <Alert variant="info">{info}</Alert>}

      {missing && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={runScan} disabled={busy !== null}>
            {busy === "scan" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Search className="h-4 w-4" aria-hidden />}
            Verifică în SFS
          </Button>
          <Button onClick={sendReminder} disabled={busy !== null}>
            {busy === "reminder" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
            Trimite reminder solicitantului
          </Button>
          {data.canManage && !markOpen && (
            <Button variant="ghost" onClick={() => setMarkOpen(true)} disabled={busy !== null}>
              <Check className="h-4 w-4" aria-hidden />
              Marchează primită
            </Button>
          )}
        </div>
      )}

      {missing && markOpen && (
        <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-border">
          <Input
            value={markSeria}
            onChange={(e) => setMarkSeria(e.target.value)}
            placeholder="Serie (opțional)"
            aria-label="Seria facturii primite"
            className="w-40"
          />
          <Input
            value={markNumber}
            onChange={(e) => setMarkNumber(e.target.value)}
            placeholder="Număr (opțional)"
            aria-label="Numărul facturii primite"
            className="w-40"
          />
          <Button onClick={markReceived} disabled={busy !== null}>
            {busy === "mark" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
            Confirmă
          </Button>
          <Button variant="ghost" onClick={() => setMarkOpen(false)} disabled={busy !== null}>
            Renunță
          </Button>
        </div>
      )}
    </section>
  );
}

export default ParEfacturaCard;
