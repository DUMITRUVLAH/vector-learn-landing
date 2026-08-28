/**
 * PAR config import — column mapping dialog.
 *
 * Auto-detection guesses; this screen lets the person who opened the file DECIDE:
 * for every worksheet, what kind of data it holds, and which column feeds which field.
 * Columns left on "— nu importa —" are ignored, so the file's own header text stops mattering.
 *
 * Built after a real file (LED.xlsx: sheet "Sheet1", columns `Cod | Denumire | Denumire proiect`)
 * imported nothing because the importer only knew the template's sheet names.
 *
 * Design: Vector 365 tokens only, light + dark, native <select> so keyboard/screen readers work.
 */
import { useMemo, useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button, Dialog, Select } from "@/components/ds";
import { cn } from "@/lib/utils";
import type {
  ParConfigImportMapping,
  ParConfigImportPreview,
  ParCurrency,
  ParImportKind,
  ParImportSheetMapping,
} from "@/lib/api/par";

const SKIP = "skip" as const;

export interface ParImportMappingDialogProps {
  open: boolean;
  /** Null while the preview is still loading. */
  preview: ParConfigImportPreview | null;
  fileName: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (mapping: ParConfigImportMapping) => void;
}

type SheetChoice = {
  kind: ParImportKind | typeof SKIP;
  columns: Record<string, string | null>;
  /** Valuta implicită a sumelor din foaie — bugetele de grant vin în EUR/USD, nu în lei. */
  currency: ParCurrency;
};

/** Initial state = the server's suggestion, which the user then overrides at will. */
function initialChoices(preview: ParConfigImportPreview | null): Record<string, SheetChoice> {
  const state: Record<string, SheetChoice> = {};
  for (const sheet of preview?.sheets ?? []) {
    state[sheet.name] = { kind: sheet.suggestedKind, columns: { ...sheet.suggestedMapping }, currency: "MDL" };
  }
  return state;
}

export function ParImportMappingDialog({
  open,
  preview,
  fileName,
  loading = false,
  onCancel,
  onConfirm,
}: ParImportMappingDialogProps) {
  const [choices, setChoices] = useState<Record<string, SheetChoice>>(() => initialChoices(preview));
  const [seededFor, setSeededFor] = useState<ParConfigImportPreview | null>(null);

  // Re-seed when a different file is previewed (no effect needed — derived during render).
  if (preview !== seededFor) {
    setSeededFor(preview);
    setChoices(initialChoices(preview));
  }

  const kinds = useMemo(
    () => (preview ? (Object.keys(preview.fields) as ParImportKind[]) : []),
    [preview]
  );

  /** Missing required fields, per sheet — the confirm button waits for these. */
  const problems = useMemo(() => {
    const out: { sheet: string; message: string }[] = [];
    for (const sheet of preview?.sheets ?? []) {
      const choice = choices[sheet.name];
      if (!choice || choice.kind === SKIP) continue;
      for (const field of preview!.fields[choice.kind]) {
        if (field.required && !choice.columns[field.key]) {
          out.push({ sheet: sheet.name, message: `alege coloana pentru „${field.label}"` });
        }
      }
    }
    return out;
  }, [choices, preview]);

  const anySelected = Object.values(choices).some((c) => c.kind !== SKIP);

  const setKind = (sheetName: string, kind: ParImportKind | typeof SKIP) => {
    const sheet = preview?.sheets.find((s) => s.name === sheetName);
    setChoices((prev) => ({
      ...prev,
      // Switching the kind re-suggests columns for it: the old field keys don't apply.
      [sheetName]: {
        kind,
        currency: prev[sheetName]?.currency ?? "MDL",
        columns:
          kind === SKIP || !sheet
            ? {}
            : sheet.detectedKind === kind
              ? { ...sheet.suggestedMapping }
              : autoPick(preview!, kind, sheet.headers),
      },
    }));
  };

  const setCurrency = (sheetName: string, currency: ParCurrency) => {
    setChoices((prev) => ({
      ...prev,
      [sheetName]: { ...(prev[sheetName] ?? { kind: SKIP, columns: {} }), currency },
    }));
  };

  const setColumn = (sheetName: string, fieldKey: string, header: string | null) => {
    setChoices((prev) => {
      const current = prev[sheetName];
      const columns = { ...current.columns, [fieldKey]: header };
      // One column can only feed one field — clear it wherever it was used before.
      if (header) {
        for (const key of Object.keys(columns)) {
          if (key !== fieldKey && columns[key] === header) columns[key] = null;
        }
      }
      return { ...prev, [sheetName]: { ...current, columns } };
    });
  };

  const confirm = () => {
    const sheets: ParImportSheetMapping[] = (preview?.sheets ?? []).map((sheet) => ({
      name: sheet.name,
      kind: choices[sheet.name]?.kind ?? SKIP,
      columns: choices[sheet.name]?.columns ?? {},
      options: { currency: choices[sheet.name]?.currency ?? "MDL" },
    }));
    onConfirm({ sheets });
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      size="xl"
      title="Ce importăm din fișier?"
      description={`${fileName} — alege pentru fiecare foaie tipul de date și ce reprezintă fiecare coloană.`}
      footer={
        <>
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Renunță
          </Button>
          <Button onClick={confirm} disabled={loading || !preview || !anySelected || problems.length > 0}>
            {loading && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
            {loading ? "Se importă..." : "Importă"}
          </Button>
        </>
      }
    >
      {!preview ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span>Se citește fișierul...</span>
        </div>
      ) : (
        <div className="space-y-6">
          {preview.sheets.map((sheet) => {
            const choice = choices[sheet.name] ?? { kind: SKIP, columns: {}, currency: "MDL" as ParCurrency };
            const currencyId = `import-currency-${slug(sheet.name)}`;
            const fields = choice.kind === SKIP ? [] : preview.fields[choice.kind];
            const selectId = `import-kind-${slug(sheet.name)}`;
            return (
              <section key={sheet.name} className="rounded-lg border border-border bg-card p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Foaia „{sheet.name}"</span>
                  <span className="text-xs text-muted-foreground">
                    {sheet.totalRows} {sheet.totalRows === 1 ? "rând" : "rânduri"} · {sheet.headers.length} coloane
                  </span>
                  <div className="ml-auto flex items-center gap-2">
                    <label htmlFor={selectId} className="text-xs text-muted-foreground">
                      Importă ca
                    </label>
                    <Select
                      id={selectId}
                      className="w-56"
                      value={choice.kind}
                      onChange={(e) => setKind(sheet.name, e.target.value as ParImportKind | typeof SKIP)}
                    >
                      <option value={SKIP}>— nu importa foaia —</option>
                      {kinds.map((k) => (
                        <option key={k} value={k}>
                          {preview.kindLabels[k]}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>

                {/* Un buget de grant e adesea integral în EUR/USD și fișierul nu are nicio coloană
                    de valută — atunci se alege aici, o dată pentru toată foaia. O coloană „Valută"
                    mapată explicit are prioritate, rând cu rând. */}
                {choice.kind === "budgetCodes" && (
                  <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor={currencyId} className="text-xs text-muted-foreground">
                      Valuta sumelor din foaie
                    </label>
                    <Select
                      id={currencyId}
                      className="w-40"
                      value={choice.currency}
                      onChange={(e) => setCurrency(sheet.name, e.target.value as ParCurrency)}
                    >
                      <option value="MDL">MDL (lei)</option>
                      <option value="EUR">EUR (euro)</option>
                      <option value="USD">USD (dolari)</option>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                      se aplică rândurilor fără coloană „Valută"
                    </span>
                  </div>
                )}

                {sheet.headers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Foaia nu are un rând de antet — nu poate fi mapată.</p>
                ) : choice.kind === SKIP ? (
                  <p className="text-sm text-muted-foreground">Foaia este sărită.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th scope="col" className="py-1.5 pr-3 font-medium">Coloana din fișier</th>
                          <th scope="col" className="py-1.5 pr-3 font-medium">Exemple</th>
                          <th scope="col" className="py-1.5 font-medium">Se importă ca</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sheet.headers.map((header, i) => {
                          const assigned = fields.find((f) => choice.columns[f.key] === header);
                          const columnId = `import-col-${slug(sheet.name)}-${i}`;
                          return (
                            <tr key={header + i} className="border-b border-border/60 last:border-0 align-top">
                              <td className="py-2 pr-3 font-medium text-foreground">{header}</td>
                              <td className="py-2 pr-3 text-xs text-muted-foreground">
                                {sheet.sampleRows.slice(0, 3).map((row, r) => (
                                  <div key={r} className="truncate max-w-[22ch]" title={row[i]}>
                                    {row[i] || "—"}
                                  </div>
                                ))}
                              </td>
                              <td className="py-2">
                                <label htmlFor={columnId} className="sr-only">
                                  Câmpul pentru coloana {header}
                                </label>
                                <Select
                                  id={columnId}
                                  className="w-56"
                                  value={assigned?.key ?? ""}
                                  onChange={(e) =>
                                    e.target.value
                                      ? setColumn(sheet.name, e.target.value, header)
                                      : assigned && setColumn(sheet.name, assigned.key, null)
                                  }
                                >
                                  <option value="">— nu importa —</option>
                                  {fields.map((f) => (
                                    <option key={f.key} value={f.key}>
                                      {f.label}
                                      {f.required ? " *" : ""}
                                    </option>
                                  ))}
                                </Select>
                                {assigned?.hint && (
                                  <p className="mt-1 max-w-[24ch] text-xs text-muted-foreground">{assigned.hint}</p>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {problems
                  .filter((p) => p.sheet === sheet.name)
                  .map((p, i) => (
                    <p key={i} className={cn("flex items-center gap-1.5 text-xs text-destructive")}>
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                      {p.message}
                    </p>
                  ))}
              </section>
            );
          })}
          {!anySelected && (
            <p className="text-sm text-muted-foreground">
              Nicio foaie selectată — alege cel puțin un tip de import.
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** Re-suggest columns when the user changes a sheet's kind. */
function autoPick(
  preview: ParConfigImportPreview,
  kind: ParImportKind,
  headers: string[]
): Record<string, string | null> {
  const taken = new Set<string>();
  const columns: Record<string, string | null> = {};
  for (const field of preview.fields[kind]) {
    const match = headers.find((h) => !taken.has(h) && norm(h) === norm(field.label));
    columns[field.key] = match ?? null;
    if (match) taken.add(match);
  }
  return columns;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const slug = (s: string) => s.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
