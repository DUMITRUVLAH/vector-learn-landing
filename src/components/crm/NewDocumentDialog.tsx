/**
 * CRM — „fă o ofertă din lead-ul ăsta".
 *
 * Dialogul alege tipul actului și pozițiile (din catalogul de produse sau scrise
 * de mână), apoi creează CIORNA și trimite omul în editorul de acte al FinFlow.
 * Nu duplicăm acolo editorul: finalizarea, numărul, PDF-ul și trimiterea pe
 * email au deja un ecran care le face bine.
 *
 * Un lucru pe care îl arătăm înainte de apăsare: totalul. Oferta e documentul
 * care pleacă la client cu un preț pe el; omul trebuie să vadă suma ÎNAINTE, nu
 * s-o descopere în PDF.
 */
import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { Alert, Button, Dialog, Input, Label, Select } from "@/components/ds";
import { listCrmProducts, type CrmProduct } from "@/lib/api/crm";
import { createCrmDocument, CRM_DOC_KIND_LABELS, type CrmDocKind } from "@/lib/api/crmDocuments";
import { docPath } from "@/lib/docs/paths";

interface ChosenProduct {
  productId: string;
  quantity: number;
  /** Gol = prețul din catalog. Text, ca omul să poată șterge câmpul fără să sară pe 0. */
  priceText: string;
}

interface FreeLine {
  description: string;
  quantity: number;
  priceText: string;
}

function money(cents: number): string {
  return new Intl.NumberFormat("ro-MD", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/** „1 250,50” sau „1250.50” → cenți. Gol → null, ca să cadă pe prețul din catalog. */
function parsePrice(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}

export function NewDocumentDialog({
  leadId,
  leadName,
  onClose,
  onCreated,
}: {
  leadId: string;
  leadName: string;
  onClose: () => void;
  onCreated?: () => void | Promise<void>;
}) {
  const [kind, setKind] = useState<CrmDocKind>("oferta_comerciala");
  const [products, setProducts] = useState<CrmProduct[]>([]);
  const [chosen, setChosen] = useState<ChosenProduct[]>([]);
  const [freeLines, setFreeLines] = useState<FreeLine[]>([]);
  const [basedOn, setBasedOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listCrmProducts()
      .then((r) => setProducts(r.items))
      .catch(() => setProducts([]));
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  /** Totalul arătat e cel al rândurilor alese — fără TVA, ca pe listă. */
  const total = useMemo(() => {
    let sum = 0;
    for (const c of chosen) {
      const price = parsePrice(c.priceText) ?? byId.get(c.productId)?.listPriceCents ?? 0;
      sum += price * c.quantity;
    }
    for (const f of freeLines) sum += (parsePrice(f.priceText) ?? 0) * f.quantity;
    return sum;
  }, [chosen, freeLines, byId]);

  const currency = useMemo(() => {
    const first = chosen.map((c) => byId.get(c.productId)?.currency).find(Boolean);
    return first ?? "MDL";
  }, [chosen, byId]);

  function addProduct() {
    const first = products.find((p) => !chosen.some((c) => c.productId === p.id));
    if (!first) return;
    setChosen((prev) => [...prev, { productId: first.id, quantity: 1, priceText: "" }]);
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const doc = await createCrmDocument({
        leadId,
        kind,
        items: chosen.map((c) => ({
          productId: c.productId,
          quantity: c.quantity,
          unitPriceCents: parsePrice(c.priceText),
        })),
        extraLines: freeLines
          .filter((f) => f.description.trim())
          .map((f) => ({
            description: f.description.trim(),
            quantity: f.quantity,
            unitPriceCents: parsePrice(f.priceText) ?? 0,
          })),
        basedOn: basedOn.trim() || null,
      });
      await onCreated?.();
      // Ciorna e făcută — omul continuă în editorul de acte, unde o finalizează.
      window.location.hash = `#${docPath(doc.id)}`;
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Nu am putut crea actul.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Act nou pentru ${leadName}`} size="lg">
      <div className="space-y-4">
        {error && <Alert variant="destructive">{error}</Alert>}

        <div className="space-y-1">
          <Label htmlFor="doc-tip">Tipul actului</Label>
          <Select id="doc-tip" value={kind} onChange={(e) => setKind(e.target.value as CrmDocKind)}>
            {(Object.keys(CRM_DOC_KIND_LABELS) as CrmDocKind[]).map((k) => (
              <option key={k} value={k}>
                {CRM_DOC_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>

        {kind !== "oferta_comerciala" && (
          <div className="space-y-1">
            <Label htmlFor="doc-baza">În baza (opțional)</Label>
            <Input
              id="doc-baza"
              value={basedOn}
              onChange={(e) => setBasedOn(e.target.value)}
              placeholder="ofertei nr. 12 din 14.09.2026"
            />
          </div>
        )}

        {/* ── Pozițiile din catalog ──────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Poziții din catalog</Label>
            <Button variant="outline" size="sm" onClick={addProduct} disabled={products.length === 0}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Adaugă produs
            </Button>
          </div>
          {products.length === 0 && (
            <p className="text-xs text-muted-foreground">
              Catalogul de produse e gol. Poți scrie pozițiile de mână mai jos.
            </p>
          )}
          {chosen.map((c, i) => {
            const product = byId.get(c.productId);
            return (
              <div key={`${c.productId}-${i}`} className="flex flex-wrap items-end gap-2">
                <div className="min-w-[12rem] flex-1 space-y-1">
                  <Label htmlFor={`doc-prod-${i}`}>Produs</Label>
                  <Select
                    id={`doc-prod-${i}`}
                    value={c.productId}
                    onChange={(e) =>
                      setChosen((prev) => prev.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))
                    }
                  >
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="w-20 space-y-1">
                  <Label htmlFor={`doc-cant-${i}`}>Cant.</Label>
                  <Input
                    id={`doc-cant-${i}`}
                    type="number"
                    min={1}
                    value={c.quantity}
                    onChange={(e) =>
                      setChosen((prev) =>
                        prev.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))
                      )
                    }
                  />
                </div>
                <div className="w-32 space-y-1">
                  <Label htmlFor={`doc-pret-${i}`}>Preț</Label>
                  <Input
                    id={`doc-pret-${i}`}
                    value={c.priceText}
                    onChange={(e) =>
                      setChosen((prev) => prev.map((x, j) => (j === i ? { ...x, priceText: e.target.value } : x)))
                    }
                    placeholder={product ? money(product.listPriceCents) : ""}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Scoate poziția ${i + 1}`}
                  onClick={() => setChosen((prev) => prev.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
            );
          })}
        </div>

        {/* ── Poziții scrise de mână ─────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Poziții scrise de mână</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFreeLines((prev) => [...prev, { description: "", quantity: 1, priceText: "" }])}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Adaugă rând
            </Button>
          </div>
          {freeLines.map((f, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <div className="min-w-[12rem] flex-1 space-y-1">
                <Label htmlFor={`doc-lib-${i}`}>Descriere</Label>
                <Input
                  id={`doc-lib-${i}`}
                  value={f.description}
                  onChange={(e) =>
                    setFreeLines((prev) => prev.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
                  }
                  placeholder="Transport și montaj"
                />
              </div>
              <div className="w-20 space-y-1">
                <Label htmlFor={`doc-lib-cant-${i}`}>Cant.</Label>
                <Input
                  id={`doc-lib-cant-${i}`}
                  type="number"
                  min={1}
                  value={f.quantity}
                  onChange={(e) =>
                    setFreeLines((prev) =>
                      prev.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))
                    )
                  }
                />
              </div>
              <div className="w-32 space-y-1">
                <Label htmlFor={`doc-lib-pret-${i}`}>Preț</Label>
                <Input
                  id={`doc-lib-pret-${i}`}
                  value={f.priceText}
                  onChange={(e) =>
                    setFreeLines((prev) => prev.map((x, j) => (j === i ? { ...x, priceText: e.target.value } : x)))
                  }
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Scoate rândul ${i + 1}`}
                onClick={() => setFreeLines((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between rounded-md border border-border p-3">
          <span className="text-sm text-muted-foreground">Total (fără TVA)</span>
          <span className="text-lg font-semibold tabular-nums">
            {money(total)} {currency}
          </span>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Renunță
          </Button>
          <Button onClick={() => void create()} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileText className="h-4 w-4" aria-hidden="true" />
            )}
            Creează ciorna
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
