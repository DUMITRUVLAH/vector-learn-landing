/**
 * CRM (Faza 1) — „⚙ Etape": editorul de etape ale pipeline-ului, deschis din antetul
 * `CrmPipelinePage`. Fiecare câmp se salvează imediat (blur pe text/număr, change pe
 * culoare/checkbox) — nu există un „Salvează" global, ca într-un tabel de setări obișnuit.
 *
 * Reordonarea e simplă (▲▼), fără librărie de drag — la fel ca board-ul, care oricum are
 * propriul HTML5 DnD nativ pentru mutarea LEAD-urilor, nu a etapelor.
 */
import { useEffect, useState } from "react";
import { ChevronUp, ChevronDown, Trash2, Plus, Loader2 } from "lucide-react";
import {
  Dialog,
  Button,
  Input,
  Label,
  Select,
  Checkbox,
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ds";
import { cn } from "@/lib/utils";
import { ApiError } from "@/lib/api";
import {
  createCrmStage,
  updateCrmStage,
  deleteCrmStage,
  reorderCrmStages,
  type CrmStage,
  type CrmStageColor,
  type UpdateCrmStageBody,
} from "@/lib/api/crm";
import { CRM_STAGE_COLORS, CRM_STAGE_COLOR_LABEL, stageColorClasses } from "@/components/crm/constants";

export interface StageEditorDialogToast {
  kind: "success" | "error";
  message: string;
}

export interface StageEditorDialogProps {
  open: boolean;
  stages: readonly CrmStage[];
  /** Pâlnia ale cărei etape se editează; absentă = implicita workspace-ului. */
  pipelineId?: string | null;
  onClose: () => void;
  /** Apelat după orice mutație reușită — părintele reîncarcă etapele + board-ul, silențios. */
  onChanged: () => void;
  onToast: (toast: StageEditorDialogToast) => void;
}

/** Traduce codurile de eroare ale serverului în propoziții — niciodată codul brut pe ecran. */
function stageErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "stage_not_empty") {
      const leads = typeof err.body.leads === "number" ? err.body.leads : undefined;
      return leads !== undefined
        ? `Etapa conține ${leads} lead-uri. Mută-le întâi.`
        : "Etapa conține lead-uri. Mută-le întâi.";
    }
    if (err.code === "stage_is_default") return "Etapele implicite nu se pot șterge.";
    if (err.code === "stage_key_taken") return "Există deja o etapă cu acest nume.";
    if (err.code === "stage_key_immutable") return "Cheia etapei nu se poate schimba.";
  }
  return err instanceof Error ? err.message : "A apărut o eroare neașteptată.";
}

export function StageEditorDialog({ open, stages, pipelineId, onClose, onChanged, onToast }: StageEditorDialogProps) {
  const [localStages, setLocalStages] = useState<CrmStage[]>([]);
  const [mutating, setMutating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState<CrmStageColor>("sky");
  const [adding, setAdding] = useState(false);

  // Re-populează DOAR la deschidere — nu la fiecare re-render cu `stages` proaspăt din părinte,
  // altfel un refresh de fundal ar întrerupe o editare în curs (input focusat, valoare tastată).
  useEffect(() => {
    if (open) setLocalStages([...stages].sort((a, b) => a.orderIndex - b.orderIndex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function persist(id: string, patch: UpdateCrmStageBody) {
    const prev = localStages;
    setLocalStages((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setMutating(true);
    try {
      await updateCrmStage(id, patch);
      onChanged();
    } catch (err) {
      setLocalStages(prev);
      onToast({ kind: "error", message: stageErrorMessage(err) });
    } finally {
      setMutating(false);
    }
  }

  async function handleMove(stage: CrmStage, direction: "up" | "down") {
    const idx = localStages.findIndex((s) => s.id === stage.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= localStages.length) return;
    const prev = localStages;
    const next = [...localStages];
    const tmp = next[idx]!;
    next[idx] = next[swapIdx]!;
    next[swapIdx] = tmp;
    setLocalStages(next);
    setMutating(true);
    try {
      const res = await reorderCrmStages(next.map((s) => s.id));
      // Sursa de adevăr pentru `orderIndex` e răspunsul serverului, nu swap-ul optimist local.
      setLocalStages([...res.items].sort((a, b) => a.orderIndex - b.orderIndex));
      onChanged();
    } catch (err) {
      setLocalStages(prev);
      onToast({ kind: "error", message: stageErrorMessage(err) });
    } finally {
      setMutating(false);
    }
  }

  async function handleDelete(stage: CrmStage) {
    const prev = localStages;
    setLocalStages((list) => list.filter((s) => s.id !== stage.id));
    setMutating(true);
    try {
      await deleteCrmStage(stage.id);
      onToast({ kind: "success", message: `Etapa „${stage.label}” a fost ștearsă.` });
      onChanged();
    } catch (err) {
      setLocalStages(prev);
      onToast({ kind: "error", message: stageErrorMessage(err) });
    } finally {
      setMutating(false);
    }
  }

  async function handleAdd() {
    if (!newLabel.trim()) return;
    setAdding(true);
    try {
      // Etapa intră în pâlnia AFIȘATĂ, nu în implicită: altfel o coloană adăugată din „B2B” ar
      // apărea pe tabla de retail.
      const created = await createCrmStage({
        label: newLabel.trim(),
        color: newColor,
        ...(pipelineId ? { pipelineId } : {}),
      });
      setLocalStages((list) => [...list, created]);
      setNewLabel("");
      setNewColor("sky");
      onToast({ kind: "success", message: `Etapa „${created.label}” a fost adăugată.` });
      onChanged();
    } catch (err) {
      onToast({ kind: "error", message: stageErrorMessage(err) });
    } finally {
      setAdding(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Etape pipeline"
      description="Redenumește, recolorează, reordonează sau adaugă etape — fiecare modificare se salvează imediat."
      size="xl"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Închide
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {localStages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nicio etapă configurată.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">Ordine</TableHead>
                <TableHead>Culoare</TableHead>
                <TableHead>Etichetă</TableHead>
                <TableHead className="w-32">Probabilitate</TableHead>
                <TableHead className="w-20">Câștigat</TableHead>
                <TableHead className="w-20">Pierdut</TableHead>
                <TableHead className="w-20">Implicit</TableHead>
                <TableHead className="w-16 text-right">Șterge</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {localStages.map((stage, idx) => (
                <TableRow key={stage.id}>
                  <TableCell>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Mută etapa ${stage.label} mai sus`}
                        disabled={mutating || idx === 0}
                        onClick={() => void handleMove(stage, "up")}
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Mută etapa ${stage.label} mai jos`}
                        disabled={mutating || idx === localStages.length - 1}
                        onClick={() => void handleMove(stage, "down")}
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn("inline-block h-3 w-3 shrink-0 rounded-full", stageColorClasses(stage.color).bg)}
                        aria-hidden="true"
                      />
                      <Select
                        aria-label={`Culoarea etapei ${stage.label}`}
                        value={stage.color}
                        disabled={mutating}
                        onChange={(e) => void persist(stage.id, { color: e.target.value as CrmStageColor })}
                        className="w-36"
                      >
                        {CRM_STAGE_COLORS.map((c) => (
                          <option key={c} value={c}>
                            {CRM_STAGE_COLOR_LABEL[c]}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StageLabelInput stage={stage} mutating={mutating} onSave={(label) => void persist(stage.id, { label })} />
                  </TableCell>
                  <TableCell>
                    <StageProbabilityInput
                      stage={stage}
                      mutating={mutating}
                      onSave={(pct) => void persist(stage.id, { probabilityPct: pct })}
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={stage.isWon}
                      disabled={mutating}
                      onChange={(next) => void persist(stage.id, { isWon: next })}
                      aria-label={`Etapa ${stage.label} e câștigată`}
                    />
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={stage.isLost}
                      disabled={mutating}
                      onChange={(next) => void persist(stage.id, { isLost: next })}
                      aria-label={`Etapa ${stage.label} e pierdută`}
                    />
                  </TableCell>
                  <TableCell>
                    {stage.isDefault && <Badge variant="outline">Implicit</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Șterge etapa ${stage.label}`}
                      disabled={mutating || stage.isDefault}
                      title={stage.isDefault ? "Etapele implicite nu se pot șterge." : undefined}
                      onClick={() => void handleDelete(stage)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-border p-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-stage-new-label">Etapă nouă</Label>
            <Input
              id="crm-stage-new-label"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="ex: Negociere"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-stage-new-color">Culoare</Label>
            <Select
              id="crm-stage-new-color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value as CrmStageColor)}
              className="w-40"
            >
              {CRM_STAGE_COLORS.map((c) => (
                <option key={c} value={c}>
                  {CRM_STAGE_COLOR_LABEL[c]}
                </option>
              ))}
            </Select>
          </div>
          <Button size="sm" onClick={() => void handleAdd()} disabled={!newLabel.trim() || adding}>
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            Adaugă etapă
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Draft local, sincronizat cu `stage.label` — salvează pe blur, doar dacă textul s-a schimbat. */
function StageLabelInput({
  stage,
  mutating,
  onSave,
}: {
  stage: CrmStage;
  mutating: boolean;
  onSave: (label: string) => void;
}) {
  const [value, setValue] = useState(stage.label);
  useEffect(() => setValue(stage.label), [stage.label]);
  return (
    <Input
      aria-label={`Eticheta etapei ${stage.label}`}
      value={value}
      disabled={mutating}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const trimmed = value.trim();
        if (trimmed && trimmed !== stage.label) onSave(trimmed);
        else setValue(stage.label);
      }}
    />
  );
}

/** Analog `StageLabelInput`, pentru procentul de probabilitate (0-100, întreg). */
function StageProbabilityInput({
  stage,
  mutating,
  onSave,
}: {
  stage: CrmStage;
  mutating: boolean;
  onSave: (pct: number) => void;
}) {
  const [value, setValue] = useState(String(stage.probabilityPct));
  useEffect(() => setValue(String(stage.probabilityPct)), [stage.probabilityPct]);
  return (
    <Input
      aria-label={`Probabilitatea etapei ${stage.label}`}
      type="number"
      min={0}
      max={100}
      value={value}
      disabled={mutating}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const n = Math.round(Number(value));
        const clamped = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : stage.probabilityPct;
        if (clamped !== stage.probabilityPct) onSave(clamped);
        else setValue(String(stage.probabilityPct));
      }}
      className="w-20"
    />
  );
}
