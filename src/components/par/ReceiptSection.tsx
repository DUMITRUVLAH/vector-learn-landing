/**
 * VF-504: goods/services receipt section (ParDetail, finance/admin, PAR in_finance).
 * Per line item: quantity received (default = ordered) + complete toggle + notes.
 */
import { useEffect, useState } from "react";
import { PackageCheck, Loader2, AlertCircle, Check } from "lucide-react";
import { Alert, Button, Checkbox, Input, Textarea } from "@/components/ds";
import {
  listParReceipts, addParReceipt,
  type ParReceipt, type ParLineItem,
} from "@/lib/api/par";

export function ReceiptSection({ parId, lineItems }: { parId: string; lineItems: ParLineItem[] }) {
  const [receipts, setReceipts] = useState<ParReceipt[]>([]);
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(lineItems.map((li) => [li.id, String(li.quantity)]))
  );
  const [complete, setComplete] = useState(true);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try { const { receipts: r } = await listParReceipts(parId); setReceipts(r); } catch { /* ignore */ }
  };
  useEffect(() => { load(); }, [parId]); // eslint-disable-line

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      await addParReceipt(parId, {
        complete,
        notes: notes.trim() || null,
        lines: lineItems.map((li) => ({ line_item_id: li.id, qty_received: Math.max(0, Math.round(Number(qty[li.id]) || 0)) })),
      });
      setNotes("");
      await load();
    } catch {
      setError("Nu am putut înregistra recepția.");
    } finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <PackageCheck className="h-4 w-4 text-primary" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Recepție bunuri/servicii</h2>
        {receipts.length > 0 && <span className="text-xs font-medium text-success">{receipts.length} înregistrată/e</span>}
      </div>

      <div className="space-y-2">
        {lineItems.map((li) => (
          <div key={li.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-foreground truncate">{li.description} <span className="text-muted-foreground text-xs">(comandat: {li.quantity})</span></span>
            <Input type="number" min={0} value={qty[li.id] ?? ""} onChange={(e) => setQty((q) => ({ ...q, [li.id]: e.target.value }))}
              aria-label={`Cantitate primită pentru ${li.description}`} className="w-24 shrink-0" />
          </div>
        ))}
      </div>

      <Checkbox checked={complete} onChange={setComplete} label="Recepție completă" />

      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Note (opțional)"
        aria-label="Note recepție" className="resize-none" />

      {error && (
        <Alert variant="destructive" icon={<AlertCircle className="h-4 w-4" />}>{error}</Alert>
      )}

      <Button size="lg" onClick={submit} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}
        Confirmă recepția
      </Button>

      {receipts.length > 0 && (
        <div className="space-y-1.5 pt-2 border-t border-border">
          <p className="text-xs font-medium text-muted-foreground">Recepții anterioare</p>
          {receipts.map((r) => (
            <div key={r.id} className="text-xs text-muted-foreground">
              {new Date(r.receivedAt).toLocaleDateString("ro-MD")} · {r.complete ? "completă" : "parțială"} · {r.lines.length} linii
              {r.notes ? ` · ${r.notes}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
