/**
 * EXPORT-003: Card pentru un format de export contabil.
 * Afișează icon, titlu, descriere scurtă și buton "Descarcă".
 * Acceptă un spinner de loading și un mesaj de eroare inline.
 */
import { Download, FileText, FileSpreadsheet, FileCode } from "lucide-react";

export interface ExportFormatCardProps {
  id: string;
  label: string;
  description: string;
  mime: string;
  isLoading: boolean;
  error?: string | null;
  onDownload: () => void;
}

function FormatIcon({ mime }: { mime: string }) {
  if (mime === "application/xml") {
    return <FileCode className="h-5 w-5 text-primary" aria-hidden="true" />;
  }
  if (mime === "text/csv") {
    return <FileSpreadsheet className="h-5 w-5 text-primary" aria-hidden="true" />;
  }
  return <FileText className="h-5 w-5 text-primary" aria-hidden="true" />;
}

export function ExportFormatCard({
  id,
  label,
  description,
  mime,
  isLoading,
  error,
  onDownload,
}: ExportFormatCardProps) {
  return (
    <article
      className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3"
      aria-label={label}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">
          <FormatIcon mime={mime} />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-snug">{label}</h3>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={onDownload}
        disabled={isLoading}
        aria-label={`Descarcă ${label}`}
        data-testid={`download-btn-${id}`}
        className="inline-flex items-center gap-2 self-start rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 min-h-[44px] min-w-[44px] transition-colors"
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        {isLoading ? "Se descarcă…" : "Descarcă"}
      </button>
    </article>
  );
}
