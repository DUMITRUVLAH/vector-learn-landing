/**
 * VM5-20 — bugetul unui eveniment: îl încarci, apoi vezi dacă te încadrezi.
 *
 * Cerința owner-ului (12.09.2026): „la evenimente la fel să poată fi linii de buget, să încarci și
 * după să vezi dacă te încadrezi, și să scoți raport per eveniment cu cheltuieli planned vs realizat."
 *
 * Două lucruri fac ecranul ăsta util în practică:
 *
 * 1. **Lipirea din Excel.** Bugetele de eveniment trăiesc în foi de calcul, iar a le retasta linie cu
 *    linie e felul cel mai sigur de a nu le pune deloc. Un `Ctrl+V` peste tabel citește rândurile
 *    `cod | sumă | monedă` și le completează.
 * 2. **Planul și realizatul în același tabel.** Un plan pe care trebuie să-l compari cu un raport
 *    deschis în altă filă nu se compară niciodată.
 */
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ClipboardPaste, Loader2, Plus, Save, Trash2 } from "lucide-react";
import {
  getEventBudget,
  saveEventBudget,
  formatMDL,
  type EventBudgetReport,
  type ParBudgetCode,
} from "@/lib/api/par";
import { cn } from "@/lib/utils";

interface DraftLine {
  budgetCodeId: string | null;
  label: string;
  amount: string;
  currency: string;
}

interface Props {
  eventId: string;
  eventName: string;
  budgetCodes: ParBudgetCode[];
  onClose: () => void;
}

const CURRENCIES = ["MDL", "EUR", "USD", "RON"];

/**
 * Ce se poate lipi din Excel: `cod bugetar | sumă | monedă`, separate prin TAB (ce dă Excel-ul) sau
 * prin `;`. Suma acceptă ambele scrieri europene — „12 500,50" și „12,500.50" — pentru că exact aici
 * se pierd datele la import: o virgulă citită ca punct face din 12.500 lei 12 lei și jumătate.
 */
export function parsePastedBudget(text: string): Array<{ code: string; amountCents: number; currency: string }> {
  const out: Array<{ code: string; amountCents: number; currency: string }> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const cells = line.split(/\t|;/).map((c) => c.trim());
    if (cells.length < 2) continue;
    const code = cells[0];
    const amountRaw = cells[1].replace(/\s/g, "");
    // „12.500,50" → virgula e zecimala; „12,500.50" → punctul e zecimala.
    const normalized = amountRaw.includes(",") && amountRaw.lastIndexOf(",") > amountRaw.lastIndexOf(".")
      ? amountRaw.replace(/\./g, "").replace(",", ".")
      : amountRaw.replace(/,/g, "");
    const amount = Number.parseFloat(normalized);
    if (!code || !Number.isFinite(amount)) continue;
    const currency = (cells[2] ?? "MDL").toUpperCase().slice(0, 3) || "MDL";
    out.push({ code, amountCents: Math.round(amount * 100), currency: CURRENCIES.includes(currency) ? currency : "MDL" });
  }
  return out;
}

export function EventBudgetEditor({ eventId, eventName, budgetCodes, onClose }: Props) {
  const [report, setReport] = useState<EventBudgetReport | null>(null);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pasted, setPasted] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getEventBudget(eventId);
      setReport(r);
      setDraft(
        r.lines
          .filter((l) => !l.unplanned)
          .map((l) => ({
            budgetCodeId: l.budgetCodeId,
            label: l.label,
            amount: (l.allocatedCents / 100).toString(),
            currency: l.currency,
          }))
      );
    } catch {
      setError("Bugetul evenimentului nu a putut fi încărcat.");
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => { void load(); }, [load]);

  const addLine = () => setDraft((d) => [...d, { budgetCodeId: null, label: "", amount: "", currency: "MDL" }]);

  /** Lipire din Excel: codurile se potrivesc după cod sau denumire, ce nu se potrivește rămâne text liber. */
  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\n") && !text.includes("\t")) return;
    e.preventDefault();
    const rows = parsePastedBudget(text);
    if (!rows.length) return;
    setDraft((d) => [
      ...d,
      ...rows.map((r) => {
        const match = budgetCodes.find(
          (bc) => bc.code.toLowerCase() === r.code.toLowerCase() || (bc.name ?? "").toLowerCase() === r.code.toLowerCase()
        );
        return {
          budgetCodeId: match?.id ?? null,
          label: match ? "" : r.code,
          amount: (r.amountCents / 100).toString(),
          currency: r.currency,
        };
      }),
    ]);
    setPasted(rows.length);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await saveEventBudget(
        eventId,
        draft
          .filter((l) => Number.parseFloat(l.amount || "0") > 0 || l.budgetCodeId || l.label.trim())
          .map((l) => ({
            budget_code_id: l.budgetCodeId,
            label: l.label.trim() || null,
            allocated_cents: Math.round(Number.parseFloat(l.amount || "0") * 100) || 0,
            currency: l.currency,
          }))
      );
      setPasted(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bugetul nu a putut fi salvat.");
    } finally {
      setSaving(false);
    }
  };

  const money = (cents: number) => formatMDL(cents);

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-foreground">Buget: {eventName}</h3>
          <p className="text-xs text-muted-foreground">
            O linie = un cod bugetar și o sumă. Totalul evenimentului se calculează din linii.
            Poți lipi direct din Excel: <code>cod · sumă · monedă</code>.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground min-h-[44px] px-2">
          Închide
        </button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />Se încarcă…
        </p>
      ) : (
        <>
          {/* Planul, editabil */}
          <div className="space-y-2" onPaste={handlePaste}>
            {draft.map((line, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <select
                  value={line.budgetCodeId ?? ""}
                  onChange={(e) => setDraft((d) => d.map((l, j) => (j === i ? { ...l, budgetCodeId: e.target.value || null } : l)))}
                  aria-label={`Cod bugetar linia ${i + 1}`}
                  className="min-h-[44px] flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="">Fără cod bugetar (text liber)</option>
                  {budgetCodes.map((bc) => (
                    <option key={bc.id} value={bc.id}>{bc.code} — {bc.name}</option>
                  ))}
                </select>
                {!line.budgetCodeId && (
                  <input
                    type="text"
                    value={line.label}
                    onChange={(e) => setDraft((d) => d.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)))}
                    placeholder="Denumirea liniei"
                    aria-label={`Denumire linia ${i + 1}`}
                    className="min-h-[44px] w-40 rounded-md border border-input bg-background px-3 text-sm"
                  />
                )}
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.amount}
                  onChange={(e) => setDraft((d) => d.map((l, j) => (j === i ? { ...l, amount: e.target.value } : l)))}
                  placeholder="Sumă"
                  aria-label={`Sumă linia ${i + 1}`}
                  className="min-h-[44px] w-32 rounded-md border border-input bg-background px-3 text-sm"
                />
                <select
                  value={line.currency}
                  onChange={(e) => setDraft((d) => d.map((l, j) => (j === i ? { ...l, currency: e.target.value } : l)))}
                  aria-label={`Monedă linia ${i + 1}`}
                  className="min-h-[44px] w-24 rounded-md border border-input bg-background px-3 text-sm"
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
                  aria-label={`Șterge linia ${i + 1}`}
                  className="rounded-md p-2 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ))}

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={addLine} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-input px-3 text-sm hover:bg-muted">
                <Plus className="h-4 w-4" aria-hidden />Adaugă linie
              </button>
              <button type="button" onClick={save} disabled={saving} className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                Salvează bugetul
              </button>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <ClipboardPaste className="h-3.5 w-3.5" aria-hidden />
                {pasted ? `${pasted} linii lipite — verifică și salvează` : "sau lipește tabelul din Excel (Ctrl+V)"}
              </span>
            </div>
          </div>

          {/* Planificat vs realizat */}
          {report && (report.lines.length > 0 || report.hasPlan) && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Planificat vs realizat pe eveniment</caption>
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-1 pr-3 font-medium">Linie</th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">Planificat</th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">Angajat</th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">Plătit</th>
                    <th scope="col" className="py-1 text-right font-medium">Disponibil</th>
                  </tr>
                </thead>
                <tbody>
                  {report.lines.map((l, i) => (
                    <tr key={l.id ?? `x-${i}`} className="border-t border-border/60">
                      <td className="py-1.5 pr-3">
                        {l.label}
                        {l.unplanned && (
                          <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-xs font-medium text-warning">
                            neplanificat
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right">{l.allocatedMdlCents ? money(l.allocatedMdlCents) : "—"}</td>
                      <td className="py-1.5 pr-3 text-right">{money(l.committedMdlCents)}</td>
                      <td className="py-1.5 pr-3 text-right">{money(l.paidMdlCents)}</td>
                      <td className={cn("py-1.5 text-right font-medium", l.over ? "text-destructive" : "text-foreground")}>
                        {l.availableMdlCents == null ? "—" : money(l.availableMdlCents)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-border font-semibold">
                    <td className="py-2 pr-3">Total eveniment</td>
                    <td className="py-2 pr-3 text-right">{money(report.plannedMdlCents)}</td>
                    <td className="py-2 pr-3 text-right">{money(report.committedMdlCents)}</td>
                    <td className="py-2 pr-3 text-right">{money(report.paidMdlCents)}</td>
                    <td className={cn("py-2 text-right", report.overTotal ? "text-destructive" : "text-success")}>
                      {money(report.availableMdlCents)}
                    </td>
                  </tr>
                </tbody>
              </table>

              {report.overTotal && (
                <p className="mt-2 flex items-start gap-1.5 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
                  Totalul evenimentului e depășit cu {money(-report.availableMdlCents)}.
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                Toate sumele sunt în lei, la cursul BNM: liniile în valută și cererile în valută se compară
                în aceeași monedă. „Angajat" = cereri depuse sau aprobate, dar încă neplătite.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
