/**
 * TB-001: TaskBoard — pagina Produse/Cursuri (landing-ul modulului).
 * Listă produse + creare produs (nume, tip, dată start/end — ancorele șabloanelor).
 * Vector 365 semantic tokens, light+dark, a11y.
 */
import { useState, useEffect, useCallback } from "react";
import { Plus, Package, Calendar, Loader2, AlertCircle, Archive, KanbanSquare } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Link } from "@/router/HashRouter";
import {
  listBoardProducts,
  createBoardProduct,
  archiveBoardProduct,
  type BoardProduct,
} from "@/lib/api/boardProducts";
import { formatDateRo } from "@/lib/board/dates";
import { cn } from "@/lib/utils";

const KIND_LABELS: Record<string, string> = {
  course: "Curs",
  product: "Produs",
  cohort: "Cohortă",
};

export function BoardProductsPage() {
  const [products, setProducts] = useState<BoardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("course");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listBoardProducts();
      setProducts(res.products);
    } catch {
      setError("Eroare la încărcarea produselor. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await createBoardProduct({
        name: name.trim(),
        kind,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      setName("");
      setStartDate("");
      setEndDate("");
      setShowForm(false);
      await load();
    } catch {
      setSaveError("Nu am putut crea produsul. Încearcă din nou.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(id: string) {
    try {
      await archiveBoardProduct(id);
      await load();
    } catch {
      setError("Nu am putut arhiva produsul.");
    }
  }

  return (
    <BusinessShell
      pageTitle="Task Board — Produse"
      pageDescription="Planifică taskuri per produs/curs: definește produsul, apoi planifică taskurile în board."
      actions={
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          Produs nou
        </button>
      }
    >
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-lg border border-border bg-card p-4 space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <label htmlFor="tb-product-name" className="block text-sm font-medium text-foreground mb-1">
                Nume produs/curs
              </label>
              <input
                id="tb-product-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. Engleză B2 — ediția toamnă"
                required
                maxLength={200}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="tb-product-kind" className="block text-sm font-medium text-foreground mb-1">
                Tip
              </label>
              <select
                id="tb-product-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              >
                <option value="course">Curs</option>
                <option value="product">Produs</option>
                <option value="cohort">Cohortă</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="tb-product-start" className="block text-sm font-medium text-foreground mb-1">
                  Start
                </label>
                <input
                  id="tb-product-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
                />
              </div>
              <div>
                <label htmlFor="tb-product-end" className="block text-sm font-medium text-foreground mb-1">
                  Final
                </label>
                <input
                  id="tb-product-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
                />
              </div>
            </div>
          </div>
          {saveError && (
            <p className="flex items-center gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {saveError}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Creează produs
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
            >
              Anulează
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-label="Se încarcă" />
        </div>
      ) : error ? (
        <p className="flex items-center gap-2 py-8 text-sm text-destructive" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : products.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="mt-4 text-sm text-muted-foreground">
            Niciun produs încă. Creează primul produs/curs ca să începi planificarea taskurilor.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-border bg-card p-4 card-hover flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-foreground">{p.name}</h3>
                  <span
                    className={cn(
                      "mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                    )}
                  >
                    {KIND_LABELS[p.kind] ?? p.kind}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleArchive(p.id)}
                  aria-label={`Arhivează ${p.name}`}
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors touch-target"
                >
                  <Archive className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
                {p.startDate ? formatDateRo(p.startDate) : "fără dată start"} →{" "}
                {p.endDate ? formatDateRo(p.endDate) : "fără dată final"}
              </p>
              <Link
                to={`/business/board?productId=${p.id}`}
                className="mt-auto inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px] w-fit"
              >
                <KanbanSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
                Vezi boardurile
              </Link>
            </li>
          ))}
        </ul>
      )}
    </BusinessShell>
  );
}
