/**
 * ITPARK-201: Tabel editabil linii de venit (Anexa 3)
 * CORE: backlog/fin/itpark/ITPARK-CORE.md §2 — itpark_revenue_lines
 *
 * Funcționalități:
 * - Listare + editare inline a liniilor (client, documente, serviciu, CAEM, sumă, lună)
 * - Dropdown CAEM din nomenclatorul ITPARK-002 (niciodată hardcodat)
 * - isEligible derivat din cod (badge eligibil/neeligibil); override manual cu confirmare
 * - Adăugare rând nou; ștergere cu confirmare
 * - Total live la subsol (Σ amountCents)
 * - design-system tokens, dark mode, a11y
 */
import { useState, useEffect, useCallback } from "react";
import {
  listLines,
  createLine,
  updateLine,
  deleteLine,
  fmtMDL,
  parseMDLtoCents,
  type RevenueLine,
  type RevenueLineWrite,
} from "../../../../lib/api/itparkLines";
import { fetchCaemCodes, isEligibleCaemLocal, suggestCaem, type CaemCode } from "../../../../lib/api/itparkCaem";
import RevenueImportDialog from "./RevenueImportDialog";

// ─── Month labels ─────────────────────────────────────────────────────────────

const MONTHS: { value: number; label: string }[] = [
  { value: 1, label: "Ianuarie" },
  { value: 2, label: "Februarie" },
  { value: 3, label: "Martie" },
  { value: 4, label: "Aprilie" },
  { value: 5, label: "Mai" },
  { value: 6, label: "Iunie" },
  { value: 7, label: "Iulie" },
  { value: 8, label: "August" },
  { value: 9, label: "Septembrie" },
  { value: 10, label: "Octombrie" },
  { value: 11, label: "Noiembrie" },
  { value: 12, label: "Decembrie" },
];

// ─── Row editor state ─────────────────────────────────────────────────────────

interface EditingRow {
  id: string | null; // null = rând nou
  clientName: string;
  documentRefs: string;
  serviceDescription: string;
  caemCode: string;
  amountMDL: string; // string pentru editare (ex. "15.000,50")
  isEligible: boolean;
  isEligibleOverridden: boolean;
  month: string; // "" = mixt/nedefinit
}

function emptyRow(engagementId: string): EditingRow & { engagementId: string } {
  return {
    id: null,
    engagementId,
    clientName: "",
    documentRefs: "",
    serviceDescription: "",
    caemCode: "",
    amountMDL: "",
    isEligible: false,
    isEligibleOverridden: false,
    month: "",
  };
}

// ─── Inline editor ────────────────────────────────────────────────────────────

const cellInput =
  "block w-full rounded border border-input bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary min-h-[36px]";

interface RowEditorProps {
  row: EditingRow;
  caemCodes: CaemCode[];
  onChange: (patch: Partial<EditingRow>) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

function RowEditor({ row, caemCodes, onChange, onSave, onCancel, saving }: RowEditorProps) {
  // ITPARK-203: sugestie CAEM deterministă din serviceDescription
  const suggestion = row.caemCode ? null : suggestCaem(row.serviceDescription);

  function handleCaemChange(code: string) {
    const eligible = isEligibleCaemLocal(code, caemCodes);
    onChange({ caemCode: code, isEligible: eligible, isEligibleOverridden: false });
  }

  function applySuggestion() {
    if (!suggestion) return;
    const eligible = isEligibleCaemLocal(suggestion.code, caemCodes);
    onChange({ caemCode: suggestion.code, isEligible: eligible, isEligibleOverridden: false });
  }

  function handleEligibleToggle() {
    const newVal = !row.isEligible;
    if (row.caemCode) {
      const derived = isEligibleCaemLocal(row.caemCode, caemCodes);
      if (newVal !== derived) {
        if (!confirm(`Schimbați eligibilitatea la „${newVal ? "eligibil" : "neeligibil"}" (override față de codul CAEM)? Acțiunea e auditată.`)) return;
        onChange({ isEligible: newVal, isEligibleOverridden: true });
        return;
      }
    }
    onChange({ isEligible: newVal, isEligibleOverridden: false });
  }

  return (
    <tr className="bg-muted/20 border-b border-primary/20">
      <td className="px-2 py-2">
        <input
          value={row.clientName}
          onChange={(e) => onChange({ clientName: e.target.value })}
          placeholder="Client..."
          aria-label="Denumire client"
          className={cellInput}
          autoFocus
        />
      </td>
      <td className="px-2 py-2">
        <input
          value={row.documentRefs}
          onChange={(e) => onChange({ documentRefs: e.target.value })}
          placeholder="Nr. factură(i)..."
          aria-label="Referințe documente"
          className={cellInput}
        />
      </td>
      <td className="px-2 py-2">
        <input
          value={row.serviceDescription}
          onChange={(e) => onChange({ serviceDescription: e.target.value })}
          placeholder="Descriere serviciu..."
          aria-label="Descrierea serviciului"
          className={cellInput}
        />
      </td>
      <td className="px-2 py-2">
        <select
          value={row.caemCode}
          onChange={(e) => handleCaemChange(e.target.value)}
          aria-label="Cod CAEM"
          className={`${cellInput} cursor-pointer`}
        >
          <option value="">— Alege CAEM —</option>
          {caemCodes.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} — {c.label}
              {c.eligible ? " ✓" : ""}
            </option>
          ))}
        </select>
        {/* ITPARK-203: sugestie deterministă — sugestie ONLY, nu override */}
        {suggestion && (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <span>Sugestie:</span>
            <button
              type="button"
              onClick={applySuggestion}
              aria-label={`Aplică sugestia cod CAEM ${suggestion.code} (${suggestion.reason})`}
              className="font-mono text-primary underline underline-offset-2 hover:no-underline"
            >
              {suggestion.code}
            </button>
            <span className="text-xs opacity-60">({Math.round(suggestion.confidence * 100)}%)</span>
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-right">
        <input
          value={row.amountMDL}
          onChange={(e) => onChange({ amountMDL: e.target.value })}
          placeholder="0,00"
          aria-label="Sumă MDL"
          className={`${cellInput} text-right`}
        />
      </td>
      <td className="px-2 py-2">
        <select
          value={row.month}
          onChange={(e) => onChange({ month: e.target.value })}
          aria-label="Luna"
          className={`${cellInput} cursor-pointer`}
        >
          <option value="">Mixt / N/A</option>
          {MONTHS.map((m) => (
            <option key={m.value} value={String(m.value)}>
              {m.label}
            </option>
          ))}
        </select>
      </td>
      <td className="px-2 py-2">
        <button
          onClick={handleEligibleToggle}
          aria-label={`Eligibil: ${row.isEligible ? "DA" : "NU"}${row.isEligibleOverridden ? " (override)" : ""}`}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer border ${
            row.isEligible
              ? "bg-green-100 text-green-800 border-green-200 dark:bg-green-900 dark:text-green-200 dark:border-green-700"
              : "bg-muted text-muted-foreground border-border"
          }${row.isEligibleOverridden ? " ring-1 ring-yellow-400" : ""}`}
        >
          {row.isEligible ? "Eligibil" : "Neeligibil"}
          {row.isEligibleOverridden && " *"}
        </button>
      </td>
      <td className="px-2 py-2">
        <div className="flex items-center gap-1">
          <button
            onClick={onSave}
            disabled={saving || !row.clientName.trim() || !row.caemCode || !row.amountMDL}
            aria-label="Salvează linia"
            className="rounded px-2 py-1 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 min-h-[32px]"
          >
            {saving ? "..." : "Salvează"}
          </button>
          <button
            onClick={onCancel}
            aria-label="Anulează editarea"
            className="rounded px-2 py-1 text-xs font-medium border border-border hover:bg-muted min-h-[32px]"
          >
            ✕
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Component principal ──────────────────────────────────────────────────────

interface RevenueLinesTableProps {
  engagementId: string;
}

export default function RevenueLinesTable({ engagementId }: RevenueLinesTableProps) {
  const [lines, setLines] = useState<RevenueLine[]>([]);
  const [caemCodes, setCaemCodes] = useState<CaemCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [editRow, setEditRow] = useState<EditingRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Totaluri live
  const totalCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const eligibleCents = lines.filter((l) => l.isEligible).reduce((s, l) => s + l.amountCents, 0);

  useEffect(() => {
    Promise.all([listLines(engagementId), fetchCaemCodes()])
      .then(([ls, cc]) => {
        setLines(ls);
        setCaemCodes(cc);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Eroare la încărcare"))
      .finally(() => setLoading(false));
  }, [engagementId]);

  function startNew() {
    setEditingId("new");
    setEditRow({ ...emptyRow(engagementId) });
  }

  function startEdit(line: RevenueLine) {
    setEditingId(line.id);
    const derived = isEligibleCaemLocal(line.caemCode, caemCodes);
    setEditRow({
      id: line.id,
      clientName: line.clientName,
      documentRefs: line.documentRefs ?? "",
      serviceDescription: line.serviceDescription,
      caemCode: line.caemCode,
      amountMDL: (line.amountCents / 100).toFixed(2).replace(".", ","),
      isEligible: line.isEligible,
      isEligibleOverridden: line.isEligible !== derived,
      month: line.month !== null ? String(line.month) : "",
    });
  }

  const handleRowChange = useCallback((patch: Partial<EditingRow>) => {
    setEditRow((prev) => prev ? { ...prev, ...patch } : null);
  }, []);

  async function handleSave() {
    if (!editRow) return;
    setSaving(true);
    try {
      const payload: RevenueLineWrite = {
        engagementId,
        rowNo: editRow.id
          ? lines.findIndex((l) => l.id === editRow.id)
          : lines.length,
        clientName: editRow.clientName.trim(),
        documentRefs: editRow.documentRefs || null,
        serviceDescription: editRow.serviceDescription,
        caemCode: editRow.caemCode,
        amountCents: parseMDLtoCents(editRow.amountMDL),
        isEligible: editRow.isEligible,
        month: editRow.month ? parseInt(editRow.month, 10) : null,
      };

      if (editRow.id) {
        const updated = await updateLine(editRow.id, payload);
        setLines((prev) => prev.map((l) => (l.id === editRow.id ? updated : l)));
      } else {
        const created = await createLine(payload);
        setLines((prev) => [...prev, created]);
      }
      setEditingId(null);
      setEditRow(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Eroare la salvare");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, clientName: string) {
    if (!confirm(`Ștergi linia „${clientName}"?`)) return;
    try {
      setDeletingId(id);
      await deleteLine(id);
      setLines((prev) => prev.filter((l) => l.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Eroare la ștergere");
    } finally {
      setDeletingId(null);
    }
  }

  function handleCancel() {
    setEditingId(null);
    setEditRow(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12" aria-busy="true" aria-label="Se încarcă liniile">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" role="status" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive" role="alert">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Import dialog */}
      {showImportDialog && (
        <RevenueImportDialog
          engagementId={engagementId}
          onImported={(count) => {
            // Reîncarcă lista după import
            listLines(engagementId)
              .then(setLines)
              .catch(console.error);
            setShowImportDialog(false);
          }}
          onClose={() => setShowImportDialog(false)}
        />
      )}
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="text-sm text-muted-foreground">
          {lines.length} {lines.length === 1 ? "linie" : "linii"}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImportDialog(true)}
            disabled={editingId !== null}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted disabled:opacity-60 disabled:cursor-not-allowed min-h-[36px]"
            aria-label="Importă linii din clipboard, CSV sau facturi"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Importă
          </button>
          <button
            onClick={startNew}
            disabled={editingId !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed min-h-[36px]"
            aria-label="Adaugă linie nouă"
          >
            <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Linie nouă
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full text-xs" aria-label="Linii Anexa 3 — Venituri">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left">
              <th className="px-3 py-2.5 font-medium text-muted-foreground">Client</th>
              <th className="px-3 py-2.5 font-medium text-muted-foreground">Documente</th>
              <th className="px-3 py-2.5 font-medium text-muted-foreground">Obiect serviciu</th>
              <th className="px-3 py-2.5 font-medium text-muted-foreground">CAEM</th>
              <th className="px-3 py-2.5 font-medium text-muted-foreground text-right">Sumă (MDL)</th>
              <th className="px-3 py-2.5 font-medium text-muted-foreground">Lună</th>
              <th className="px-3 py-2.5 font-medium text-muted-foreground">Eligibil</th>
              <th className="px-3 py-2.5 font-medium text-muted-foreground text-right">Acțiuni</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {lines.map((line) =>
              editingId === line.id && editRow ? (
                <RowEditor
                  key={line.id}
                  row={editRow}
                  caemCodes={caemCodes}
                  onChange={handleRowChange}
                  onSave={handleSave}
                  onCancel={handleCancel}
                  saving={saving}
                />
              ) : (
                <tr key={line.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-2 font-medium text-foreground">{line.clientName}</td>
                  <td className="px-3 py-2 text-muted-foreground max-w-xs truncate" title={line.documentRefs ?? ""}>
                    {line.documentRefs ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-xs truncate" title={line.serviceDescription}>
                    {line.serviceDescription || "—"}
                  </td>
                  <td className="px-3 py-2 font-mono text-foreground">{line.caemCode}</td>
                  <td className="px-3 py-2 text-right font-mono text-foreground tabular-nums">
                    {fmtMDL(line.amountCents)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {line.month ? MONTHS.find((m) => m.value === line.month)?.label ?? "—" : "Mixt"}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        line.isEligible
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {line.isEligible ? "Eligibil" : "Neeligibil"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => startEdit(line)}
                        disabled={editingId !== null}
                        aria-label={`Editează linia ${line.clientName}`}
                        className="rounded px-2 py-1 text-xs font-medium border border-border hover:bg-muted disabled:opacity-50 min-h-[32px]"
                      >
                        Editează
                      </button>
                      <button
                        onClick={() => handleDelete(line.id, line.clientName)}
                        disabled={deletingId === line.id || editingId !== null}
                        aria-label={`Șterge linia ${line.clientName}`}
                        className="rounded px-2 py-1 text-xs font-medium text-destructive border border-destructive/30 hover:bg-destructive/10 disabled:opacity-50 min-h-[32px]"
                      >
                        {deletingId === line.id ? "..." : "Șterge"}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}

            {/* Rând nou inline */}
            {editingId === "new" && editRow && (
              <RowEditor
                key="new"
                row={editRow}
                caemCodes={caemCodes}
                onChange={handleRowChange}
                onSave={handleSave}
                onCancel={handleCancel}
                saving={saving}
              />
            )}

            {/* Empty state */}
            {lines.length === 0 && editingId !== "new" && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  Nu există linii de venit. Adăugați prima linie pentru a popula Anexa 3.
                </td>
              </tr>
            )}
          </tbody>

          {/* Footer — totaluri live */}
          {lines.length > 0 && (
            <tfoot className="border-t-2 border-border bg-muted/30">
              <tr>
                <td colSpan={4} className="px-3 py-2.5 text-xs font-semibold text-foreground">
                  TOTAL
                </td>
                <td className="px-3 py-2.5 text-right text-xs font-bold text-foreground tabular-nums">
                  {fmtMDL(totalCents)}
                </td>
                <td />
                <td className="px-3 py-2.5">
                  <div className="space-y-0.5">
                    <div className="text-xs text-green-700 dark:text-green-400 font-medium">
                      Eligibil: {fmtMDL(eligibleCents)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {totalCents > 0
                        ? `${((eligibleCents / totalCents) * 100).toFixed(2)}%`
                        : "0%"}
                    </div>
                  </div>
                </td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
