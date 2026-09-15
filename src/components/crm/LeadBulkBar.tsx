/**
 * CRM — bara de acțiuni în masă peste leadurile selectate din listă.
 *
 * De ce exista nevoia: segmentarea (cerința 4) scoate 60 de firme dintr-o industrie, iar până
 * acum singura cale de a le atribui unui agent era să deschizi 60 de fișe. Repartizarea era
 * „Da" în matrice, dar numai la firul ierbii.
 *
 * Trei lucruri pe care bara le face deliberat altfel decât un „selectează tot → aplică":
 *
 * 1. **Spune pe ce lucrează.** „14 selectate pe această pagină" — nu „14 selectate". Selecția nu
 *    trece peste paginare, iar un om care crede că a selectat tot segmentul de 300 ar rămâne cu
 *    286 de leaduri neatinse fără să știe.
 * 2. **Arată ce NU s-a făcut.** Serverul întoarce lista celor sărite, cu motiv; bara o traduce
 *    („3 leaduri nu au etapa asta în pâlnia lor"). Un „gata!" peste un rezultat parțial e mai
 *    rău decât o eroare.
 * 3. **Cere motivul la „pierdut"**, exact ca mutarea unui singur lead — regula urmărește flagul
 *    `isLost` al etapei, nu litera „pierdut", deci merge și pe etape redenumite.
 */
import { useState } from "react";
import { Loader2, Users2, X } from "lucide-react";
import { Button, Input, Label, Select } from "@/components/ds";
import {
  bulkCrmLeads,
  type CrmBulkAction,
  type CrmBulkResponse,
  type CrmBulkSkipReason,
  type CrmStage,
} from "@/lib/api/crm";

export interface LeadBulkBarProps {
  selectedIds: string[];
  stages: readonly CrmStage[];
  /** Responsabilii posibili: id → nume. */
  members: { id: string; fullName: string }[];
  /** Golește selecția și reîncarcă lista după o acțiune reușită. */
  onDone: (summary: CrmBulkResponse) => void;
  onCancel: () => void;
  onToast?: (t: { kind: "success" | "error"; message: string }) => void;
}

const SKIP_LABEL: Record<CrmBulkSkipReason, string> = {
  not_found: "nu mai există",
  unknown_stage: "nu au etapa asta în pâlnia lor",
  lost_reason_required: "cer un motiv de pierdere",
  already_tagged: "aveau deja eticheta",
  already_assigned: "aveau deja responsabil",
  no_rule_matched: "nu s-au potrivit cu nicio regulă de repartizare",
};

/** Rezumat în cuvinte, nu în coduri: „12 actualizate · 3 nu au etapa asta în pâlnia lor". */
export function summarizeBulk(res: CrmBulkResponse): string {
  const parts = [`${res.updated} ${res.updated === 1 ? "lead actualizat" : "leaduri actualizate"}`];
  const byReason = new Map<CrmBulkSkipReason, number>();
  for (const s of res.skipped) byReason.set(s.reason, (byReason.get(s.reason) ?? 0) + 1);
  for (const [reason, count] of byReason) parts.push(`${count} ${SKIP_LABEL[reason]}`);
  return parts.join(" · ");
}

export function LeadBulkBar({ selectedIds, stages, members, onDone, onCancel, onToast }: LeadBulkBarProps) {
  const [action, setAction] = useState<CrmBulkAction>("assign");
  const [assignedTo, setAssignedTo] = useState("");
  const [stageKey, setStageKey] = useState(stages[0]?.key ?? "");
  const [lostReason, setLostReason] = useState("");
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);

  const targetStage = stages.find((s) => s.key === stageKey);
  const needsLostReason = action === "stage" && !!targetStage?.isLost;

  const disabled =
    busy ||
    selectedIds.length === 0 ||
    (action === "stage" && (!stageKey || (needsLostReason && !lostReason.trim()))) ||
    (action === "tag" && !tag.trim());

  async function apply() {
    setBusy(true);
    try {
      const res = await bulkCrmLeads({
        leadIds: selectedIds,
        action,
        ...(action === "assign" ? { assignedTo: assignedTo || null } : {}),
        ...(action === "stage" ? { stage: stageKey, lostReason: needsLostReason ? lostReason.trim() : null } : {}),
        ...(action === "tag" ? { tag: tag.trim() } : {}),
      });
      onToast?.({ kind: res.updated > 0 ? "success" : "error", message: summarizeBulk(res) });
      setLostReason("");
      setTag("");
      onDone(res);
    } catch (err) {
      onToast?.({
        kind: "error",
        message: err instanceof Error ? err.message : "Acțiunea în masă nu a putut fi aplicată.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex flex-wrap items-end gap-2 rounded-lg border border-primary/40 bg-primary/5 p-3"
      role="region"
      aria-label="Acțiuni în masă"
    >
      <p className="mr-1 inline-flex h-10 items-center gap-2 text-sm font-semibold text-foreground">
        <Users2 className="h-4 w-4" aria-hidden="true" />
        {selectedIds.length} {selectedIds.length === 1 ? "selectat" : "selectate"} pe această pagină
      </p>

      <div className="w-full sm:w-52">
        <Label htmlFor="crm-bulk-action" className="sr-only">
          Acțiune în masă
        </Label>
        <Select id="crm-bulk-action" value={action} onChange={(e) => setAction(e.target.value as CrmBulkAction)}>
          <option value="assign">Schimbă responsabilul</option>
          <option value="auto-assign">Repartizează după reguli</option>
          <option value="stage">Mută în etapă</option>
          <option value="tag">Adaugă etichetă</option>
        </Select>
      </div>

      {action === "assign" && (
        <div className="w-full sm:w-52">
          <Label htmlFor="crm-bulk-assignee" className="sr-only">
            Responsabil
          </Label>
          <Select id="crm-bulk-assignee" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
            <option value="">Fără responsabil</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.fullName}
              </option>
            ))}
          </Select>
        </div>
      )}

      {action === "stage" && (
        <>
          <div className="w-full sm:w-52">
            <Label htmlFor="crm-bulk-stage" className="sr-only">
              Etapă țintă
            </Label>
            <Select id="crm-bulk-stage" value={stageKey} onChange={(e) => setStageKey(e.target.value)}>
              {stages.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
          {needsLostReason && (
            <div className="w-full sm:w-64">
              <Label htmlFor="crm-bulk-lost-reason">Motivul pierderii (obligatoriu)</Label>
              <Input
                id="crm-bulk-lost-reason"
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                placeholder="ex: preț prea mare"
              />
            </div>
          )}
        </>
      )}

      {action === "tag" && (
        <div className="w-full sm:w-52">
          <Label htmlFor="crm-bulk-tag" className="sr-only">
            Eticheta de adăugat
          </Label>
          <Input
            id="crm-bulk-tag"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            placeholder="ex: campanie-toamna"
          />
        </div>
      )}

      <Button type="button" onClick={() => void apply()} disabled={disabled}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        Aplică
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
        <X className="h-4 w-4" aria-hidden="true" />
        Renunță
      </Button>
    </div>
  );
}
