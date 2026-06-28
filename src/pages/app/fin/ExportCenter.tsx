/**
 * EXPORT-003: Export Center FinDesk
 * Ruta: /app/fin/export
 *
 * Pagina centralizată de export contabil — toate formatele disponibile
 * (jurnal, balanță, SFS, SAF-T, 1C, SAGA) cu filtre de dată și
 * selector year/period pentru SAF-T.
 */
import { useState, useEffect } from "react";
import { BusinessShell } from "@/components/business/BusinessShell";
import { useSession } from "@/hooks/useSession";
import { useRouter } from "@/router/HashRouter";
import { ExportFormatCard } from "@/components/fin/ExportFormatCard";
import {
  getExportFormats,
  downloadJournalCsv,
  downloadTrialBalanceCsv,
  downloadInvoicesSfsCsv,
  downloadSaftRoXml,
  downloadOneCXml,
  downloadSagaCsv,
  downloadSaftRoFull,
  triggerDownload,
  type ExportFormat,
} from "@/lib/api/finExport";

// ─── Format-uri fallback dacă API e absent ────────────────────────────────────

const FALLBACK_FORMATS: ExportFormat[] = [
  {
    id: "journal-csv",
    label: "Jurnal GL (CSV)",
    description: "Jurnal înregistrări contabile în format CSV (Excel RO/MD, delimiter ;)",
    mime: "text/csv",
    endpoint: "/api/fin/export/journal",
    params: ["from", "to"],
  },
  {
    id: "trial-balance-csv",
    label: "Balanță de verificare (CSV)",
    description: "Balanță de verificare cu totaluri debit/credit per cont, la o dată dată",
    mime: "text/csv",
    endpoint: "/api/fin/export/trial-balance",
    params: ["as_of"],
  },
  {
    id: "invoices-sfs-csv",
    label: "Facturi SFS Moldova (CSV)",
    description: "Registru facturi în format SFS Moldova pentru declarații TVA trimestriale",
    mime: "text/csv",
    endpoint: "/api/fin/export/invoices-sfs",
    params: ["from", "to"],
  },
  {
    id: "saf-t-ro-xml",
    label: "SAF-T RO simplificat (XML)",
    description: "Standard Audit File simplificat pentru ANAF România — subset funcțional",
    mime: "application/xml",
    endpoint: "/api/fin/export/saf-t-ro",
    params: ["year", "period"],
  },
  {
    id: "saf-t-ro-full",
    label: "SAF-T RO complet cu TVA (XML)",
    description: "SAF-T RO cu secțiunea TaxTable TVA 20%/12%/0% pentru declarații ANAF detaliate",
    mime: "application/xml",
    endpoint: "/api/fin/export/saf-t-ro-full",
    params: ["year", "period"],
  },
  {
    id: "1c-xml",
    label: "Export 1C:Accounting (XML)",
    description: "XML compatibil import în 1C:Contabilitate — format Moldova cu tag-uri rusești",
    mime: "application/xml",
    endpoint: "/api/fin/export/1c-xml",
    params: ["from", "to"],
  },
  {
    id: "saga-csv",
    label: "Export SAGA C (CSV)",
    description: "Jurnal în format SAGA C (România) cu delimitator virgulă — import direct",
    mime: "text/csv",
    endpoint: "/api/fin/export/saga-csv",
    params: ["from", "to"],
  },
];

// ─── Helper: construiește filename din format ID + perioadă ───────────────────

function buildFilename(formatId: string, from?: string, to?: string, year?: number, period?: string): string {
  const date = new Date().toISOString().slice(0, 10);
  if (formatId.includes("saf-t")) return `${formatId.replace(/-/g, "_")}_${year ?? date.slice(0, 4)}${period ? `_${period}` : ""}.xml`;
  if (formatId.endsWith("xml") || formatId === "1c-xml") return `${formatId.replace(/-/g, "_")}_${from ?? date}_${to ?? date}.xml`;
  return `${formatId.replace(/-/g, "_")}_${from ?? date}_${to ?? date}.csv`;
}

// ─── Perioadele SAF-T ─────────────────────────────────────────────────────────

const SAFT_PERIODS = [
  { value: "", label: "Tot anul" },
  { value: "1", label: "Ian" },
  { value: "2", label: "Feb" },
  { value: "3", label: "Mar" },
  { value: "Q1", label: "T1 (Ian–Mar)" },
  { value: "4", label: "Apr" },
  { value: "5", label: "Mai" },
  { value: "6", label: "Iun" },
  { value: "Q2", label: "T2 (Apr–Iun)" },
  { value: "7", label: "Iul" },
  { value: "8", label: "Aug" },
  { value: "9", label: "Sep" },
  { value: "Q3", label: "T3 (Iul–Sep)" },
  { value: "10", label: "Oct" },
  { value: "11", label: "Nov" },
  { value: "12", label: "Dec" },
  { value: "Q4", label: "T4 (Oct–Dec)" },
];

// ─── Component principal ──────────────────────────────────────────────────────

export function ExportCenter() {
  const { status: sessionStatus } = useSession();
  const { navigate } = useRouter();

  // ─── Filtre globale ───────────────────────────────────────────────────────
  const defaultFrom = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const defaultTo = new Date().toISOString().slice(0, 10);

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [period, setPeriod] = useState<string>("");

  // ─── Formate ─────────────────────────────────────────────────────────────
  const [formats, setFormats] = useState<ExportFormat[]>(FALLBACK_FORMATS);
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string | null>>({});

  useEffect(() => {
    getExportFormats()
      .then((f) => { if (f.length >= 1) setFormats(f); })
      .catch(() => { /* silently use fallback */ });
  }, []);

  if (sessionStatus === "unauthenticated") {
    navigate("/app/login");
    return null;
  }

  // ─── Download handler per format ─────────────────────────────────────────

  const setLoading = (id: string, v: boolean) =>
    setLoadingMap((m) => ({ ...m, [id]: v }));
  const setError = (id: string, v: string | null) =>
    setErrorMap((m) => ({ ...m, [id]: v }));

  async function handleDownload(formatId: string) {
    setLoading(formatId, true);
    setError(formatId, null);
    try {
      let blob: Blob;
      const filename = buildFilename(formatId, from, to, year, period || undefined);

      switch (formatId) {
        case "journal-csv":
          blob = await downloadJournalCsv({ from, to });
          break;
        case "trial-balance-csv":
          blob = await downloadTrialBalanceCsv({ as_of: to });
          break;
        case "invoices-sfs-csv":
          blob = await downloadInvoicesSfsCsv({ from, to });
          break;
        case "saf-t-ro-xml":
          blob = await downloadSaftRoXml({ year, period: period || undefined });
          break;
        case "saf-t-ro-full":
          blob = await downloadSaftRoFull({ year, period: period || undefined });
          break;
        case "1c-xml":
          blob = await downloadOneCXml({ from, to });
          break;
        case "saga-csv":
          blob = await downloadSagaCsv({ from, to });
          break;
        default:
          throw new Error(`Format necunoscut: ${formatId}`);
      }

      triggerDownload(blob, filename);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Eroare la export.";
      setError(formatId, `Eroare: ${msg}`);
    } finally {
      setLoading(formatId, false);
    }
  }

  // ─── Determină dacă un format folosește year/period sau from/to ──────────

  const isSaftFormat = (id: string) => id.startsWith("saf-t");

  return (
    <BusinessShell
      pageTitle="Export Contabil"
      pageDescription="Descarcă date contabile în format compatibil 1C, SAGA C, SAF-T RO, SFS Moldova"
    >
      <div className="space-y-8 max-w-3xl">
        {/* ─── Filtre globale ─────────────────────────────────────────────── */}
        <section
          className="rounded-xl border border-border bg-card p-5 space-y-5"
          aria-labelledby="filters-heading"
        >
          <h2 id="filters-heading" className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Perioadă export
          </h2>

          {/* Filtre interval dată */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="export-from" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                De la
              </label>
              <input
                id="export-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Data de start export"
              />
            </div>
            <div>
              <label htmlFor="export-to" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                Până la
              </label>
              <input
                id="export-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Data de final export"
              />
            </div>
          </div>

          {/* Filtre SAF-T: year + period */}
          <div className="border-t border-border pt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              SAF-T: an + perioadă
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="saft-year" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  An fiscal
                </label>
                <input
                  id="saft-year"
                  type="number"
                  min={2020}
                  max={2100}
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="An fiscal pentru SAF-T"
                />
              </div>
              <div>
                <label htmlFor="saft-period" className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                  Perioadă
                </label>
                <select
                  id="saft-period"
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  aria-label="Perioadă pentru SAF-T"
                >
                  {SAFT_PERIODS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Carduri formate ─────────────────────────────────────────────── */}
        <section aria-labelledby="formats-heading">
          <h2 id="formats-heading" className="text-sm font-bold uppercase tracking-wide text-muted-foreground mb-4">
            Formate disponibile
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {formats.map((fmt) => (
              <ExportFormatCard
                key={fmt.id}
                id={fmt.id}
                label={fmt.label}
                description={fmt.description}
                mime={fmt.mime}
                isLoading={!!loadingMap[fmt.id]}
                error={errorMap[fmt.id] ?? null}
                onDownload={() => void handleDownload(fmt.id)}
              />
            ))}
          </div>
        </section>

        {/* ─── Notă SAF-T ──────────────────────────────────────────────────── */}
        <p className="text-xs text-muted-foreground">
          Formatele SAF-T folosesc filtrele "An fiscal" + "Perioadă" de mai sus.
          Celelalte formate folosesc filtrele "De la" / "Până la".
        </p>
      </div>
    </BusinessShell>
  );
}

// Alias pentru compatibilitate cu ruta App.tsx
export { ExportCenter as FinExportCenter };
