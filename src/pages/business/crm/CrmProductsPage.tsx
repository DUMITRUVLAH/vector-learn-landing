/**
 * CRM (Faza 1) — Produse: catalogul de cursuri/servicii vândute prin CRM.
 *
 * Tabel + dialog de adăugare/editare, arhivare/restaurare cu confirmare, și un
 * comutator „arată arhivate". Prețul e stocat în cenți; formularul îl citește
 * în unități întregi (ex. „150" → 15000 cenți), la fel ca restul FinDesk-ului.
 *
 * Stocul: coloana „Stoc" și dialogul de mișcare nu țin o cantitate proprie a CRM-ului —
 * arată și mișcă articolul de inventar FinDesk legat de produs (vezi
 * server/lib/crm/productStock.ts). Un produs fără legătură e un serviciu: nu are stoc și
 * nu se scade nimic la vânzare.
 */
import { useCallback, useEffect, useState } from "react";
import { Archive, ArchiveRestore, ArrowRight, Boxes, Loader2, Minus, Package, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { BusinessShell } from "@/components/business/BusinessShell";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  Input,
  Label,
  Select,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from "@/components/ds";
import { ApiError } from "@/lib/api";
import {
  adjustCrmProductStock,
  archiveCrmProduct,
  createCrmProduct,
  disableCrmProductStock,
  enableCrmProductStock,
  listCrmProducts,
  restoreCrmProduct,
  setCrmProductStockThreshold,
  updateCrmProduct,
  type CrmProduct,
} from "@/lib/api/crm";
import { CRM_CURRENCIES } from "@/components/crm/constants";

// ─── Formatters ───────────────────────────────────────────────────────────────

/** Aceeași convenție locală ca în restul FinDesk (vezi `AgreementDrawer.tsx`). */
function formatCents(cents: number, currency: string): string {
  return new Intl.NumberFormat("ro-MD", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

/** „150" / „150,50" → cenți. Analog `leiToCents` din `FinInvoiceCreateModal.tsx`. */
function priceToCents(text: string): number {
  const n = parseFloat((text || "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

const SKU_TAKEN_MESSAGE = "Acest SKU este deja folosit de alt produs activ — alege alt cod.";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.code === "sku_taken") return SKU_TAKEN_MESSAGE;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

// ─── Pagina principală ─────────────────────────────────────────────────────────

export function CrmProductsPage() {
  const [products, setProducts] = useState<CrmProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<CrmProduct | null>(null);
  const [stockFor, setStockFor] = useState<CrmProduct | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listCrmProducts(showArchived);
      setProducts(res.items);
    } catch (err) {
      setError(errorMessage(err, "Eroare la încărcarea produselor."));
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  function openNew() {
    setEditing(null);
    setShowForm(true);
  }

  function openEdit(product: CrmProduct) {
    setEditing(product);
    setShowForm(true);
  }

  async function handleArchive(product: CrmProduct) {
    if (!confirm(`Arhivezi produsul „${product.name}"? Nu va mai putea fi ales în oferte noi.`)) return;
    try {
      await archiveCrmProduct(product.id);
      void load();
    } catch (err) {
      setError(errorMessage(err, "Nu am putut arhiva produsul."));
    }
  }

  async function handleRestore(product: CrmProduct) {
    try {
      await restoreCrmProduct(product.id);
      void load();
    } catch (err) {
      setError(errorMessage(err, "Nu am putut restaura produsul."));
    }
  }

  const activeCount = products.filter((p) => p.isActive).length;
  const lowStockProducts = products.filter(
    (p) => p.isActive && p.tracksStock && stockLevel(p.qtyOnHand ?? 0, p.minQtyAlert ?? 0) !== "ok"
  );

  return (
    <BusinessShell
      pageTitle="Produse"
      pageDescription={`${activeCount} produse active${showArchived ? ` · ${products.length - activeCount} arhivate` : ""}`}
      actions={
        <Button onClick={openNew}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Produs nou
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        {!loading && lowStockProducts.length > 0 && (
          <Alert
            variant="destructive"
            title={`${lowStockProducts.length} ${lowStockProducts.length === 1 ? "produs are" : "produse au"} stoc scăzut`}
          >
            <div className="mt-1 flex flex-wrap gap-2">
              {lowStockProducts.map((p) => (
                <Button key={p.id} variant="outline" size="sm" onClick={() => setStockFor(p)}>
                  {p.name} · {p.qtyOnHand} {p.unit}
                </Button>
              ))}
            </div>
          </Alert>
        )}

        <div className="flex items-center gap-2">
          <Switch checked={showArchived} onChange={setShowArchived} aria-label="Arată produsele arhivate" />
          <span className="text-sm text-muted-foreground">Arată și produsele arhivate</span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16" role="status">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Se încarcă produsele..." />
          </div>
        ) : products.length === 0 ? (
          <EmptyState
            icon={<Package className="h-6 w-6" />}
            title="Niciun produs încă"
            description="Adaugă primul curs sau serviciu din catalog, cu preț și TVA."
            action={
              <Button onClick={openNew}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Produs nou
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead>Denumire</TableHead>
                <TableHead>Unitate</TableHead>
                <TableHead className="text-right">Preț</TableHead>
                <TableHead className="text-right">TVA</TableHead>
                <TableHead className="text-right">Stoc</TableHead>
                <TableHead>Stare</TableHead>
                <TableHead className="text-right">Acțiuni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{product.sku}</TableCell>
                  <TableCell>
                    <p className="font-medium text-foreground">{product.name}</p>
                    {product.category && <p className="text-xs text-muted-foreground">{product.category}</p>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{product.unit}</TableCell>
                  <TableCell className="text-right tabular-nums text-foreground">
                    {formatCents(product.listPriceCents, product.currency)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {/* Coloană `numeric` în Postgres — drizzle o expune ca șir, nu ca number. */}
                    {Number(product.vatPercent)}%
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {product.tracksStock ? (
                      <StockCell product={product} onOpen={() => setStockFor(product)} />
                    ) : (
                      // „—", nu „0": un serviciu n-are stoc zero, n-are stoc deloc.
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {product.isActive ? (
                      <Badge variant="success">Activ</Badge>
                    ) : (
                      <Badge variant="secondary">Arhivat</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={
                          product.tracksStock
                            ? `Gestionează stocul pentru ${product.name}`
                            : `Pornește urmărirea stocului pentru ${product.name}`
                        }
                        onClick={() => setStockFor(product)}
                      >
                        <Boxes className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editează produsul ${product.name}`}
                        onClick={() => openEdit(product)}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      {product.isActive ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Arhivează produsul ${product.name}`}
                          onClick={() => void handleArchive(product)}
                        >
                          <Archive className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Restaurează produsul ${product.name}`}
                          onClick={() => void handleRestore(product)}
                        >
                          <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <ProductStockDialog
        product={stockFor}
        onClose={() => setStockFor(null)}
        onSaved={() => {
          setStockFor(null);
          void load();
        }}
      />

      <ProductFormDialog
        open={showForm}
        editing={editing}
        onClose={() => setShowForm(false)}
        onSaved={() => {
          setShowForm(false);
          void load();
        }}
      />
    </BusinessShell>
  );
}

// ─── Dialog „Produs nou / Editează produs" ─────────────────────────────────────

function ProductFormDialog({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: CrmProduct | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<string>(CRM_CURRENCIES[0]);
  const [vatPercent, setVatPercent] = useState("0");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Formular curat la fiecare deschidere — pre-completat când editează un produs existent.
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setSku(editing?.sku ?? "");
    setCategory(editing?.category ?? "");
    setUnit(editing?.unit ?? "");
    setPrice(editing ? (editing.listPriceCents / 100).toFixed(2) : "");
    setCurrency(editing?.currency ?? CRM_CURRENCIES[0]);
    setVatPercent(editing ? String(editing.vatPercent) : "0");
    setDescription(editing?.description ?? "");
    setFormError(null);
  }, [open, editing]);

  const isValid = name.trim().length > 0 && sku.trim().length > 0 && unit.trim().length > 0;

  async function submit() {
    if (!isValid) return;
    setSaving(true);
    setFormError(null);
    const body = {
      name: name.trim(),
      sku: sku.trim(),
      category: category.trim() || undefined,
      description: description.trim() || undefined,
      unit: unit.trim(),
      listPriceCents: priceToCents(price),
      currency,
      vatPercent: Math.max(0, Math.min(100, Number(vatPercent) || 0)),
    };
    try {
      if (editing) {
        await updateCrmProduct(editing.id, body);
      } else {
        await createCrmProduct(body);
      }
      onSaved();
    } catch (err) {
      setFormError(errorMessage(err, "Nu am putut salva produsul."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? `Editează „${editing.name}"` : "Produs nou"}
      description="Denumirea, SKU-ul și unitatea sunt obligatorii."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Renunță
          </Button>
          <Button onClick={() => void submit()} disabled={!isValid || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Salvează
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {formError && <Alert variant="destructive">{formError}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-product-name" required>
              Denumire
            </Label>
            <Input id="crm-product-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-product-sku" required>
              SKU
            </Label>
            <Input id="crm-product-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-product-category">Categorie</Label>
            <Input id="crm-product-category" value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-product-unit" required>
              Unitate
            </Label>
            <Input
              id="crm-product-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="ex: buc, oră, lună"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-product-price">Preț listă</Label>
            <Input
              id="crm-product-price"
              type="text"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^\d.,]/g, ""))}
              placeholder="ex: 150"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-product-currency">Monedă</Label>
            <Select id="crm-product-currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CRM_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-product-vat">TVA (%)</Label>
            <Input
              id="crm-product-vat"
              type="number"
              min={0}
              max={100}
              value={vatPercent}
              onChange={(e) => setVatPercent(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="crm-product-description">Descriere</Label>
          <Textarea
            id="crm-product-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
      </div>
    </Dialog>
  );
}

// ─── Stocul: nivel, culoare, stepper ──────────────────────────────────────────

type StockLevel = "out" | "low" | "ok";

/**
 * Roșu la prag SAU la zero. `lowStock` de la server e fals când pragul e 0 („fără alertă"),
 * dar un produs epuizat nu e „în regulă" doar pentru că nimeni n-a ales un prag.
 */
function stockLevel(qty: number, minQtyAlert: number): StockLevel {
  if (qty <= 0) return "out";
  if (minQtyAlert > 0 && qty <= minQtyAlert) return "low";
  return "ok";
}

const LEVEL_TONE: Record<StockLevel, string> = {
  out: "bg-destructive/10 text-destructive",
  low: "bg-destructive/10 text-destructive",
  ok: "bg-muted text-foreground",
};

/** Cantitate întreagă ≥ 0 din ce a tastat omul; gol sau text → 0. */
function parseQty(text: string): number {
  const n = Math.trunc(Number((text || "").replace(",", ".")));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

interface QtyStepperProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  unit: string;
  /** Numele câmpului, pentru butoanele −/+ citite de cititorul de ecran. */
  label: string;
}

/** [−] 5 [+] buc — butoane de 44px, iar câmpul din mijloc rămâne tastabil pentru cantități mari. */
function QtyStepper({ id, value, onChange, unit, label }: QtyStepperProps) {
  const n = parseQty(value);
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        className="touch-target"
        aria-label={`${label}: scade cu 1`}
        onClick={() => onChange(String(Math.max(0, n - 1)))}
        disabled={n <= 0}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-24 text-center text-lg font-semibold tabular-nums"
      />
      <Button
        variant="outline"
        size="icon"
        className="touch-target"
        aria-label={`${label}: crește cu 1`}
        onClick={() => onChange(String(n + 1))}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </Button>
      <span className="text-sm text-muted-foreground">{unit}</span>
    </div>
  );
}

const QUICK_QTY = [1, 5, 10, 25];

const REASONS: Record<"in" | "out", string[]> = {
  in: ["Recepție marfă", "Retur de la client", "Corecție inventar"],
  out: ["Inventar în minus", "Marfă deteriorată", "Folosit intern"],
};

interface StockCellProps {
  product: CrmProduct;
  onOpen: () => void;
}

/** Cifra din tabel e și ușa spre dialog: pe ea se uită omul când vrea să schimbe stocul. */
function StockCell({ product, onOpen }: StockCellProps) {
  const qty = product.qtyOnHand ?? 0;
  const min = product.minQtyAlert ?? 0;
  const level = stockLevel(qty, min);
  const state = level === "out" ? ", epuizat" : level === "low" ? ", stoc scăzut" : "";
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Stoc ${product.name}: ${qty} ${product.unit}${state}. Modifică`}
      className={cn(
        "inline-flex flex-col items-end rounded-md px-2 py-1 tabular-nums transition-colors hover:ring-1 hover:ring-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        LEVEL_TONE[level],
        level !== "ok" && "font-semibold"
      )}
    >
      <span>{qty}</span>
      {min > 0 && <span className="text-xs font-normal opacity-80">min {min}</span>}
    </button>
  );
}

// ─── Dialog „Stoc" ─────────────────────────────────────────────────────────────

/**
 * Două stări, nu două dialoguri: produsul fie n-are stoc urmărit (și atunci se pornește
 * urmărirea, cu cantitatea din depozit acum), fie are (și atunci se face o mișcare — recepție
 * sau inventar). Ambele scriu în jurnalul de inventar FinDesk, cu autor și dată; niciuna nu
 * suprascrie direct o cantitate, ca stocul să rămână explicabil în urmă.
 *
 * Mișcarea se alege ca pe telefon: „Adaug" sau „Scot", apoi câte — nu un număr cu semn pe care
 * omul trebuie să-l scrie cu minus. Dialogul arată dinainte cât rămâne după, cu roșu dacă
 * ajunge la prag, și nu lasă să scoți mai mult decât e pe stoc.
 */
function ProductStockDialog({
  product,
  onClose,
  onSaved,
}: {
  product: CrmProduct | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [direction, setDirection] = useState<"in" | "out">("in");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [minQty, setMinQty] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const tracks = !!product?.tracksStock;
  const unit = product?.unit || "buc";
  const onHand = product?.qtyOnHand ?? 0;
  const savedMin = product?.minQtyAlert ?? 0;

  useEffect(() => {
    if (!product) return;
    setDirection("in");
    setQty(product.tracksStock ? "1" : "");
    setUnitCost("");
    setMinQty(String(product.minQtyAlert ?? 0));
    setNotes("");
    setFormError(null);
  }, [product]);

  const qtyNumber = parseQty(qty);
  const minNumber = parseQty(minQty);
  const delta = direction === "in" ? qtyNumber : -qtyNumber;
  const after = onHand + delta;
  const tooMuchOut = tracks && direction === "out" && qtyNumber > onHand;
  const minChanged = tracks && minNumber !== savedMin;

  const canSave = tracks ? (qtyNumber > 0 && !tooMuchOut) || (qtyNumber === 0 && minChanged) : true;

  async function submit() {
    if (!product || !canSave) return;
    setSaving(true);
    setFormError(null);
    try {
      if (tracks) {
        if (qtyNumber > 0) {
          await adjustCrmProductStock(product.id, {
            delta,
            // Costul se trimite doar la intrări: la o ieșire, costul e cel mediu din inventar.
            unitCostCents: direction === "in" && unitCost.trim() ? priceToCents(unitCost) : undefined,
            notes: notes.trim() || undefined,
          });
        }
        if (minChanged) await setCrmProductStockThreshold(product.id, minNumber);
      } else {
        await enableCrmProductStock(product.id, {
          initialQty: qtyNumber,
          unitCostCents: priceToCents(unitCost),
          minQtyAlert: minNumber,
        });
      }
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.code === "insufficient_stock") {
        setFormError("Nu poți scoate mai mult decât e pe stoc.");
      } else {
        setFormError(errorMessage(err, "Nu am putut salva mișcarea de stoc."));
      }
    } finally {
      setSaving(false);
    }
  }

  async function stopTracking() {
    if (!product) return;
    if (!confirm(`Oprești urmărirea stocului pentru „${product.name}"? Istoricul de mișcări rămâne.`))
      return;
    setSaving(true);
    try {
      await disableCrmProductStock(product.id);
      onSaved();
    } catch (err) {
      setFormError(errorMessage(err, "Nu am putut opri urmărirea."));
    } finally {
      setSaving(false);
    }
  }

  const saveLabel = !tracks
    ? "Pornește urmărirea"
    : qtyNumber > 0
      ? `${direction === "in" ? "Adaugă" : "Scoate"} ${qtyNumber} ${unit}`
      : minChanged
        ? "Salvează limita"
        : "Înregistrează";

  const nowLevel = stockLevel(onHand, savedMin);
  const afterLevel = stockLevel(after, minNumber);

  const limitField = (
    <div className="flex flex-col gap-1">
      <Label htmlFor="crm-stock-min">Roșu când rămân cel mult</Label>
      <QtyStepper id="crm-stock-min" value={minQty} onChange={setMinQty} unit={unit} label="Limita de alertă" />
      <p className="text-xs text-muted-foreground">0 = fără alertă. Produsul apare cu roșu și primești notificare.</p>
    </div>
  );

  return (
    <Dialog
      open={!!product}
      onClose={onClose}
      title={tracks ? `Stoc — „${product?.name}"` : `Pornește stocul — „${product?.name}"`}
      description={
        tracks
          ? "Alege dacă adaugi sau scoți, apoi câte. Vânzările câștigate scad singure din stoc."
          : "Produsul devine urmărit pe stoc. La fiecare oportunitate câștigată, cantitatea vândută se scade automat."
      }
      footer={
        <>
          {tracks && (
            <Button
              variant="ghost"
              className="mr-auto text-muted-foreground"
              onClick={() => void stopTracking()}
              disabled={saving}
            >
              Oprește urmărirea
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Renunță
          </Button>
          <Button
            variant={tracks && direction === "out" && qtyNumber > 0 ? "destructive" : "default"}
            onClick={() => void submit()}
            disabled={!canSave || saving}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {saveLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {formError && <Alert variant="destructive">{formError}</Alert>}

        {tracks ? (
          <>
            {/* Acum → după: omul vede rezultatul înainte să apese, nu după. Grila `1fr auto 1fr`
                ține cele două casete egale cu săgeata îngustă între ele — scara Tailwind n-o are. */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2" aria-live="polite">
              <div className={cn("rounded-lg p-3 text-center", LEVEL_TONE[nowLevel])}>
                <p className="text-xs font-medium opacity-80">Pe stoc acum</p>
                <p className="text-3xl font-semibold tabular-nums">{onHand}</p>
                <p className="text-xs opacity-80">
                  {nowLevel === "out" ? "epuizat" : nowLevel === "low" ? "stoc scăzut" : unit}
                </p>
              </div>
              <ArrowRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <div
                className={cn(
                  "rounded-lg p-3 text-center",
                  tooMuchOut ? "bg-destructive/10 text-destructive" : LEVEL_TONE[afterLevel]
                )}
              >
                <p className="text-xs font-medium opacity-80">După</p>
                <p className="text-3xl font-semibold tabular-nums">{tooMuchOut ? "—" : after}</p>
                <p className="text-xs opacity-80">
                  {tooMuchOut
                    ? "nu ajunge"
                    : afterLevel === "out"
                      ? "epuizat"
                      : afterLevel === "low"
                        ? "stoc scăzut"
                        : unit}
                </p>
              </div>
            </div>

            <div role="group" aria-label="Tipul mișcării" className="grid grid-cols-2 gap-2">
              <button
                type="button"
                aria-pressed={direction === "in"}
                onClick={() => setDirection("in")}
                className={cn(
                  "touch-target flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  direction === "in"
                    ? "border-success bg-success/10 text-success"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <Plus className="h-5 w-5" aria-hidden="true" />
                Adaug pe stoc
              </button>
              <button
                type="button"
                aria-pressed={direction === "out"}
                onClick={() => setDirection("out")}
                className={cn(
                  "touch-target flex items-center justify-center gap-2 rounded-lg border-2 px-3 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  direction === "out"
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-border text-muted-foreground hover:bg-muted"
                )}
              >
                <Minus className="h-5 w-5" aria-hidden="true" />
                Scot din stoc
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="crm-stock-qty">Câte {direction === "in" ? "adaugi" : "scoți"}</Label>
              <div className="flex flex-wrap items-center gap-3">
                <QtyStepper id="crm-stock-qty" value={qty} onChange={setQty} unit={unit} label="Cantitatea" />
                <div className="flex gap-1">
                  {QUICK_QTY.map((n) => (
                    <Button
                      key={n}
                      variant={qtyNumber === n ? "secondary" : "ghost"}
                      size="sm"
                      onClick={() => setQty(String(n))}
                      aria-label={`${n} ${unit}`}
                    >
                      {n}
                    </Button>
                  ))}
                </div>
              </div>
              {tooMuchOut && (
                <p className="text-sm text-destructive">
                  Ai doar {onHand} {unit} pe stoc — nu poți scoate {qtyNumber}.
                </p>
              )}
            </div>

            {direction === "in" && (
              <div className="flex flex-col gap-1">
                <Label htmlFor="crm-stock-cost">Cost unitar ({product?.currency}) — opțional</Label>
                <Input
                  id="crm-stock-cost"
                  inputMode="decimal"
                  value={unitCost}
                  onChange={(e) => setUnitCost(e.target.value)}
                  placeholder="ex. 120,50"
                />
                <p className="text-xs text-muted-foreground">Intră în costul mediu ponderat al articolului.</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label htmlFor="crm-stock-notes">Motiv</Label>
              <div className="flex flex-wrap gap-1">
                {REASONS[direction].map((r) => (
                  <Button
                    key={r}
                    variant={notes === r ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setNotes(r)}
                  >
                    {r}
                  </Button>
                ))}
              </div>
              <Input
                id="crm-stock-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="sau scrie tu, ex. factura 1234"
              />
            </div>

            {limitField}
          </>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <Label htmlFor="crm-stock-qty">Câte ai în depozit acum</Label>
              <QtyStepper id="crm-stock-qty" value={qty} onChange={setQty} unit={unit} label="Cantitatea" />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="crm-stock-cost">Cost unitar ({product?.currency})</Label>
              <Input
                id="crm-stock-cost"
                inputMode="decimal"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="ex. 120,50"
              />
            </div>
            {limitField}
          </>
        )}
      </div>
    </Dialog>
  );
}
