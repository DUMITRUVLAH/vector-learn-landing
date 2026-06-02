/**
 * BRANCH-702 — /app/branches
 *
 * Branch management page: list all branches, create new, edit, delete.
 * Shows the BranchSwitcher in action.
 */
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import {
  getBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  type Branch,
  type CreateBranchPayload,
} from "@/lib/api/branches";
import { Building2, Plus, Loader2, AlertCircle, Pencil, Trash2, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Create/Edit Dialog ────────────────────────────────────────────────────────

interface BranchDialogProps {
  initial?: Branch | null;
  onClose: () => void;
  onSaved: (branch: Branch) => void;
}

function BranchDialog({ initial, onClose, onSaved }: BranchDialogProps) {
  const [form, setForm] = useState<CreateBranchPayload>({
    name: initial?.name ?? "",
    address: initial?.address ?? "",
    isDefault: initial?.isDefault ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Numele filialei este obligatoriu.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (initial) {
        const result = await updateBranch(initial.id, form);
        onSaved(result.branch);
      } else {
        const result = await createBranch(form);
        onSaved(result.branch);
      }
    } catch {
      setError("Eroare la salvare. Încercați din nou.");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50";
  const labelCls = "block text-sm font-medium text-foreground mb-1";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={initial ? "Editare filială" : "Filială nouă"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-card border border-border shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">
            {initial ? "Editare filială" : "Filială nouă"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 hover:bg-muted"
            aria-label="Închide dialog"
          >
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div>
            <label className={labelCls} htmlFor="branch-name">
              Denumire filială <span className="text-destructive">*</span>
            </label>
            <input
              id="branch-name"
              type="text"
              placeholder="ex. Filiala Cluj"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className={inputCls}
              required
            />
          </div>

          <div>
            <label className={labelCls} htmlFor="branch-address">
              Adresă (opțional)
            </label>
            <input
              id="branch-address"
              type="text"
              placeholder="Str. Principală 1, Cluj-Napoca"
              value={form.address ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="branch-default"
              type="checkbox"
              checked={form.isDefault ?? false}
              onChange={(e) => setForm((p) => ({ ...p, isDefault: e.target.checked }))}
              className="h-4 w-4 rounded border-border"
            />
            <label htmlFor="branch-default" className="text-sm text-foreground cursor-pointer">
              Setează ca filială implicită
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
            >
              Anulare
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {initial ? "Salvează" : "Crează filială"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BranchesPage() {
  const { data: session } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const data = await getBranches();
      setBranches(data.branches);
    } catch {
      setError("Eroare la încărcarea filialelor.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (session) load();
  }, [session]);

  function handleSaved(branch: Branch) {
    setBranches((prev) => {
      const idx = prev.findIndex((b) => b.id === branch.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = branch;
        return next;
      }
      return [...prev, branch];
    });
    setShowDialog(false);
    setEditBranch(null);
  }

  async function handleDelete(branch: Branch) {
    if (branch.isDefault) {
      setDeleteError("Nu puteți șterge filiala implicită.");
      return;
    }
    if (!window.confirm(`Ștergeți filiala "${branch.name}"? Această acțiune nu poate fi anulată.`)) {
      return;
    }
    setDeletingId(branch.id);
    setDeleteError(null);
    try {
      await deleteBranch(branch.id);
      setBranches((prev) => prev.filter((b) => b.id !== branch.id));
    } catch {
      setDeleteError("Eroare la ștergere. Încercați din nou.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AppShell
      pageTitle="Filiale"
      pageDescription="Gestionați locațiile rețelei dumneavoastră"
      actions={
        <button
          type="button"
          onClick={() => {
            setEditBranch(null);
            setShowDialog(true);
          }}
          className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm text-white hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          Filială nouă
        </button>
      }
    >
      {deleteError && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive mb-4">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {deleteError}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Se încarcă...
        </div>
      )}

      {!loading && !error && branches.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Building2 className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Nu există filiale configurate.</p>
          <button
            type="button"
            onClick={() => setShowDialog(true)}
            className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            Creează prima filială
          </button>
        </div>
      )}

      {!loading && !error && branches.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {branches.map((branch) => (
            <div
              key={branch.id}
              className="rounded-xl border border-border bg-card p-5 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-5 w-5 text-primary flex-shrink-0" aria-hidden="true" />
                  <h3 className="font-semibold text-foreground truncate">{branch.name}</h3>
                </div>
                {branch.isDefault && (
                  <span className="flex items-center gap-1 rounded-full bg-green-100 dark:bg-green-900/30 px-2 py-0.5 text-xs font-medium text-green-800 dark:text-green-300 flex-shrink-0">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    Implicită
                  </span>
                )}
              </div>

              {branch.address && (
                <p className="text-sm text-muted-foreground">{branch.address}</p>
              )}

              <p className="text-xs text-muted-foreground">
                Creată: {new Date(branch.createdAt).toLocaleDateString("ro-RO")}
              </p>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setEditBranch(branch);
                    setShowDialog(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted"
                  aria-label={`Editare ${branch.name}`}
                >
                  <Pencil className="h-3 w-3" aria-hidden="true" />
                  Editare
                </button>

                {!branch.isDefault && (
                  <button
                    type="button"
                    onClick={() => handleDelete(branch)}
                    disabled={deletingId === branch.id}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10",
                      deletingId === branch.id && "opacity-50 cursor-not-allowed"
                    )}
                    aria-label={`Ștergere ${branch.name}`}
                  >
                    {deletingId === branch.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    )}
                    Ștergere
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showDialog && (
        <BranchDialog
          initial={editBranch}
          onClose={() => {
            setShowDialog(false);
            setEditBranch(null);
          }}
          onSaved={handleSaved}
        />
      )}
    </AppShell>
  );
}
