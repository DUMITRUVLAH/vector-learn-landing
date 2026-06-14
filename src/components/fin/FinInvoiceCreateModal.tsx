/**
 * BILL-005: FinInvoiceCreateModal
 *
 * Modal for creating a new B2B invoice (fin_invoices).
 * - Party select (fin_parties via /api/fin/parties — fallback to text input if not loaded)
 * - Dynamic line items: add/remove, with description, quantity, unit price, vatPct (required)
 * - Invoice metadata: dueDate, currency, notes
 * - Client-side validation: at least one line, vatPct required (FIN-CORE Rule #1)
 */
import { useState } from "react";
import { X, Plus, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  createFinInvoice,
  type CreateFinInvoiceLineInput,
} from "@/lib/api/finInvoices";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LineInput {
  description: string;
  quantity: number;
  unitPriceCents: number;
  vatPct: number;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FinInvoiceCreateModal({ onClose, onCreated }: Props) {
  const [lines, setLines] = useState<LineInput[]>([
    { description: "", quantity: 1, unitPriceCents: 0, vatPct: 20 },
  ]);
  const [currency, setCurrency] = useState<"MDL" | "EUR" | "USD">("MDL");
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [partyName, setPartyName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ─── Line management ─────────────────────────────────────────────────

  function addLine() {
    setLines((prev) => [
      ...prev,
      { description: "", quantity: 1, unitPriceCents: 0, vatPct: 20 },
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
    return Math.round((l.quantity * l.unitPriceCents * (100 + l.vatPct)) / 100);
  }

  const grandTotal = lines.reduce((s, l) => s + computeLineTotal(l), 0);
  const vatTotal = lines.reduce(
    (s, l) => s + Math.round((l.quantity * l.unitPriceCents * l.vatPct) / 100),
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
      if (l.unitPriceCents < 0) {
        setError(`Linia ${i + 1}: Prețul nu poate fi negativ.`);
        return;
      }
    }

    setLoading(true);
    try {
      const linesPayload: CreateFinInvoiceLineInput[] = lines.map((l) => ({
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        vatPct: l.vatPct,
      }));

      await createFinInvoice({
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
          {/* Party (text input — future: autocomplete from fin_parties) */}
          <div>
            <label
              htmlFor="fin-party-name"
              className="block text-sm font-medium text-foreground mb-1"
            >
              Partener (beneficiar)
            </label>
            <input
              id="fin-party-name"
              type="text"
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
              placeholder="Numele companiei..."
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
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
                        Preț (bani)
                      </label>
                      <input
                        id={`fin-line-price-${idx}`}
                        type="number"
                        min={0}
                        value={line.unitPriceCents}
                        onChange={(e) =>
                          updateLine(
                            idx,
                            "unitPriceCents",
                            Math.max(0, parseInt(e.target.value) || 0)
                          )
                        }
                        placeholder="ex: 10000 = 100"
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
