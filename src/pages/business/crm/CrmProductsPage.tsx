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
import { Archive, ArchiveRestore, Boxes, Loader2, Package, Pencil, Plus } from "lucide-react";
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
                      <span className={product.lowStock ? "font-medium text-destructive" : "text-foreground"}>
                        {product.qtyOnHand}
                        {product.lowStock ? " ⚠" : ""}
                      </span>
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

// ─── Dialog „Stoc" ─────────────────────────────────────────────────────────────

/**
 * Două stări, nu două dialoguri: produsul fie n-are stoc urmărit (și atunci se pornește
 * urmărirea, cu cantitatea din depozit acum), fie are (și atunci se face o mișcare — recepție
 * sau inventar). Ambele scriu în jurnalul de inventar FinDesk, cu autor și dată; niciuna nu
 * suprascrie direct o cantitate, ca stocul să rămână explicabil în urmă.
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
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [minQty, setMinQty] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const tracks = !!product?.tracksStock;

  useEffect(() => {
    if (!product) return;
    setQty("");
    setUnitCost("");
    setMinQty(product.minQtyAlert != null ? String(product.minQtyAlert) : "");
    setNotes("");
    setFormError(null);
  }, [product]);

  const qtyNumber = Number((qty || "").replace(",", "."));
  const qtyValid = Number.isFinite(qtyNumber) && (tracks ? qtyNumber !== 0 : qtyNumber >= 0);

  async function submit() {
    if (!product || !qtyValid) return;
    setSaving(true);
    setFormError(null);
    try {
      if (tracks) {
        await adjustCrmProductStock(product.id, {
          delta: Math.trunc(qtyNumber),
          // Costul se trimite doar la intrări: la o ieșire, costul e cel mediu din inventar.
          unitCostCents: qtyNumber > 0 && unitCost.trim() ? priceToCents(unitCost) : undefined,
          notes: notes.trim() || undefined,
        });
      } else {
        await enableCrmProductStock(product.id, {
          initialQty: Math.max(0, Math.trunc(qtyNumber)),
          unitCostCents: priceToCents(unitCost),
          minQtyAlert: Math.max(0, Math.trunc(Number(minQty) || 0)),
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

  return (
    <Dialog
      open={!!product}
      onClose={onClose}
      title={tracks ? `Stoc — „${product?.name}"` : `Pornește stocul — „${product?.name}"`}
      description={
        tracks
          ? "Mișcare de stoc: pozitiv la recepție, negativ la inventar în minus. Vânzările câștigate scad singure."
          : "Produsul devine urmărit pe stoc. La fiecare oportunitate câștigată, cantitatea vândută se scade automat."
      }
      footer={
        <>
          {tracks && (
            <Button variant="ghost" onClick={() => void stopTracking()} disabled={saving}>
              Oprește urmărirea
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Renunță
          </Button>
          <Button onClick={() => void submit()} disabled={!qtyValid || saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {tracks ? "Înregistrează" : "Pornește"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {formError && <Alert variant="destructive">{formError}</Alert>}
        {tracks && (
          <p className="text-sm text-muted-foreground">
            Pe stoc acum: <span className="font-medium text-foreground">{product?.qtyOnHand}</span>{" "}
            {product?.unit}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-stock-qty" required>
              {tracks ? "Mișcare (+/−)" : "Cantitate în depozit"}
            </Label>
            <Input
              id="crm-stock-qty"
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={tracks ? "ex. 10 sau -3" : "0"}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="crm-stock-cost">Cost unitar ({product?.currency})</Label>
            <Input
              id="crm-stock-cost"
              value={unitCost}
              onChange={(e) => setUnitCost(e.target.value)}
              placeholder="ex. 120,50"
            />
            <p className="text-xs text-muted-foreground">
              Doar la intrări. Intră în costul mediu ponderat al articolului.
            </p>
          </div>
          {!tracks && (
            <div className="flex flex-col gap-1">
              <Label htmlFor="crm-stock-min">Alertă sub</Label>
              <Input
                id="crm-stock-min"
                type="number"
                value={minQty}
                onChange={(e) => setMinQty(e.target.value)}
                placeholder="0 = fără alertă"
              />
            </div>
          )}
          {tracks && (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="crm-stock-notes">Motiv</Label>
              <Input
                id="crm-stock-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="ex. recepție factură 1234 / inventar anual"
              />
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}
