/**
 * BRANCH-701: Branches (Filiale) management page + consolidated/per-branch stats view
 * Route: /app/branches
 */
import { useEffect, useState } from "react";
import { Plus, Building2, Users, GraduationCap, TrendingUp, Trash2 } from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { cn } from "@/lib/utils";
import {
  listBranches,
  getBranchStats,
  getBranchRollup,
  createBranch,
  deleteBranch,
  type Branch,
  type BranchStats,
  type BranchRollup,
} from "@/lib/api/branches";
import { formatCents } from "@/lib/utils";

type ViewMode = "consolidated" | "per-branch";

export function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stats, setStats] = useState<BranchStats[]>([]);
  const [rollup, setRollup] = useState<BranchRollup | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("consolidated");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Branch | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const loadData = () => {
    setLoading(true);
    Promise.all([listBranches(), getBranchStats(), getBranchRollup()])
      .then(([branchesData, statsData, rollupData]) => {
        setBranches(branchesData.items);
        setStats(statsData.items);
        setRollup(rollupData);
        setError(null);
      })
      .catch(() => setError("Nu s-au putut încărca filialele."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDeleteBranch = async () => {
    if (!deleteTarget) return;
    try {
      await deleteBranch(deleteTarget.id);
      setDeleteTarget(null);
      setDeleteError(null);
      loadData();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Eroare la ștergere.");
    }
  };

  return (
    <AppShell
      pageTitle="Filiale"
      pageDescription="Gestionează filialele (locațiile) academiei tale."
      actions={
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Adaugă filială
        </button>
      }
    >
      <div className="space-y-6">
        {/* View toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode("consolidated")}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md border transition-colors",
              viewMode === "consolidated"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted"
            )}
          >
            Consolidat
          </button>
          <button
            type="button"
            onClick={() => setViewMode("per-branch")}
            className={cn(
              "px-3 py-1.5 text-sm rounded-md border transition-colors",
              viewMode === "per-branch"
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background border-border hover:bg-muted"
            )}
          >
            Per filială
          </button>
        </div>

        {loading && (
          <p className="text-sm text-muted-foreground animate-pulse">Se încarcă...</p>
        )}

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        {!loading && !error && viewMode === "consolidated" && rollup && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={Building2}
              label="Filiale active"
              value={String(rollup.totalBranches)}
            />
            <KpiCard
              icon={Users}
              label="Total elevi"
              value={String(rollup.totalStudents)}
            />
            <KpiCard
              icon={GraduationCap}
              label="Total profesori"
              value={String(rollup.totalTeachers)}
            />
            <KpiCard
              icon={TrendingUp}
              label="Venit luna curentă"
              value={formatCents(rollup.totalRevenue)}
            />
          </div>
        )}

        {!loading && !error && viewMode === "per-branch" && (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold">Statistici per filială</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Filială</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Elevi</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Profesori</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">Venit lună</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        Nu există filiale. Adaugă prima filială.
                      </td>
                    </tr>
                  )}
                  {stats.map((s) => {
                    const branch = branches.find((b) => b.id === s.branchId);
                    return (
                      <tr key={s.branchId} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-medium">{s.branchName}</span>
                            {s.isDefault && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                                implicit
                              </span>
                            )}
                          </div>
                          {s.address && (
                            <p className="text-xs text-muted-foreground mt-0.5 ml-6">{s.address}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">{s.studentCount}</td>
                        <td className="px-4 py-3 text-right">{s.teacherCount}</td>
                        <td className="px-4 py-3 text-right">{formatCents(s.revenueCurrentMonth)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            aria-label={`Șterge filiala ${s.branchName}`}
                            onClick={() => { if (branch) setDeleteTarget(branch); }}
                            className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && !error && branches.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nicio filială definită.</p>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
            >
              <Plus className="h-4 w-4" />
              Adaugă prima filială
            </button>
          </div>
        )}
      </div>

      {/* Add Branch Modal */}
      {showAddModal && (
        <AddBranchModal
          onClose={() => setShowAddModal(false)}
          onCreated={() => {
            setShowAddModal(false);
            loadData();
          }}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <ConfirmDeleteModal
          branchName={deleteTarget.name}
          error={deleteError}
          onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
          onConfirm={handleDeleteBranch}
        />
      )}
    </AppShell>
  );
}

interface KpiCardProps {
  icon: React.ElementType;
  label: string;
  value: string;
}

function KpiCard({ icon: Icon, label, value }: KpiCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </p>
      <p className="text-2xl font-bold tracking-tight">{value}</p>
    </div>
  );
}

interface AddBranchModalProps {
  onClose: () => void;
  onCreated: () => void;
}

function AddBranchModal({ onClose, onCreated }: AddBranchModalProps) {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Numele filialei este obligatoriu.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createBranch({ name: name.trim(), address: address.trim() || null });
      onCreated();
    } catch {
      setError("Nu s-a putut crea filiala. Încearcă din nou.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-lg border border-border shadow-xl p-6 w-full max-w-sm mx-4 z-10">
        <h2 className="text-base font-semibold mb-1">Adaugă filială nouă</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Definește o nouă locație / filială sub acest tenant.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="branch-name" className="text-sm font-medium">
              Nume filială <span className="text-destructive">*</span>
            </label>
            <input
              id="branch-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex: București Nord"
              disabled={saving}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="branch-address" className="text-sm font-medium">Adresă</label>
            <input
              id="branch-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="ex: Str. Victoriei 12, București"
              disabled={saving}
              className="w-full px-3 py-2 text-sm rounded-md border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors disabled:opacity-50"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? "Se salvează..." : "Adaugă filială"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ConfirmDeleteModalProps {
  branchName: string;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmDeleteModal({ branchName, error, onCancel, onConfirm }: ConfirmDeleteModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-card rounded-lg border border-border shadow-xl p-6 w-full max-w-sm mx-4 z-10">
        <h2 className="text-base font-semibold mb-1">Șterge filiala</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Sigur vrei să ștergi filiala <strong>{branchName}</strong>?
          Această acțiune este ireversibilă. Filiala nu poate fi ștearsă dacă are elevi asignați.
        </p>
        {error && <p className="text-sm text-destructive mb-3">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            Anulează
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-3 py-1.5 text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-colors"
          >
            Șterge
          </button>
        </div>
      </div>
    </div>
  );
}
