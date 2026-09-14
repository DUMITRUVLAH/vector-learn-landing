/**
 * CRM — „Motiv pierdere": dialogul obligatoriu la mutarea unui lead într-o etapă marcată
 * `isLost` (verificat pe FLAG, nu pe cheia literală „lost" — o etapă „Pierdut" redenumită sau o
 * etapă custom marcată „pierdut" din `StageEditorDialog` trebuie să ceară motivul la fel).
 *
 * Extras din `CrmPipelinePage.tsx` — folosit și de board (drag/select) și de `LeadDetailSheet`
 * (select-ul de stadiu din „Acțiuni rapide"), ca regula să nu se dubleze în două locuri.
 *
 * Motivele NU mai sunt un `const` fix din front-end (`CRM_LOST_REASON_PRESETS`) — vin din
 * `GET /api/crm/lost-reasons`, configurabile per tenant (server/routes/crmLostReasons.ts), cu
 * seed automat de 6 motive în română la prima citire. Fără text liber: „Altul" e acum un rând
 * normal din listă, redenumibil/ștergibil din editorul de motive — nu mai un caz special cu
 * câmp de detalii.
 */
import { useEffect, useState, useCallback } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { Dialog, Button, Alert } from "@/components/ds";
import { cn } from "@/lib/utils";
import { listCrmLostReasons, type CrmLostReason } from "@/lib/api/crm";

export interface LostReasonDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function LostReasonDialog({ open, onCancel, onConfirm }: LostReasonDialogProps) {
  const [reasons, setReasons] = useState<CrmLostReason[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    listCrmLostReasons()
      .then((res) => setReasons(res.items))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Nu am putut încărca motivele."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!open) return;
    setReason("");
    load();
  }, [open, load]);

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Motiv pierdere"
      description="Selectează motivul pentru care leadul a fost pierdut. Câmp obligatoriu."
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Anulează
          </Button>
          <Button variant="destructive" disabled={!reason || loading} onClick={() => onConfirm(reason)}>
            Marchează pierdut
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {loading && (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Se încarcă motivele...
          </div>
        )}

        {!loading && error && (
          <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" aria-hidden="true" />}>
            <div className="flex flex-col gap-2">
              <p>{error}</p>
              <Button variant="outline" size="sm" className="w-fit" onClick={load}>
                Reîncearcă
              </Button>
            </div>
          </Alert>
        )}

        {!loading && !error && reasons.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Niciun motiv configurat încă — adaugă unul din setările pipeline-ului.
          </p>
        )}

        {!loading && !error && reasons.length > 0 && (
          <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Motiv pierdere">
            {reasons.map((r) => (
              <label
                key={r.id}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors min-h-[44px]",
                  reason === r.label
                    ? "border-primary bg-primary/10 font-semibold text-primary"
                    : "border-border hover:bg-muted/40"
                )}
              >
                <input
                  type="radio"
                  name="crm-lost-reason"
                  value={r.label}
                  checked={reason === r.label}
                  onChange={() => setReason(r.label)}
                  className="sr-only"
                />
                {r.label}
              </label>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
