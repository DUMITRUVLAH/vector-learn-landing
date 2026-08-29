/**
 * DG-124 — N acte dintr-un tabel.
 *
 * Cazul real: 40 de contracte de voluntariat pentru un eveniment, sau acte pentru participanți.
 * Făcute unul câte unul, e o după-amiază pierdută. Diferența față de generarea în masă existentă:
 * aici ies ACTE (cu număr, contraparte, sumă, loc în dosarul proiectului), nu doar fișiere.
 */
import { useCallback, useMemo, useState } from "react";
import { AlertCircle, Loader2, Upload, X } from "lucide-react";
import { parseExcel, type ParsedExcelResult } from "@/lib/api/docmerge";
import { api } from "@/lib/api";
import { DOC_KIND_LABELS, type DocTemplateListItem } from "@/lib/api/docs";
import { FIELD_GROUPS } from "@/lib/docs/fieldCatalog";

/** Câmpurile pe care un lot le poate completa din coloane. Restul vin din registre. */
const BULK_FIELDS = [
  { name: "contraparte.denumire", label: "Denumirea furnizorului", required: true },
  { name: "contraparte.idno", label: "Cod fiscal", required: false },
  { name: "total.suma", label: "Suma", required: false },
  { name: "total.valuta", label: "Valuta", required: false },
  { name: "document.titlu", label: "Titlul actului", required: false },
];

export interface BulkGenerateDialogProps {
  templates: DocTemplateListItem[];
  onClose: () => void;
  onDone: (created: number, failed: number) => void;
}

/** Fără diacritice: antetul scrie „Denumire", câmpul „Denumirea contrapărții". */
function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Sugerează coloana potrivită. Potrivirea e pe RĂDĂCINA cuvântului (primele 5 litere), nu pe
 * cuvântul întreg: în tabele scrie „Denumire participant", iar câmpul se cheamă „Denumirea
 * contrapărții" — cu potrivire exactă nu s-ar propune nimic, și omul ar mapa manual de fiecare dată.
 * Sugestia rămâne doar sugestie: selectul e vizibil și se poate schimba.
 */
function suggestColumn(headers: string[], fieldLabel: string): string {
  const stems = fold(fieldLabel)
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .map((w) => w.slice(0, 5));
  return headers.find((h) => stems.some((stem) => fold(h).includes(stem))) ?? "";
}

export function BulkGenerateDialog({ templates, onClose, onDone }: BulkGenerateDialogProps) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [kind, setKind] = useState("act_primire_predare");
  const [parsed, setParsed] = useState<ParsedExcelResult | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; failed: { row: number; reason: string }[] } | null>(null);

  const onFile = useCallback(async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const res = await parseExcel(file);
      setParsed(res);
      const guessed: Record<string, string> = {};
      for (const f of BULK_FIELDS) guessed[f.name] = suggestColumn(res.headers, f.label);
      setMapping(guessed);
    } catch {
      setError("Fișierul nu a putut fi citit. Acceptăm .xlsx.");
    } finally {
      setBusy(false);
    }
  }, []);

  const rows = useMemo(() => {
    if (!parsed) return [];
    return parsed.previewRows.map((row) => {
      const mapped: Record<string, string> = {};
      for (const f of BULK_FIELDS) {
        const column = mapping[f.name];
        if (column && row[column] != null) mapped[f.name] = String(row[column]);
      }
      return mapped;
    });
  }, [parsed, mapping]);

  const generate = useCallback(async () => {
    if (rows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ created: unknown[]; failed: { row: number; reason: string }[] }>(
        "/api/docs/bulk",
        { method: "POST", body: JSON.stringify({ templateId: templateId || null, kind, rows }) }
      );
      setResult({ created: res.created.length, failed: res.failed });
      onDone(res.created.length, res.failed.length);
    } catch {
      setError("Lotul nu a putut fi generat.");
    } finally {
      setBusy(false);
    }
  }, [rows, templateId, kind, onDone]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Generare în masă"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Generare în masă</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Un rând din tabel = un act, salvat în registru cu numărul lui.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide"
            className="touch-target rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {error && (
          <div role="alert" className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            {error}
          </div>
        )}

        {result ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-foreground">
              S-au creat <strong>{result.created}</strong> acte.
            </p>
            {result.failed.length > 0 && (
              <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                <p className="font-medium text-foreground">
                  {result.failed.length} rânduri nu au putut fi generate:
                </p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {result.failed.slice(0, 10).map((f) => (
                    <li key={f.row}>
                      Rândul {f.row}: {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="touch-target rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Vezi actele
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="bulk-kind" className="block text-sm font-medium text-foreground">
                  Tipul actului
                </label>
                <select
                  id="bulk-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  {Object.entries(DOC_KIND_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="bulk-template" className="block text-sm font-medium text-foreground">
                  Șablon
                </label>
                <select
                  id="bulk-template"
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="touch-target mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                >
                  <option value="">Șablonul implicit al tipului</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-4">
              <label htmlFor="bulk-file" className="block text-sm font-medium text-foreground">
                Tabelul (.xlsx)
              </label>
              <input
                id="bulk-file"
                type="file"
                accept=".xlsx"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onFile(file);
                }}
                className="mt-1 block w-full text-sm text-muted-foreground"
              />
            </div>

            {parsed && (
              <>
                <p className="mt-3 text-sm text-muted-foreground">
                  {parsed.rowCount} rânduri găsite
                  {parsed.rowCount > parsed.previewRows.length
                    ? ` · se generează primele ${parsed.previewRows.length}`
                    : ""}
                  .
                </p>

                <div className="mt-3 space-y-2">
                  {BULK_FIELDS.map((f) => (
                    <div key={f.name} className="flex flex-wrap items-center gap-2">
                      <label htmlFor={`map-${f.name}`} className="w-56 text-sm text-foreground">
                        {f.label}
                        {f.required && <span className="text-destructive"> *</span>}
                      </label>
                      <select
                        id={`map-${f.name}`}
                        value={mapping[f.name] ?? ""}
                        onChange={(e) => setMapping((m) => ({ ...m, [f.name]: e.target.value }))}
                        className="touch-target flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                      >
                        <option value="">— fără coloană —</option>
                        {parsed.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Restul câmpurilor ({FIELD_GROUPS.length} grupuri) se completează din registre.
                  </p>
                  <button
                    type="button"
                    disabled={busy || !mapping["contraparte.denumire"]}
                    onClick={() => void generate()}
                    className="touch-target inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Upload className="h-4 w-4" aria-hidden="true" />
                    )}
                    Generează {rows.length} acte
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
