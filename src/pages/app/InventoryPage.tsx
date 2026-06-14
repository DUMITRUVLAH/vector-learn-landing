/**
 * INVENTORY-003: Pagina gestiune stoc materiale didactice
 * Ruta: /app/fin/inventory
 *
 * Tab-uri:
 *   1. Articole       — catalog cu stoc curent + valoare + alert stoc minim
 *   2. Mișcări        — jurnal cronologic cu filtre
 *   3. Adaugă mișcare — formular manuală
 */

import { useState, useEffect, useCallback } from "react";
import {
  Package,
  Plus,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  ArrowRightLeft,
  Loader2,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import { AppShell } from "@/components/app/AppShell";
import { useSession } from "@/hooks/useSession";
import {
  listInventoryItems,
  createInventoryItem,
  updateInventoryItem,
  listStockMovements,
  createStockMovement,
  getStockValue,
  type InventoryItem,
  type StockMovement,
  type InventoryCategory,
  type MovementType,
  type InventoryUnit,
  type StockValueSummary,
} from "@/lib/api/finInventory";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMDL(cents: number): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency: "MDL",
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  consumabile: "Consumabile",
  active_mici: "Active mici",
  materiale_didactice: "Mat. didactice",
  papetarie: "Papetărie",
  electronice: "Electronice",
  altele: "Altele",
};

const UNIT_LABELS: Record<InventoryUnit, string> = {
  buc: "buc",
  kg: "kg",
  l: "l",
  m: "m",
  set: "set",
  pachet: "pachet",
};

const MOVEMENT_META: Record<MovementType, { label: string; cls: string; icon: React.ReactNode }> = {
  purchase: {
    label: "Achiziție",
    cls: "bg-success/15 text-success",
    icon: <TrendingUp className="h-3 w-3" />,
  },
  sale: {
    label: "Vânzare",
    cls: "bg-primary/15 text-primary",
    icon: <TrendingDown className="h-3 w-3" />,
  },
  adjustment: {
    label: "Ajustare",
    cls: "bg-muted text-muted-foreground",
    icon: <ArrowRightLeft className="h-3 w-3" />,
  },
  transfer_in: {
    label: "Transfer intrare",
    cls: "bg-warning/15 text-warning",
    icon: <TrendingUp className="h-3 w-3" />,
  },
  transfer_out: {
    label: "Transfer ieșire",
    cls: "bg-warning/15 text-warning",
    icon: <TrendingDown className="h-3 w-3" />,
  },
};

type Tab = "articole" | "miscari" | "adauga";

// ─── Banner stoc ──────────────────────────────────────────────────────────────

function StockBanner() {
  const [summary, setSummary] = useState<StockValueSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getStockValue()
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex gap-6 rounded-xl border border-border bg-card p-4 animate-pulse">
        <div className="h-8 w-40 rounded bg-muted" />
        <div className="h-8 w-28 rounded bg-muted" />
        <div className="h-8 w-28 rounded bg-muted" />
      </div>
    );
  }

  if (!summary) return null;

  return (
    <div className="flex flex-wrap gap-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Valoare totală stoc</span>
        <span className="text-lg font-semibold text-foreground">
          {formatMDL(summary.totalValueCents)}
        </span>
      </div>
      <div className="h-auto w-px bg-border" />
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Articole active</span>
        <span className="text-lg font-semibold text-foreground">{summary.totalItems}</span>
      </div>
      <div className="h-auto w-px bg-border" />
      <div className="flex flex-col">
        <span className="text-xs text-muted-foreground">Cantitate totală</span>
        <span className="text-lg font-semibold text-foreground">{summary.totalQty} buc</span>
      </div>
      {summary.belowMinAlert > 0 && (
        <>
          <div className="h-auto w-px bg-border" />
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-1">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <span className="text-sm font-medium text-destructive">
              {summary.belowMinAlert} articol{summary.belowMinAlert > 1 ? "e" : ""} sub stoc minim
            </span>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Modal articol nou ────────────────────────────────────────────────────────

interface NewItemModalProps {
  onClose: () => void;
  onCreated: (item: InventoryItem) => void;
}

function NewItemModal({ onClose, onCreated }: NewItemModalProps) {
  const [form, setForm] = useState({
    name: "",
    sku: "",
    unit: "buc" as InventoryUnit,
    category: "" as InventoryCategory | "",
    minQtyAlert: 0,
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const { item } = await createInventoryItem({
        name: form.name.trim(),
        sku: form.sku.trim() || null,
        unit: form.unit,
        category: form.category || null,
        minQtyAlert: form.minQtyAlert,
        description: form.description.trim() || null,
      });
      onCreated(item);
    } catch {
      setError("Eroare la creare articol. Încearcă din nou.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Articol nou"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-foreground mb-4">Articol nou</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="item-name" className="text-sm font-medium text-foreground">
              Denumire <span aria-hidden="true" className="text-destructive">*</span>
            </label>
            <input
              id="item-name"
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="ex: Caiete A4 80 file"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="item-sku" className="text-sm font-medium text-foreground">
                Cod articol (SKU)
              </label>
              <input
                id="item-sku"
                type="text"
                value={form.sku}
                onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="CAI-A4-80"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="item-unit" className="text-sm font-medium text-foreground">
                Unitate
              </label>
              <select
                id="item-unit"
                value={form.unit}
                onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value as InventoryUnit }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(["buc", "kg", "l", "m", "set", "pachet"] as InventoryUnit[]).map((u) => (
                  <option key={u} value={u}>{UNIT_LABELS[u]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="item-category" className="text-sm font-medium text-foreground">
                Categorie
              </label>
              <select
                id="item-category"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as InventoryCategory | "" }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— fără —</option>
                {(Object.keys(CATEGORY_LABELS) as InventoryCategory[]).map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor="item-min-qty" className="text-sm font-medium text-foreground">
                Stoc minim alertă
              </label>
              <input
                id="item-min-qty"
                type="number"
                min={0}
                value={form.minQtyAlert}
                onChange={(e) => setForm((f) => ({ ...f, minQtyAlert: parseInt(e.target.value) || 0 }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="item-desc" className="text-sm font-medium text-foreground">
              Descriere
            </label>
            <textarea
              id="item-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Opțional..."
            />
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">{error}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Creează articol
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Tab Articole ─────────────────────────────────────────────────────────────

function ArticoleTab() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<InventoryCategory | "">("");
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { items: data } = await listInventoryItems({
        category: categoryFilter || undefined,
      });
      setItems(data);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter]);

  useEffect(() => {
    load();
  }, [load]);

  function handleCreated(item: InventoryItem) {
    setItems((prev) => [...prev, item].sort((a, b) => a.name.localeCompare(b.name)));
    setShowNewModal(false);
  }

  async function handleToggleActive(item: InventoryItem) {
    try {
      const { item: updated } = await updateInventoryItem(item.id, { isActive: !item.isActive });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <label htmlFor="cat-filter" className="sr-only">Filtrează după categorie</label>
          <select
            id="cat-filter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as InventoryCategory | "")}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">Toate categoriile</option>
            {(Object.keys(CATEGORY_LABELS) as InventoryCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <button
            onClick={load}
            aria-label="Reîncarcă"
            className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Articol nou
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border p-12 text-center">
          <Package className="h-12 w-12 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">Niciun articol în catalog.</p>
          <button
            onClick={() => setShowNewModal(true)}
            className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Adaugă primul articol
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Articol</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">SKU</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Categorie</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Stoc</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Cost mediu</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Valoare totală</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Alert</th>
                <th className="px-4 py-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const isBelowMin =
                  item.minQtyAlert !== null &&
                  item.minQtyAlert > 0 &&
                  item.qtyOnHand < item.minQtyAlert;
                const totalValue = item.qtyOnHand * item.avgCostCents;
                const isEditing = editingId === item.id;

                return (
                  <tr
                    key={item.id}
                    className={cn(
                      "border-b border-border last:border-0 hover:bg-muted/30 transition-colors",
                      !item.isActive && "opacity-50"
                    )}
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {item.name}
                      {!item.isActive && (
                        <span className="ml-2 text-xs text-muted-foreground">(arhivat)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                      {item.sku || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {item.category ? CATEGORY_LABELS[item.category] : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {item.qtyOnHand} {UNIT_LABELS[item.unit]}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatMDL(item.avgCostCents)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-foreground">
                      {formatMDL(totalValue)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isBelowMin ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive"
                          title={`Stoc minim: ${item.minQtyAlert}`}
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Alert
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setEditingId(isEditing ? null : item.id)}
                        aria-label={`Detalii ${item.name}`}
                        className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <ChevronRight className={cn("h-4 w-4 transition-transform", isEditing && "rotate-90")} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showNewModal && (
        <NewItemModal
          onClose={() => setShowNewModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}

// ─── Tab Mișcări ──────────────────────────────────────────────────────────────

function MiscariTab() {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<MovementType | "">("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const LIMIT = 50;

  const load = useCallback(async (reset = false) => {
    const nextPage = reset ? 1 : page;
    setLoading(true);
    try {
      const { movements: data } = await listStockMovements({
        type: typeFilter || undefined,
        page: nextPage,
        limit: LIMIT,
      });
      if (reset) {
        setMovements(data);
        setPage(1);
      } else {
        setMovements((prev) => [...prev, ...data]);
      }
      setHasMore(data.length === LIMIT);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, page]);

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label htmlFor="type-filter" className="sr-only">Filtrează după tip</label>
        <select
          id="type-filter"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as MovementType | "")}
          className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Toate tipurile</option>
          {(Object.keys(MOVEMENT_META) as MovementType[]).map((t) => (
            <option key={t} value={t}>{MOVEMENT_META[t].label}</option>
          ))}
        </select>
        <button
          onClick={() => load(true)}
          aria-label="Reîncarcă mișcări"
          className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted transition-colors"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {loading && movements.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : movements.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          Nicio mișcare înregistrată.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Data</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Articol</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tip</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Cantitate</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Cost unitar</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Referință</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const meta = MOVEMENT_META[m.movementType as MovementType];
                  return (
                    <tr
                      key={m.id}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDate(m.movedAt)}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">
                        {m.itemId.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", meta?.cls)}>
                          {meta?.icon}
                          {meta?.label ?? m.movementType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {m.qty}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        {m.unitCostCents > 0 ? formatMDL(m.unitCostCents) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-foreground">
                        {formatMDL(m.totalCostCents)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {m.reference || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hasMore && (
            <button
              onClick={() => {
                setPage((p) => p + 1);
                load(false);
              }}
              disabled={loading}
              className="w-full rounded-lg border border-border py-2 text-sm text-muted-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {loading ? "Se încarcă…" : "Mai multe"}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tab Adaugă mișcare ───────────────────────────────────────────────────────

function AdaugaMiscareTab() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [form, setForm] = useState({
    itemId: "",
    movementType: "purchase" as MovementType,
    qty: 1,
    unitCostCents: 0,
    reference: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    listInventoryItems().then(({ items: data }) => setItems(data)).catch(() => {});
  }, []);

  const selectedItem = items.find((i) => i.id === form.itemId);
  const isOutbound = form.movementType === "sale" || form.movementType === "transfer_out";
  const estimatedNewQty = selectedItem
    ? isOutbound
      ? selectedItem.qtyOnHand - form.qty
      : selectedItem.qtyOnHand + form.qty
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.itemId || form.qty < 1) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await createStockMovement({
        itemId: form.itemId,
        movementType: form.movementType,
        qty: form.qty,
        unitCostCents: Math.round(form.unitCostCents * 100),
        reference: form.reference.trim() || null,
        notes: form.notes.trim() || null,
      });
      setSuccess(`Mișcare ${MOVEMENT_META[form.movementType].label.toLowerCase()} înregistrată.`);
      setForm((f) => ({ ...f, qty: 1, reference: "", notes: "", unitCostCents: 0 }));
    } catch (err) {
      if (err instanceof Error && err.message.includes("insufficient_stock")) {
        setError("Stoc insuficient pentru această ieșire.");
      } else {
        setError("Eroare la înregistrare. Încearcă din nou.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1">
          <label htmlFor="mov-item" className="text-sm font-medium text-foreground">
            Articol <span aria-hidden="true" className="text-destructive">*</span>
          </label>
          <select
            id="mov-item"
            required
            value={form.itemId}
            onChange={(e) => setForm((f) => ({ ...f, itemId: e.target.value }))}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">— selectează articol —</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name} (stoc: {i.qtyOnHand} {UNIT_LABELS[i.unit]})
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label htmlFor="mov-type" className="text-sm font-medium text-foreground">
            Tip mișcare <span aria-hidden="true" className="text-destructive">*</span>
          </label>
          <select
            id="mov-type"
            required
            value={form.movementType}
            onChange={(e) => setForm((f) => ({ ...f, movementType: e.target.value as MovementType }))}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {(Object.keys(MOVEMENT_META) as MovementType[]).map((t) => (
              <option key={t} value={t}>{MOVEMENT_META[t].label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="mov-qty" className="text-sm font-medium text-foreground">
              Cantitate <span aria-hidden="true" className="text-destructive">*</span>
            </label>
            <input
              id="mov-qty"
              type="number"
              min={1}
              required
              value={form.qty}
              onChange={(e) => setForm((f) => ({ ...f, qty: parseInt(e.target.value) || 1 }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="mov-cost" className="text-sm font-medium text-foreground">
              Cost unitar (MDL)
            </label>
            <input
              id="mov-cost"
              type="number"
              min={0}
              step={0.01}
              value={form.unitCostCents}
              onChange={(e) => setForm((f) => ({ ...f, unitCostCents: parseFloat(e.target.value) || 0 }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="0.00"
            />
          </div>
        </div>

        {selectedItem && (
          <div className="rounded-lg bg-muted/40 border border-border p-3 text-sm">
            <span className="text-muted-foreground">Stoc estimat după mișcare: </span>
            <span
              className={cn(
                "font-semibold",
                estimatedNewQty !== null && estimatedNewQty < 0
                  ? "text-destructive"
                  : "text-foreground"
              )}
            >
              {estimatedNewQty} {UNIT_LABELS[selectedItem.unit]}
            </span>
            {estimatedNewQty !== null && estimatedNewQty < 0 && (
              <span className="ml-2 text-destructive text-xs">(stoc insuficient)</span>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label htmlFor="mov-ref" className="text-sm font-medium text-foreground">
              Referință document
            </label>
            <input
              id="mov-ref"
              type="text"
              value={form.reference}
              onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="NIR-001, FC-2026-xxx"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="mov-notes" className="text-sm font-medium text-foreground">
              Note
            </label>
            <input
              id="mov-notes"
              type="text"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Opțional..."
            />
          </div>
        </div>

        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        {success && <p className="text-sm text-success" role="status">{success}</p>}

        <button
          type="submit"
          disabled={saving || !form.itemId || form.qty < 1}
          className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Înregistrează mișcare
        </button>
      </form>
    </div>
  );
}

// ─── Pagina principală ────────────────────────────────────────────────────────

export function InventoryPage() {
  const { status } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>("articole");

  if (status === "loading") {
    return (
      <AppShell pageTitle="Inventar">
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "articole", label: "Articole" },
    { key: "miscari", label: "Mișcări" },
    { key: "adauga", label: "Adaugă mișcare" },
  ];

  return (
    <AppShell pageTitle="Inventar">
      <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Package className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Inventar</h1>
              <p className="text-sm text-muted-foreground">
                Gestiunea stocurilor de materiale didactice și consumabile
              </p>
            </div>
          </div>
          <a
            href="#/app/fin/inventory/report"
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Raport stoc
          </a>
        </div>

        {/* Banner sumar */}
        <StockBanner />

        {/* Tab-uri */}
        <div>
          <nav
            role="tablist"
            aria-label="Secțiuni inventar"
            className="flex gap-1 border-b border-border"
          >
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                role="tab"
                aria-selected={activeTab === key}
                aria-controls={`tab-panel-${key}`}
                id={`tab-${key}`}
                onClick={() => setActiveTab(key)}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                  activeTab === key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="pt-4">
            {activeTab === "articole" && (
              <div
                role="tabpanel"
                id="tab-panel-articole"
                aria-labelledby="tab-articole"
              >
                <ArticoleTab />
              </div>
            )}
            {activeTab === "miscari" && (
              <div
                role="tabpanel"
                id="tab-panel-miscari"
                aria-labelledby="tab-miscari"
              >
                <MiscariTab />
              </div>
            )}
            {activeTab === "adauga" && (
              <div
                role="tabpanel"
                id="tab-panel-adauga"
                aria-labelledby="tab-adauga"
              >
                <AdaugaMiscareTab />
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
