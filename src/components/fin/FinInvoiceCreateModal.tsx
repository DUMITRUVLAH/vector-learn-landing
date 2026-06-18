/**
 * BILL-005: FinInvoiceCreateModal
 *
 * Modal for creating a new B2B invoice (fin_invoices).
 * - Party select (fin_parties via /api/fin/parties — fallback to text input if not loaded)
 * - Dynamic line items: add/remove, with description, quantity, unit price, vatPct (required)
 * - Invoice metadata: dueDate, currency, notes
 * - Client-side validation: at least one line, vatPct required (FIN-CORE Rule #1)
 */
import { useState, useRef } from "react";
import { X, Plus, Trash2, Loader2, Search, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createFinInvoice,
  type CreateFinInvoiceLineInput,
} from "@/lib/api/finInvoices";
import { searchRegistry, type RegistryCompany } from "@/lib/api/paymentAccounts";
import { createParty, listParties, getParty, updateParty } from "@/lib/api/finParties";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineInput {
  description: string;
  quantity: number;
  /** Unit price in LEI (major units), as a string so decimals type cleanly (e.g. "200", "19.99"). */
  unitPriceLei: string;
  vatPct: number;
}

/** Parse a "lei" string to cents (minor units). "200" → 20000, "19.99" → 1999. */
function leiToCents(s: string): number {
  const n = parseFloat((s || "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FinInvoiceCreateModal({ onClose, onCreated }: Props) {
  const [lines, setLines] = useState<LineInput[]>([
    { description: "", quantity: 1, unitPriceLei: "", vatPct: 20 },
  ]);
  const [currency, setCurrency] = useState<"MDL" | "EUR" | "USD">("MDL");
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ─── Beneficiary company: LIVE search by IDNO or name → pick → reuse/create fin_party ────
  const [query, setQuery] = useState<string>("");
  const [results, setResults] = useState<RegistryCompany[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [partyName, setPartyName] = useState<string>("");
  const [partyId, setPartyId] = useState<string | null>(null);
  const [partyAddress, setPartyAddress] = useState<string>("");
  // IBAN-ul cumpărătorului — OBLIGATORIU pentru e-Factura SFS (Buyer/BankAccount).
  // Registrul de stat nu-l conține, deci se introduce manual și se salvează pe partener.
  const [partyIban, setPartyIban] = useState<string>("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onQueryChange(value: string) {
    setQuery(value);
    setPartyId(null);
    setPartyIban("");
    setLookupError(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    // Debounced live search — the registry matches by name OR idno.
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await searchRegistry(q);
        setResults(data.slice(0, 8));
        setShowResults(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  async function pickCompany(co: RegistryCompany) {
    setShowResults(false);
    setQuery(co.name);
    setPartyName(co.name);
    setPartyAddress([co.address, co.city].filter(Boolean).join(", "));
    setLookupError(null);
    try {
      // Reuse an existing fin_party with this IDNO, else create one — the invoice (and its
      // "Cont de plată" PDF) links to a fin_party, which carries idno/address.
      const code = co.idno ?? "";
      const existing = code ? await listParties({ search: code }) : { data: [] as { id: string; idno: string | null }[] };
      const match = existing.data.find((p) => p.idno === code);
      if (match) {
        setPartyId(match.id);
        // Pre-completează IBAN-ul dacă partenerul îl are deja salvat.
        try {
          const full = await getParty(match.id);
          if (full.data.iban) setPartyIban(full.data.iban);
        } catch {
          // non-critical — utilizatorul îl poate introduce manual
        }
      } else {
        const created = await createParty({
          kind: "client",
          name: co.name,
          country: "MD",
          idno: code || null,
          address: [co.address, co.city].filter(Boolean).join(", ") || null,
        });
        setPartyId(created.data.id);
      }
    } catch {
      setLookupError("Firma a fost găsită, dar nu am putut-o salva ca partener. Încearcă din nou.");
    }
  }

  // ─── Line management ─────────────────────────────────────────────────

  function addLine() {
    setLines((prev) => [
      ...prev,
      { description: "", quantity: 1, unitPriceLei: "", vatPct: 20 },
    ]);
  }

  function removeLine(idx: number) {
    setLines((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLine<K extends keyof LineInput>(
    idx: number,
    key: K,
    value: LineInput[K]
  ) {
    setLines((prev) =>
      prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l))
    );
  }

  // ─── Totals (client-side preview) ───────────────────────────────────

  function computeLineTotal(l: LineInput): number {
    const cents = leiToCents(l.unitPriceLei);
    return Math.round((l.quantity * cents * (100 + l.vatPct)) / 100);
  }

  const grandTotal = lines.reduce((s, l) => s + computeLineTotal(l), 0);
  const vatTotal = lines.reduce(
    (s, l) => s + Math.round((l.quantity * leiToCents(l.unitPriceLei) * l.vatPct) / 100),
    0
  );

  function formatCents(cents: number): string {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }

  // ─── Submit ───────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validation
    if (lines.length === 0) {
      setError("Adaugă cel puțin o linie la factură.");
      return;
    }
    for (const [i, l] of lines.entries()) {
      if (!l.description.trim()) {
        setError(`Linia ${i + 1}: Descrierea este obligatorie.`);
        return;
      }
      if (l.vatPct === undefined || l.vatPct === null || Number.isNaN(l.vatPct)) {
        setError(`Linia ${i + 1}: TVA% este obligatoriu (FIN-CORE Regula #1).`);
        return;
      }
      if (l.quantity < 1) {
        setError(`Linia ${i + 1}: Cantitatea trebuie să fie ≥ 1.`);
        return;
      }
      if (leiToCents(l.unitPriceLei) <= 0) {
        setError(`Linia ${i + 1}: Prețul (lei) este obligatoriu și trebuie să fie > 0.`);
        return;
      }
    }

    setLoading(true);
    try {
      // Salvează IBAN-ul pe partener dacă a fost introdus/modificat — e necesar
      // pentru trimiterea la e-Factura SFS (Buyer/BankAccount obligatoriu).
      if (partyId && partyIban.trim()) {
        try {
          await updateParty(partyId, { iban: partyIban.trim() });
        } catch {
          // non-fatal — factura se creează oricum; IBAN-ul se poate adăuga din fișa partenerului
        }
      }

      const linesPayload: CreateFinInvoiceLineInput[] = lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: leiToCents(l.unitPriceLei),
        vatPct: l.vatPct,
      }));

      await createFinInvoice({
        partyId: partyId ?? undefined,
        lines: linesPayload,
        currency,
        dueDate: dueDate || null,
        notes: notes || null,
      });

      onCreated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Eroare la crearea facturii.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Factură nouă"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Factură B2B nouă</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide modalul"
            className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Beneficiary — live search by IDNO or name; pick a result to autofill + attach */}
          <div className="relative">
            <label htmlFor="fin-party-search" className="block text-sm font-medium text-foreground mb-1">
              Partener (beneficiar) — caută după IDNO sau nume
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="fin-party-search"
                type="text"
                value={query}
                autoComplete="off"
                onChange={(e) => onQueryChange(e.target.value)}
                onFocus={() => results.length > 0 && setShowResults(true)}
                placeholder="Scrie IDNO sau numele firmei…"
                className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-9 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </div>

            {/* Live results dropdown */}
            {showResults && results.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-card shadow-lg">
                {results.map((co) => (
                  <li key={`${co.id}-${co.idno}`}>
                    <button
                      type="button"
                      onClick={() => pickCompany(co)}
                      className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span className="font-medium text-foreground">{co.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {co.idno ? `IDNO ${co.idno}` : "fără IDNO"}
                        {co.city ? ` · ${co.city}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {showResults && !searching && results.length === 0 && query.trim().length >= 2 && (
              <p className="mt-1 text-xs text-muted-foreground">Nicio firmă găsită pentru „{query}”.</p>
            )}

            {partyId && (
              <p className="mt-1 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                {partyName}{partyAddress ? ` · ${partyAddress}` : ""} — va apărea pe Contul de plată.
              </p>
            )}
            {lookupError && <p className="mt-1 text-xs text-destructive" role="alert">{lookupError}</p>}

            {/* IBAN cumpărător — mereu vizibil. Obligatoriu pentru e-Factura SFS.
                Dezactivat până e selectat un partener (IBAN-ul se salvează pe partener). */}
            <div className="mt-3">
              <label htmlFor="fin-buyer-iban" className="block text-sm font-medium text-foreground mb-1">
                IBAN cumpărător <span className="text-muted-foreground font-normal">(necesar pentru e-Factura SFS)</span>
              </label>
              <input
                id="fin-buyer-iban"
                type="text"
                value={partyIban}
                onChange={(e) => setPartyIban(e.target.value.toUpperCase().replace(/\s+/g, ""))}
                placeholder={partyId ? "MD24AG000225100013104168" : "Selectează întâi un partener mai sus"}
                disabled={!partyId}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
                aria-describedby="fin-buyer-iban-hint"
              />
              <p id="fin-buyer-iban-hint" className="mt-1 text-xs text-muted-foreground">
                Contul bancar al cumpărătorului. SFS îl cere obligatoriu la trimitere. Se salvează în fișa partenerului.
              </p>
            </div>
          </div>

          {/* Currency + Due Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="fin-currency"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Valută
              </label>
              <select
                id="fin-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as "MDL" | "EUR" | "USD")}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="MDL">MDL (Lei moldovenești)</option>
                <option value="EUR">EUR (Euro)</option>
                <option value="USD">USD (Dolari)</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="fin-due-date"
                className="block text-sm font-medium text-foreground mb-1"
              >
                Dată scadentă
              </label>
              <input
                id="fin-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-foreground">
                Linii factură{" "}
                <span className="text-muted-foreground font-normal">(TVA obligatoriu per linie)</span>
              </label>
              <button
                type="button"
                onClick={addLine}
                className="flex items-center gap-1 text-sm text-primary hover:text-primary/80 font-medium transition-colors min-h-[32px] px-2"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Adaugă linie
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((line, idx) => (
                <div
                  key={idx}
                  className="border border-border rounded-lg p-3 bg-muted/30 space-y-2"
                >
                  {/* Description */}
                  <div>
                    <label
                      htmlFor={`fin-line-desc-${idx}`}
                      className="sr-only"
                    >
                      Descriere linie {idx + 1}
                    </label>
                    <input
                      id={`fin-line-desc-${idx}`}
                      type="text"
                      value={line.description}
                      onChange={(e) => updateLine(idx, "description", e.target.value)}
                      placeholder="Descriere serviciu/produs..."
                      required
                      className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>

                  {/* Quantity, Unit Price, VAT %, Remove */}
                  <div className="grid grid-cols-4 gap-2 items-end">
                    <div>
                      <label
                        htmlFor={`fin-line-qty-${idx}`}
                        className="block text-xs text-muted-foreground mb-1"
                      >
                        Cantitate
                      </label>
                      <input
                        id={`fin-line-qty-${idx}`}
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) =>
                          updateLine(idx, "quantity", Math.max(1, parseInt(e.target.value) || 1))
                        }
                        className="w-full px-2 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`fin-line-price-${idx}`}
                        className="block text-xs text-muted-foreground mb-1"
                      >
                        Preț (lei)
                      </label>
                      <input
                        id={`fin-line-price-${idx}`}
                        type="text"
                        inputMode="decimal"
                        value={line.unitPriceLei}
                        onChange={(e) =>
                          updateLine(idx, "unitPriceLei", e.target.value.replace(/[^\d.,]/g, ""))
                        }
                        placeholder="ex: 200"
                        className="w-full px-2 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`fin-line-vat-${idx}`}
                        className="block text-xs text-muted-foreground mb-1"
                      >
                        TVA %
                      </label>
                      <input
                        id={`fin-line-vat-${idx}`}
                        type="number"
                        min={0}
                        max={100}
                        value={line.vatPct}
                        onChange={(e) =>
                          updateLine(
                            idx,
                            "vatPct",
                            Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                          )
                        }
                        required
                        className="w-full px-2 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length === 1}
                        aria-label={`Șterge linia ${idx + 1}`}
                        className={cn(
                          "w-full py-2 px-2 rounded-md transition-colors min-h-[40px] flex items-center justify-center",
                          lines.length === 1
                            ? "text-muted-foreground/40 cursor-not-allowed"
                            : "text-destructive hover:bg-destructive/10"
                        )}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  {/* Line total preview */}
                  <div className="text-right text-xs text-muted-foreground">
                    Total linie: <span className="font-medium text-foreground">{formatCents(computeLineTotal(line))}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label
              htmlFor="fin-notes"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Note (opțional)
            </label>
            <textarea
              id="fin-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Instrucțiuni de plată, referințe..."
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* Grand total preview */}
          <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-4">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Subtotal (fără TVA):</span>
              <span className="text-foreground">{formatCents(grandTotal - vatTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground mt-1">
              <span>Total TVA:</span>
              <span className="text-foreground">{formatCents(vatTotal)}</span>
            </div>
            <div className="flex items-center justify-between font-semibold text-foreground mt-2 pt-2 border-t border-blue-200 dark:border-blue-900">
              <span>TOTAL DE PLATĂ:</span>
              <span className="text-primary text-lg">{formatCents(grandTotal)}</span>
            </div>
          </div>

          {/* Error */}
          {error && (
            <p role="alert" className="text-sm text-destructive font-medium">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors min-h-[44px]"
            >
              Anulează
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors min-h-[44px] flex items-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Creează factura
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
