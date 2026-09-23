/**
 * Copia patentei, ca rând de document: bifă, numele fișierului și „Deschide".
 *
 * Owner, 23.09.2026: „La atașarea patentei trebuie bifă sau confirmare că s-a încărcat — acum pui,
 * dar nu e clar dacă s-a pus sau nu. Să fie ca la documente atașate." Rândul ăsta e confirmarea:
 * există doar când fișierul chiar e salvat pe server, iar cât timp urcă, locul lui îl ține rândul
 * „Se încarcă…" — omul nu rămâne niciodată fără un semn că s-a întâmplat ceva.
 */
import { AlertCircle, AlertTriangle, CheckCircle2, Eye, Loader2, RotateCw, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PatentFileRowProps {
  fileName: string;
  sizeBytes?: number | null;
  uploadedAt?: string | null;
  /**
   * De unde vine copia: `request` = încărcată pe cererea asta; `registry` = salvată pe beneficiar
   * dintr-o cerere anterioară (preluată acum, fără s-o mai ceară nimeni).
   */
  origin: "request" | "registry";
  /** Termenul patentei a trecut — copia rămâne deschisă, dar rândul nu mai arată „în regulă". */
  expired?: boolean;
  onOpen: () => void;
  /** Lipsă = fără buton de scoatere (fișa cererii, unde nimic nu se mai editează). */
  onRemove?: () => void;
}

function formatFileSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

function formatDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("ro-RO", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function PatentFileRow({
  fileName,
  sizeBytes,
  uploadedAt,
  origin,
  expired = false,
  onOpen,
  onRemove,
}: PatentFileRowProps) {
  const day = formatDay(uploadedAt);
  const title = expired
    ? origin === "registry"
      ? "Copia patentei salvată la beneficiar — expirată"
      : "Copia patentei încărcată — patenta a expirat"
    : origin === "registry"
      ? "Patenta e salvată la beneficiar"
      : "Patenta e încărcată";
  const meta = [
    fileName,
    formatFileSize(sizeBytes),
    day ? (origin === "registry" ? `salvată pe ${day}` : `încărcată pe ${day}`) : null,
  ].filter(Boolean).join(" · ");

  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-2",
        expired ? "border-destructive/40 bg-destructive/5" : "border-success/40 bg-success/10",
      )}
    >
      {expired ? (
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
      ) : (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block truncate text-xs text-muted-foreground" title={fileName}>{meta}</span>
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
        aria-label={`Deschide patenta ${fileName}`}
      >
        <Eye className="h-4 w-4" aria-hidden />
        Deschide
      </button>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Scoate copia patentei de pe cerere"
          title="Scoate copia patentei de pe cerere"
          className="touch-target flex shrink-0 items-center justify-center rounded p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

export interface PatentFileUploadingProps {
  step: "reading" | "compress" | "upload" | "finalize";
}

/** Rândul care ține locul copiei cât timp urcă — același loc, ca omul să știe unde să se uite. */
export function PatentFileUploading({ step }: PatentFileUploadingProps) {
  const label =
    step === "finalize"
      ? "Verific fișierul…"
      : step === "upload"
        ? "Se încarcă patenta…"
        : step === "compress"
          ? "Micșorez scanul…"
          : "Pregătesc încărcarea…";
  return (
    <div role="status" className="flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/60 px-3 py-2">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />
      <span className="text-sm text-foreground">{label}</span>
    </div>
  );
}

export interface PatentFileFailedProps {
  /** Motivul, spus omenește — de la server sau tradus din cod. */
  reason: string;
  /** Există o copie salvată mai devreme, care rămâne (a eșuat doar înlocuirea). */
  keptPrevious?: boolean;
  /** Urcă din nou ACELAȘI fișier, fără să-l mai caute omul pe disc. */
  onRetry?: () => void;
}

/**
 * Copia NU s-a salvat — în același loc în care ar fi stat bifa, ca să nu apară două stări care
 * se contrazic pe ecran („NU s-a salvat" undeva jos, în timp ce restul blocului arăta verde;
 * owner, 23.09.2026).
 */
export function PatentFileFailed({ reason, keptPrevious = false, onRetry }: PatentFileFailedProps) {
  return (
    <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2">
      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">
          {keptPrevious ? "Patenta nouă NU s-a salvat — rămâne copia de mai sus" : "Copia patentei NU s-a salvat"}
        </span>
        <span className="block text-xs text-muted-foreground">{reason}</span>
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
        >
          <RotateCw className="h-4 w-4" aria-hidden />
          Reîncearcă
        </button>
      )}
    </div>
  );
}

