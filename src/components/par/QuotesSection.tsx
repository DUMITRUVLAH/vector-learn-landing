/**
 * VF-501: quotes (RFQ) section for an `obtain_quotations` PAR.
 * Add quotes from registered vendors or free-typed names; lists them sorted by amount.
 * Recommends the donor 3-bid rule.
 *
 * VF-502: comparison table — choose the winning quote with a justification; it's highlighted and
 * its payee is copied into the PAR server-side.
 */
import { useEffect, useState } from "react";
import { Plus, Trash2, Loader2, FileText, AlertCircle, Check, Award } from "lucide-react";
import {
  listParQuotes, addParQuote, deleteParQuote, selectParQuote, formatMDL,
  type ParQuote, type ParVendor,
} from "@/lib/api/par";
import { cn } from "@/lib/utils";

function fmt(cents: number, currency: string): string {
  if (currency === "MDL") return formatMDL(cents);
  return `${(cents / 100).toLocaleString("ro-MD", { minimumFractionDigits: 2 })} ${currency}`;
}

export function QuotesSection({ parId, vendors }: { parId: string; vendors: ParVendor[] }) {
  const [quotes, setQuotes] = useState<ParQuote[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorId, setVendorId] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [amount, setAmount] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try { const { quotes: q } = await listParQuotes(parId); setQuotes(q); }
    catch { /* ignore */ }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [parId]); // eslint-disable-line

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(amount.replace(/\s/g, "").replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents <= 0) { setError("Sumă invalidă."); return; }
    if (!vendorId && !vendorName.trim()) { setError("Alege un furnizor sau scrie un nume."); return; }
    setBusy(true); setError(null);
    try {
      await addParQuote(parId, {
        vendor_id: vendorId || null,
        vendor_name: vendorName.trim() || null,
        total_cents: cents,
        valid_until: validUntil || null,
      });
      setVendorId(""); setVendorName(""); setAmount(""); setValidUntil("");
      await load();
    } catch (err) {
      setError(err instanceof Error && err.message.includes("vendor_required") ? "Furnizor lipsă." : "Nu am putut adăuga oferta.");
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try { await deleteParQuote(parId, id); await load(); } catch { /* ignore */ }
  };

  const choose = async (q: ParQuote) => {
    const reason = window.prompt(`Motivul alegerii ofertei de la ${q.vendorName}:`, q.selectionReason ?? "");
    if (reason == null || !reason.trim()) return;
    try { await selectParQuote(parId, q.id, reason.trim()); await load(); } catch { /* ignore */ }
  };

  const lowest = quotes.length ? Math.min(...quotes.map((q) => q.totalCents)) : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" aria-hidden />
        <h3 className="text-sm font-semibold text-foreground">Oferte (RFQ)</h3>
        {quotes.length > 0 && (
          <span className={quotes.length >= 3 ? "text-xs text-green-700 dark:text-green-400" : "text-xs text-yellow-700 dark:text-yellow-400"}>
            {quotes.length}/3 {quotes.length >= 3 ? "✓" : "(recomandat ≥3)"}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">Colectează cel puțin 3 oferte pentru regula donatorului.</p>

      <form onSubmit={add} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
        <div className="sm:col-span-4">
          <label className="text-xs font-medium text-muted-foreground block mb-1">Furnizor (din listă)</label>
          <select value={vendorId} onChange={(e) => { setVendorId(e.target.value); if (e.target.value) setVendorName(""); }}
            aria-label="Furnizor înregistrat" className="vf-input">
            <option value="">— sau nume liber →</option>
            {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="sm:col-span-3">
          <label className="text-xs font-medium text-muted-foreground block mb-1">Nume furnizor</label>
          <input type="text" value={vendorName} onChange={(e) => { setVendorName(e.target.value); if (e.target.value) setVendorId(""); }}
            placeholder="ex. Darwin SRL" aria-label="Nume furnizor" className="vf-input" disabled={!!vendorId} />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground block mb-1">Sumă (MDL)</label>
          <input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" aria-label="Sumă ofertă" className="vf-input" />
        </div>
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-muted-foreground block mb-1">Valabil până</label>
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} aria-label="Valabilitate ofertă" className="vf-input" />
        </div>
        <div className="sm:col-span-1">
          <button type="submit" disabled={busy} aria-label="Adaugă oferta"
            className="inline-flex items-center justify-center w-full rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 min-h-[44px]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          </button>
        </div>
      </form>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-2.5 rounded-md bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />{error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Se încarcă…</div>
      ) : quotes.length > 0 && (
        <div className="space-y-1.5">
          {quotes.map((q) => (
            <div key={q.id}
              className={cn("rounded-md border px-3 py-2 text-sm", q.selected ? "border-primary bg-primary/5" : "border-border")}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate flex items-center gap-1.5">
                  {q.selected && <Award className="h-4 w-4 text-primary flex-shrink-0" aria-label="Ofertă aleasă" />}
                  <span className="text-foreground font-medium">{q.vendorName}</span>
                  {q.validUntil && <span className="text-muted-foreground text-xs"> · valabil {new Date(q.validUntil).toLocaleDateString("ro-MD")}</span>}
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  <span className={q.totalCents === lowest ? "font-semibold text-green-700 dark:text-green-400" : "text-foreground"}>
                    {fmt(q.totalCents, q.currency)}{q.totalCents === lowest && quotes.length > 1 ? " · min" : ""}
                  </span>
                  {q.selected ? (
                    <span className="inline-flex items-center gap-1 text-xs text-primary font-medium"><Check className="h-3.5 w-3.5" aria-hidden />Aleasă</span>
                  ) : (
                    <button type="button" onClick={() => choose(q)}
                      className="inline-flex items-center rounded-md border border-border px-2 py-1 text-xs hover:bg-muted">Alege</button>
                  )}
                  <button type="button" onClick={() => remove(q.id)} aria-label={`Șterge oferta ${q.vendorName}`}
                    className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </span>
              </div>
              {q.selected && q.selectionReason && (
                <p className="text-xs text-muted-foreground mt-1 pl-6">Motiv: {q.selectionReason}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
