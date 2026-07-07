/**
 * TB-001: TaskBoard — lista de boarduri (toate sau filtrate pe produs prin ?productId=).
 * Creare board (nume + produs) → boardul nou vine cu cele 4 liste implicite.
 */
import { useState, useEffect, useCallback } from "react";
import { Plus, KanbanSquare, Loader2, AlertCircle, Package } from "lucide-react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { Link, useRouter } from "@/router/HashRouter";
import { listBoards, createBoard, type Board } from "@/lib/api/board";
import { listBoardProducts, type BoardProduct } from "@/lib/api/boardProducts";

export function BoardListPage() {
  const { path } = useRouter();
  // Filtrul de produs vine din query-ul hash-ului (#/business/board?productId=…).
  const productFilter = path.match(/[?&]productId=([0-9a-f-]{36})/i)?.[1] ?? null;

  const [boards, setBoards] = useState<Board[]>([]);
  const [products, setProducts] = useState<BoardProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [productId, setProductId] = useState<string>(productFilter ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [boardsRes, productsRes] = await Promise.all([
        listBoards(productFilter ?? undefined),
        listBoardProducts(),
      ]);
      setBoards(boardsRes.boards);
      setProducts(productsRes.products);
    } catch {
      setError("Eroare la încărcarea boardurilor. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }, [productFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const productName = (id: string | null) =>
    id ? (products.find((p) => p.id === id)?.name ?? "—") : null;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await createBoard({ name: name.trim(), productId: productId || null });
      setName("");
      setShowForm(false);
      await load();
    } catch {
      setSaveError("Nu am putut crea boardul. Încearcă din nou.");
    } finally {
      setSaving(false);
    }
  }

  const filterProduct = productFilter ? products.find((p) => p.id === productFilter) : null;

  return (
    <BusinessShell
      pageTitle={filterProduct ? `Boarduri — ${filterProduct.name}` : "Task Board — Boarduri"}
      pageDescription="Un board grupează taskurile unui produs: planifică în Tabel, apoi vizualizează în Kanban și Calendar."
      actions={
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors min-h-[44px]"
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
          Board nou
        </button>
      }
    >
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-lg border border-border bg-card p-4 space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="tb-board-name" className="block text-sm font-medium text-foreground mb-1">
                Nume board
              </label>
              <input
                id="tb-board-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex. Lansare ediția toamnă"
                required
                maxLength={200}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              />
            </div>
            <div>
              <label htmlFor="tb-board-product" className="block text-sm font-medium text-foreground mb-1">
                Produs (opțional)
              </label>
              <select
                id="tb-board-product"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
              >
                <option value="">Board generic (fără produs)</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
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
              Creează board
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
      ) : boards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card px-6 py-16 text-center">
          <KanbanSquare className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="mt-4 text-sm text-muted-foreground">
            Niciun board încă. Creează un board ca să începi planificarea.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map((b) => (
            <li key={b.id}>
              <Link
                to={`/business/board/${b.id}`}
                className="block rounded-lg border border-border bg-card p-4 card-hover"
              >
                <h3 className="font-semibold text-foreground">{b.name}</h3>
                {b.description && (
                  <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{b.description}</p>
                )}
                {productName(b.productId) && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Package className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {productName(b.productId)}
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </BusinessShell>
  );
}
