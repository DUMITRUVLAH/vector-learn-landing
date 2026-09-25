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
import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { Alert, Button, Dialog, Input, Label, Select } from "@/components/ds";
import { listCrmProducts, type CrmProduct } from "@/lib/api/crm";
import { listDocTemplates, type DocTemplateListItem } from "@/lib/api/docs";
import { createCrmDocument, CRM_DOC_KIND_LABELS, type CrmDocKind } from "@/lib/api/crmDocuments";
import { crmDocPath } from "@/lib/docs/paths";
import { CRM_COMPANY_PROFILE_PATH, getCrmCompanyProfile } from "@/lib/api/crmCompanyProfile";

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

/**
 * Șablonul preferat per tip de act — ACEEAȘI ordine ca pe server (`pickTemplate` din
 * `server/routes/crmDocuments.ts`). Dacă cele două ar diverge, ecranul ar arăta un șablon și
 * actul s-ar naște din altul.
 */
const PREFERRED_TEMPLATE: Record<string, string> = {
  oferta_comerciala: "Ofertă comercială",
  contract_servicii: "Contract în baza ofertei acceptate",
  act_primire_predare: "Act de primire-predare — servicii prestate",
};

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

/**
 * CRM-D02 — ce știe deja leadul despre afacere. Dialogul pornea gol („Total 0,00 MDL") pe un lead
 * de 29.000 cu produsul ales — vânzătorul reintroducea ce scrisese deja în fișă.
 */
export interface NewDocumentPrefill {
  productId?: string | null;
  productQty?: number | null;
  /** Valoarea negociată a afacerii (cenți), pentru toată cantitatea. */
  valueCents?: number | null;
  /** Ce se vinde, în cuvintele leadului — pentru rândul scris de mână când n-are produs din catalog. */
  description?: string | null;
}

/**
 * Suma pentru un câmp editabil: „29000,00", FĂRĂ separator de mii. `money()` scrie „29.000,00",
 * pe care `parsePrice` nu-l citește înapoi (punctul de mii devine punct zecimal) — prețul negociat
 * ar fi căzut tăcut pe cel din catalog.
 */
function priceInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Pozițiile de pornire din datele leadului. Pură, ca să se poată testa fără dialog. */
export { parsePrice };

export function prefillLines(
  prefill: NewDocumentPrefill | undefined,
  products: ReadonlyArray<Pick<CrmProduct, "id" | "listPriceCents">>
): { chosen: ChosenProduct[]; freeLines: FreeLine[] } {
  if (!prefill) return { chosen: [], freeLines: [] };
  const qty = prefill.productQty && prefill.productQty > 0 ? prefill.productQty : 1;
  const value = prefill.valueCents && prefill.valueCents > 0 ? prefill.valueCents : null;
  const product = prefill.productId ? products.find((p) => p.id === prefill.productId) : undefined;
  if (product) {
    // Prețul negociat bate lista doar când chiar diferă — altfel câmpul rămâne gol („din catalog").
    const unit = value ? Math.round(value / qty) : null;
    const negotiated = unit !== null && unit !== product.listPriceCents;
    return {
      chosen: [{ productId: product.id, quantity: qty, priceText: negotiated ? priceInput(unit) : "" }],
      freeLines: [],
    };
  }
  if (value) {
    return {
      chosen: [],
      freeLines: [{ description: prefill.description?.trim() || "Servicii", quantity: 1, priceText: priceInput(value) }],
    };
  }
  return { chosen: [], freeLines: [] };
}

export function NewDocumentDialog({
  leadId,
  leadName,
  prefill,
  onClose,
  onCreated,
}: {
  leadId: string;
  leadName: string;
  prefill?: NewDocumentPrefill;
  onClose: () => void;
  onCreated?: () => void | Promise<void>;
}) {
  const [kind, setKind] = useState<CrmDocKind>("oferta_comerciala");
  const [products, setProducts] = useState<CrmProduct[]>([]);
  /** Șabloanele workspace-ului. Fără unul ales, actul se năștea cu pagina albă. */
  const [templates, setTemplates] = useState<DocTemplateListItem[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [chosen, setChosen] = useState<ChosenProduct[]>([]);
  const [freeLines, setFreeLines] = useState<FreeLine[]>([]);
  const [basedOn, setBasedOn] = useState("");
  const [busy, setBusy] = useState(false);
  /** CRM-D04: rechizitele firmei care ar ieși goale pe act — spuse ÎNAINTE de a crea actul. */
  const [companyMissing, setCompanyMissing] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Pozițiile din lead se pun O DATĂ, după ce catalogul e aici (prețul de listă decide dacă
  // valoarea leadului e un preț negociat). După aceea, dialogul e al omului.
  const prefilled = useRef(false);
  useEffect(() => {
    listCrmProducts()
      .then((r) => {
        setProducts(r.items);
        if (!prefilled.current) {
          prefilled.current = true;
          const start = prefillLines(prefill, r.items);
          setChosen(start.chosen);
          setFreeLines(start.freeLines);
        }
      })
      .catch(() => setProducts([]));
    // O cerere picată nu blochează dialogul: nota e un ajutor, nu o condiție.
    getCrmCompanyProfile()
      .then((r) => setCompanyMissing(r.missing))
      .catch(() => setCompanyMissing([]));
    // Lista cere `/api/docs/templates`, care instalează biblioteca standard la prima deschidere —
    // deci un workspace nou are din prima din ce alege.
    listDocTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  /** Șabloanele potrivite tipului ales. Un contract nu se face dintr-un act de primire. */
  const kindTemplates = useMemo(() => templates.filter((t) => t.kind === kind), [templates, kind]);

  // Schimbarea tipului reașază șablonul: cel ales pentru ofertă n-are ce căuta pe un contract.
  // Preferăm același șablon pe care l-ar alege serverul, ca ecranul să nu promită altceva.
  useEffect(() => {
    const preferred =
      kindTemplates.find((t) => t.name === PREFERRED_TEMPLATE[kind]) ??
      kindTemplates.find((t) => !t.isSystem) ??
      kindTemplates[0];
    setTemplateId(preferred?.id ?? "");
  }, [kind, kindTemplates]);

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
        templateId: templateId || null,
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
      window.location.hash = `#${crmDocPath(doc.id)}`;
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
        {companyMissing.length > 0 && (
          <Alert variant="warning">
            Pe act vor ieși goale datele firmei tale: {companyMissing.join(", ")}.{" "}
            <a href={`#${CRM_COMPANY_PROFILE_PATH}`} className="font-medium underline">
              Completează-le o dată
            </a>
            .
          </Alert>
        )}

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

        <div className="space-y-1">
          <Label htmlFor="doc-sablon">Șablonul folosit</Label>
          <Select
            id="doc-sablon"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            disabled={kindTemplates.length === 0}
          >
            {kindTemplates.length === 0 ? (
              <option value="">Niciun șablon pentru acest tip</option>
            ) : (
              kindTemplates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isSystem ? " (standard)" : ""}
                </option>
              ))
            )}
          </Select>
          <p className="text-xs text-muted-foreground">
            {kindTemplates.length === 0
              ? "Actul se va crea fără text — completează-l în editor sau adaugă un șablon în biblioteca de acte."
              : "Textul se completează singur cu datele clientului: denumire, IDNO, adresă, contact, poziții și total."}
          </p>
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
