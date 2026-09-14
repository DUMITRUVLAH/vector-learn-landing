/**
 * CRM (Faza 1) — „Motiv pierdere": dialogul obligatoriu la mutarea unui lead într-o etapă
 * marcată `isLost` (verificat pe FLAG, nu pe cheia literală „lost" — o etapă „Pierdut" redenumită
 * sau o etapă custom marcată „pierdut" din `StageEditorDialog` trebuie să ceară motivul la fel).
 *
 * Extras din `CrmPipelinePage.tsx` — folosit și de board (drag/select) și de `LeadDetailSheet`
 * (select-ul de stadiu din „Acțiuni rapide"), ca regula să nu se dubleze în două locuri.
 */
import { useEffect, useState } from "react";
import { Dialog, Button, Input, Label } from "@/components/ds";
import { cn } from "@/lib/utils";
import { CRM_LOST_REASON_PRESETS } from "@/components/crm/constants";

export interface LostReasonDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function LostReasonDialog({ open, onCancel, onConfirm }: LostReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
    setCustom("");
  }, [open]);

  const effectiveReason = reason === "Altul" ? custom.trim() : reason;

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
          <Button variant="destructive" disabled={!effectiveReason} onClick={() => onConfirm(effectiveReason)}>
            Marchează pierdut
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Motiv pierdere">
          {CRM_LOST_REASON_PRESETS.map((preset) => (
            <label
              key={preset}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors",
                reason === preset
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-border hover:bg-muted/40"
              )}
            >
              <input
                type="radio"
                name="crm-lost-reason"
                value={preset}
                checked={reason === preset}
                onChange={() => setReason(preset)}
                className="sr-only"
              />
              {preset}
            </label>
          ))}
        </div>
        {reason === "Altul" && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-lost-custom">Detalii</Label>
            <Input
              id="crm-lost-custom"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Descrie motivul..."
              autoFocus
            />
          </div>
        )}
      </div>
    </Dialog>
  );
}
