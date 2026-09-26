/**
 * CONTPLATA-faza-1 — pozițiile contului, legate de CRM.
 *
 * Owner-ul: „serviciile/produsele trebuie legate de CRM, să poată lua din stoc sau chiar
 * servicii/produse salvate când s-au făcut conturi de plată". Descrierea fiecărei poziții e și
 * căutare: sub ea apar produsele din catalogul CRM (cu stocul din inventar) și serviciile folosite
 * în conturile anterioare. Alegerea completează unitatea, prețul și TVA-ul; linia păstrează
 * legătura cu produsul. Stocul NU scade de aici (un cont de plată nu e o livrare) — doar avertizăm
 * când ceri mai mult decât ai.
 */
import { useEffect, useRef, useState } from "react";
import { History, Loader2, Package, Plus, Trash2 } from "lucide-react";
import { Button, Input, Label } from "@/components/ds";
import { cn } from "@/lib/utils";
import {
  getPaymentAccountCatalog,
  type CatalogProduct,
  type CatalogRecent,
} from "@/lib/api/paymentAccounts";

export interface LineDraft {
  /** Cheie stabilă pentru React — liniile se pot șterge din mijloc. */
  key: string;
  description: string;
  unit: string;
  /** Text, ca zecimalele să se tasteze natural („1,5"). */
  quantity: string;
  /** Prețul în unități majore, ca text („200", „19,99"). */
  price: string;
  vatRate: number;
  productId: string | null;
  /** Stocul produsului ales, pentru avertisment. null = produs fără stoc / text liber. */
  stock: number | null;
}

let seq = 0;
export function newLine(vatRate = 0): LineDraft {
  seq += 1;
  return { key: `l${Date.now()}-${seq}`, description: "", unit: "buc", quantity: "1", price: "", vatRate, productId: null, stock: null };
}

/** „1 234,56" / „19.99" → cenți; orice nenumeric = 0. */
export function priceToCents(s: string): number {
  const n = parseFloat((s || "").replace(/\s+/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

export function parseQty(s: string): number {
  const n = parseFloat((s || "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function centsToPrice(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, "").replace(".", ",");
}

export function lineTotalCents(l: LineDraft): number {
  const net = Math.round(parseQty(l.quantity) * priceToCents(l.price));
  return net + Math.round((net * l.vatRate) / 100);
}

const VAT_RATES = [0, 8, 12, 20];

interface LineItemsEditorProps {
  lines: LineDraft[];
  onChange: (lines: LineDraft[]) => void;
  currency: string;
  defaultVatRate: number;
  disabled?: boolean;
  formatMoney: (cents: number) => string;
}

export function LineItemsEditor({ lines, onChange, currency, defaultVatRate, disabled, formatMoney }: LineItemsEditorProps) {
  const update = (key: string, patch: Partial<LineDraft>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const remove = (key: string) => onChange(lines.length > 1 ? lines.filter((l) => l.key !== key) : [newLine(defaultVatRate)]);

  return (
    <div className="space-y-3">
      {lines.map((line, idx) => (
        <LineRow
          key={line.key}
          index={idx}
          line={line}
          currency={currency}
          disabled={disabled}
          formatMoney={formatMoney}
          onPatch={(patch) => update(line.key, patch)}
          onRemove={() => remove(line.key)}
        />
      ))}
      {!disabled && (
        <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, newLine(defaultVatRate)])}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Adaugă poziție
        </Button>
      )}
    </div>
  );
}

interface LineRowProps {
  index: number;
  line: LineDraft;
  currency: string;
  disabled?: boolean;
  formatMoney: (cents: number) => string;
  onPatch: (patch: Partial<LineDraft>) => void;
  onRemove: () => void;
}

function LineRow({ index, line, currency, disabled, formatMoney, onPatch, onRemove }: LineRowProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [recent, setRecent] = useState<CatalogRecent[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);
  const id = `pa-line-${line.key}`;

  // Catalogul se întreabă doar cât timp lista e deschisă — nu la fiecare tastă de pe orice linie.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data } = await getPaymentAccountCatalog(line.description);
        if (!alive) return;
        setProducts(data.products.slice(0, 8));
        setRecent(data.recent.slice(0, 6));
      } catch {
        if (alive) {
          setProducts([]);
          setRecent([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [open, line.description]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pickProduct(p: CatalogProduct) {
    setOpen(false);
    onPatch({
      description: p.name,
      unit: p.unit || "buc",
      price: centsToPrice(p.listPriceCents),
      vatRate: Math.round(p.vatPercent),
      productId: p.id,
      stock: p.tracksStock ? p.qtyOnHand : null,
    });
  }

  function pickRecent(r: CatalogRecent) {
    setOpen(false);
    onPatch({ description: r.description, unit: r.unit, price: centsToPrice(r.unitPriceCents), vatRate: r.vatRate, productId: null, stock: null });
  }

  const qty = parseQty(line.quantity);
  const overStock = line.stock !== null && qty > line.stock;
  const hasOptions = products.length > 0 || recent.length > 0;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div ref={boxRef} className="relative">
        <Label htmlFor={`${id}-desc`}>
          Poziția {index + 1}
          {line.productId && (
            <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-primary">
              <Package className="h-3 w-3" aria-hidden="true" />
              din catalogul CRM
            </span>
          )}
        </Label>
        <Input
          id={`${id}-desc`}
          value={line.description}
          disabled={disabled}
          autoComplete="off"
          placeholder="Scrie sau alege din catalog / servicii anterioare…"
          onFocus={() => !disabled && setOpen(true)}
          onChange={(e) => {
            // Textul schimbat de mână rupe legătura cu produsul — altfel raportarea pe produs ar minți.
            onPatch({ description: e.target.value, productId: null, stock: null });
            setOpen(true);
          }}
        />
        {open && !disabled && (loading || hasOptions) && (
          <div className="absolute z-20 mt-1 max-h-80 w-full overflow-y-auto rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
            {loading && !hasOptions && (
              <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Caut în catalog…
              </div>
            )}
            {products.length > 0 && (
              <div>
                <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Catalogul CRM</div>
                {products.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickProduct(p)}
                    className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                  >
                    <Package className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{p.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {centsToPrice(p.listPriceCents)} {p.currency} / {p.unit}
                        {p.vatPercent ? ` · TVA ${p.vatPercent}%` : ""}
                        {p.sku ? ` · ${p.sku}` : ""}
                      </span>
                    </span>
                    {p.tracksStock && (
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                          (p.qtyOnHand ?? 0) > 0 ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
                        )}
                      >
                        stoc {p.qtyOnHand ?? 0}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
            {recent.length > 0 && (
              <div className="border-t border-border">
                <div className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Folosite în conturi anterioare</div>
                {recent.map((r) => (
                  <button
                    key={`${r.description}-${r.unitPriceCents}-${r.unit}`}
                    type="button"
                    onClick={() => pickRecent(r)}
                    className="flex min-h-[44px] w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                  >
                    <History className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{r.description}</span>
                      <span className="block text-xs text-muted-foreground">
                        {centsToPrice(r.unitPriceCents)} {currency} / {r.unit} · folosit de {r.uses} ori
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1.3fr_1fr_auto]">
        <div>
          <Label htmlFor={`${id}-qty`}>Cant.</Label>
          <Input
            id={`${id}-qty`}
            inputMode="decimal"
            value={line.quantity}
            disabled={disabled}
            invalid={overStock}
            onChange={(e) => onPatch({ quantity: e.target.value.replace(/[^\d.,]/g, "") })}
          />
        </div>
        <div>
          <Label htmlFor={`${id}-unit`}>U.M.</Label>
          <Input id={`${id}-unit`} value={line.unit} disabled={disabled} onChange={(e) => onPatch({ unit: e.target.value })} />
        </div>
        <div>
          <Label htmlFor={`${id}-price`}>Preț ({currency})</Label>
          <Input
            id={`${id}-price`}
            inputMode="decimal"
            placeholder="0"
            value={line.price}
            disabled={disabled}
            onChange={(e) => onPatch({ price: e.target.value.replace(/[^\d.,\s]/g, "") })}
          />
        </div>
        <div>
          <Label htmlFor={`${id}-vat`}>TVA</Label>
          <select
            id={`${id}-vat`}
            value={line.vatRate}
            disabled={disabled}
            onChange={(e) => onPatch({ vatRate: parseInt(e.target.value, 10) || 0 })}
            className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring max-sm:h-11"
          >
            {[...new Set([...VAT_RATES, line.vatRate])].sort((a, b) => a - b).map((r) => (
              <option key={r} value={r}>
                {r}%
              </option>
            ))}
          </select>
        </div>
        <div className="col-span-2 flex items-end justify-end sm:col-span-1">
          {!disabled && (
            <Button type="button" variant="ghost" size="icon" onClick={onRemove} aria-label={`Șterge poziția ${index + 1}`}>
              <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={cn(overStock ? "font-medium text-warning" : "text-muted-foreground")}>
          {line.stock !== null
            ? overStock
              ? `În stoc sunt doar ${line.stock} — ceri ${qty}. Contul se poate emite, dar verifică livrarea.`
              : `În stoc: ${line.stock}`
            : ""}
        </span>
        <span className="text-muted-foreground">
          Total poziție: <span className="font-semibold text-foreground">{formatMoney(lineTotalCents(line))}</span>
        </span>
      </div>
    </div>
  );
}
