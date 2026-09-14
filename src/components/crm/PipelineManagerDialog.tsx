/**
 * CRM Faza 9 — administrarea pâlniilor workspace-ului („Vânzări”, „B2B”, …).
 *
 * Portare din crm-vector (`PipelineManagerModal.tsx`), adaptată la design-system-ul FinFlow și
 * la regulile serverului: pâlnia implicită nu se poate șterge, iar una cu leaduri cere mutarea
 * lor întâi (409 `pipeline_not_empty`) — codurile serverului se traduc în propoziții, niciodată
 * afișate ca atare.
 *
 * Pâlnia nouă se naște cu cele 5 etape implicite (le face serverul) — deci e utilizabilă din
 * prima, nu un Kanban fără coloane.
 */
import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Check, X, Pencil } from "lucide-react";
import { Alert, Button, Dialog, Input, Label } from "@/components/ds";
import { ApiError } from "@/lib/api";
import {
  createCrmPipeline,
  deleteCrmPipeline,
  renameCrmPipeline,
  type CrmPipeline,
} from "@/lib/api/crm";

export interface PipelineManagerDialogToast {
  kind: "success" | "error";
  message: string;
}

export interface PipelineManagerDialogProps {
  open: boolean;
  pipelines: readonly CrmPipeline[];
  onClose: () => void;
  /** Apelat după orice mutație reușită — părintele reîncarcă lista + tabla. */
  onChanged: (opts?: { selectId?: string; removedId?: string }) => void;
  onToast: (toast: PipelineManagerDialogToast) => void;
}

/** Traduce codurile serverului în propoziții — niciodată codul brut pe ecran. */
function pipelineErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "pipeline_not_empty") {
      const leads = typeof err.body.leads === "number" ? err.body.leads : undefined;
      return leads !== undefined
        ? `Pâlnia are ${leads} lead${leads === 1 ? "" : "uri"}. Mută-le întâi în altă pâlnie (din fișa fiecărui lead).`
        : "Pâlnia mai are leaduri. Mută-le întâi în altă pâlnie.";
    }
    if (err.code === "pipeline_is_default") return "Pâlnia implicită nu se poate șterge.";
    if (err.code === "pipeline_stages_seed_failed") return "Nu am putut crea etapele pâlniei. Încearcă din nou.";
    if (err.code === "not_found") return "Pâlnia nu mai există.";
  }
  return err instanceof Error ? err.message : "A apărut o eroare neașteptată.";
}

export function PipelineManagerDialog({
  open,
  pipelines,
  onClose,
  onChanged,
  onToast,
}: PipelineManagerDialogProps) {
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNewName("");
    setEditingId(null);
    setEditingName("");
  }, [open]);

  async function addPipeline() {
    const name = newName.trim();
    if (!name) return;
    setAdding(true);
    try {
      const created = await createCrmPipeline(name);
      setNewName("");
      onToast({ kind: "success", message: `Pâlnia „${created.name}” a fost creată, cu etapele ei.` });
      // Selectăm pâlnia nouă: omul tocmai a creat-o, vrea s-o vadă, nu s-o caute în selector.
      onChanged({ selectId: created.id });
    } catch (err) {
      onToast({ kind: "error", message: pipelineErrorMessage(err) });
    } finally {
      setAdding(false);
    }
  }

  async function saveRename(pipeline: CrmPipeline) {
    const name = editingName.trim();
    if (!name || name === pipeline.name) {
      setEditingId(null);
      return;
    }
    setBusyId(pipeline.id);
    try {
      await renameCrmPipeline(pipeline.id, name);
      setEditingId(null);
      onToast({ kind: "success", message: "Pâlnia a fost redenumită." });
      onChanged();
    } catch (err) {
      onToast({ kind: "error", message: pipelineErrorMessage(err) });
    } finally {
      setBusyId(null);
    }
  }

  async function removePipeline(pipeline: CrmPipeline) {
    if (!confirm(`Ștergi pâlnia „${pipeline.name}”? Etapele ei dispar odată cu ea.`)) return;
    setBusyId(pipeline.id);
    try {
      await deleteCrmPipeline(pipeline.id);
      onToast({ kind: "success", message: `Pâlnia „${pipeline.name}” a fost ștearsă.` });
      onChanged({ removedId: pipeline.id });
    } catch (err) {
      onToast({ kind: "error", message: pipelineErrorMessage(err) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Pâlnii"
      description="Fiecare linie de business își are propriul proces: etape proprii, leaduri separate."
      footer={
        <Button variant="ghost" onClick={onClose}>
          Închide
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {pipelines.length === 0 ? (
          <Alert>Nicio pâlnie încă. Prima se creează mai jos.</Alert>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Pâlniile workspace-ului">
            {pipelines.map((p) => {
              const busy = busyId === p.id;
              const editing = editingId === p.id;
              return (
                <li key={p.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
                  {editing ? (
                    <>
                      <Label htmlFor={`crm-pipeline-name-${p.id}`} className="sr-only">
                        Nume pâlnie
                      </Label>
                      <Input
                        id={`crm-pipeline-name-${p.id}`}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void saveRename(p);
                          }
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        className="h-9 flex-1"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        aria-label={`Salvează numele pâlniei ${p.name}`}
                        onClick={() => void saveRename(p)}
                        disabled={busy}
                      >
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        ) : (
                          <Check className="h-4 w-4" aria-hidden="true" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        aria-label="Renunță la redenumire"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{p.name}</span>
                      {p.isDefault && (
                        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          implicită
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Redenumește pâlnia ${p.name}`}
                        onClick={() => {
                          setEditingId(p.id);
                          setEditingName(p.name);
                        }}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      {/* Implicita nu primește buton de ștergere: serverul o refuză oricum, iar un
                          buton care nu poate reuși e o promisiune falsă. */}
                      {!p.isDefault && (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Șterge pâlnia ${p.name}`}
                          onClick={() => void removePipeline(p)}
                          disabled={busy}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          )}
                        </Button>
                      )}
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="crm-new-pipeline">Pâlnie nouă</Label>
            <Input
              id="crm-new-pipeline"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addPipeline();
                }
              }}
              placeholder="ex: B2B"
            />
          </div>
          <Button onClick={() => void addPipeline()} disabled={!newName.trim() || adding}>
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Plus className="h-4 w-4" aria-hidden="true" />
            )}
            Adaugă
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
