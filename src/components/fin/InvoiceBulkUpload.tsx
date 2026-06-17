/**
 * INVOICE-REPORTING: InvoiceBulkUpload — upload up to 50 invoices at once
 *
 * Lives on the Invoice Reporting — Verificare page (the statement view) so the
 * accountant uploads the missing invoices right next to the transactions they
 * must match, instead of going to a separate Captures page one file at a time.
 *
 * Each file is uploaded via POST /api/fin/captures (kind="document"); the AI
 * extracts its fields and it joins the invoice pool. Uploads run with bounded
 * concurrency so 50 large files don't open 50 simultaneous requests. When the
 * batch finishes, the parent is told (onUploaded) so it can auto-match + reload.
 *
 * A11y: WCAG AA — keyboard-activable dropzone, aria-labels, ≥44px targets,
 * live region for progress. Design: Vector 365 tokens only, light + dark mode.
 */
import { useCallback, useRef, useState } from "react";
import { Upload, CheckCircle2, XCircle, Loader2, FileText, X } from "lucide-react";
import { uploadInvoiceFile, type FinDocTeam } from "@/lib/api/finCaptures";
import { cn } from "@/lib/utils";

/** Max files accepted per batch (owner requirement). */
export const MAX_INVOICE_FILES = 50;
/** Max single-file size. Vercel's serverless request-body limit is ~4.5MB; bigger files get a
 *  silent 413 from the platform (showed as "Eroare"), so we reject them up front with a message. */
const MAX_FILE_BYTES = 4_000_000;
/** How many uploads to run in parallel. Kept low: each upload runs server-side AI
 *  extraction, and too many at once can exceed Vercel's function timeout (→ 504). */
const UPLOAD_CONCURRENCY = 2;

const ACCEPT = "image/*,application/pdf,.csv,.txt,text/csv";

type ItemStatus = "queued" | "uploading" | "done" | "error";

interface UploadItem {
  id: string;
  file: File;
  status: ItemStatus;
  error?: string;
}

let idCounter = 0;
const nextId = () => `f${++idCounter}`;

function isAcceptable(file: File): boolean {
  if (file.size > MAX_FILE_BYTES) return false;
  return (
    file.type.startsWith("image/") ||
    file.type === "application/pdf" ||
    /\.(pdf|csv|txt)$/i.test(file.name) ||
    /csv|text\/plain/i.test(file.type)
  );
}

interface InvoiceBulkUploadProps {
  /** Team tag stored on every uploaded invoice (defaults to "other"). */
  team?: FinDocTeam;
  /** Called once after a batch finishes, with how many succeeded (≥1 ⇒ re-match). */
  onUploaded: (successCount: number) => void;
}

export function InvoiceBulkUpload({ team = "other", onUploaded }: InvoiceBulkUploadProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (fileList: FileList | File[]) => {
      if (busy) return;
      setLimitMsg(null);
      const incoming = Array.from(fileList);
      setItems((prev) => {
        const room = MAX_INVOICE_FILES - prev.length;
        if (room <= 0) {
          setLimitMsg(`Maxim ${MAX_INVOICE_FILES} facturi pe lot.`);
          return prev;
        }
        const accepted: UploadItem[] = [];
        let rejected = 0;
        let overflow = false;
        for (const file of incoming) {
          if (accepted.length >= room) {
            overflow = true;
            break;
          }
          if (!isAcceptable(file)) {
            rejected += 1;
            continue;
          }
          accepted.push({ id: nextId(), file, status: "queued" });
        }
        const msgs: string[] = [];
        if (rejected > 0) msgs.push(`${rejected} fișier(e) ignorate (tip neacceptat sau >4MB).`);
        if (overflow) msgs.push(`Maxim ${MAX_INVOICE_FILES} facturi pe lot — restul nu au fost adăugate.`);
        if (msgs.length) setLimitMsg(msgs.join(" "));
        return [...prev, ...accepted];
      });
    },
    [busy],
  );

  const removeItem = (id: string) => {
    if (busy) return;
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const clearDone = () => {
    if (busy) return;
    setItems((prev) => prev.filter((it) => it.status !== "done"));
    setLimitMsg(null);
  };

  const setItemStatus = (id: string, status: ItemStatus, error?: string) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status, error } : it)));

  const uploadAll = async () => {
    const queue = items.filter((it) => it.status === "queued" || it.status === "error");
    if (queue.length === 0 || busy) return;
    setBusy(true);
    setLimitMsg(null);

    let successCount = 0;
    let cursor = 0;
    const worker = async () => {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        setItemStatus(item.id, "uploading");
        try {
          await uploadInvoiceFile(item.file, team);
          setItemStatus(item.id, "done");
          successCount += 1;
        } catch (e) {
          setItemStatus(item.id, "error", e instanceof Error ? e.message : "Eroare la încărcare");
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, worker),
    );

    setBusy(false);
    if (successCount > 0) onUploaded(successCount);
  };

  const pending = items.filter((it) => it.status === "queued" || it.status === "error").length;
  const doneCount = items.filter((it) => it.status === "done").length;

  return (
    <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Adaugă facturi de verificat
        </h2>
        <span className="text-xs text-muted-foreground">
          {items.length}/{MAX_INVOICE_FILES} fișiere
        </span>
      </div>

      {/* Dropzone */}
      <div
        role="button"
        tabIndex={busy ? -1 : 0}
        aria-label={`Trage până la ${MAX_INVOICE_FILES} facturi aici sau apasă pentru a alege`}
        aria-disabled={busy}
        onClick={() => !busy && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!busy && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!busy && e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
          busy && "cursor-not-allowed opacity-50",
        )}
      >
        <Upload className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm text-foreground">
          Trage facturile aici sau click pentru a alege (până la {MAX_INVOICE_FILES})
        </span>
        <span className="text-xs text-muted-foreground">Poză, PDF sau CSV · max 4MB / fișier</span>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          disabled={busy}
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            if (inputRef.current) inputRef.current.value = "";
          }}
        />
      </div>

      {limitMsg && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400" role="alert">
          {limitMsg}
        </p>
      )}

      {/* Selected files */}
      {items.length > 0 && (
        <ul className="mt-3 max-h-60 space-y-1 overflow-y-auto" aria-label="Facturi selectate">
          {items.map((it) => (
            <li
              key={it.id}
              className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-foreground" title={it.file.name}>
                {it.file.name}
              </span>
              {it.status === "uploading" && (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-label="Se încarcă" />
              )}
              {it.status === "done" && (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" aria-label="Încărcat" />
              )}
              {it.status === "error" && (
                <span className="flex items-center gap-1 text-xs text-destructive" title={it.error}>
                  <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Eroare
                </span>
              )}
              {(it.status === "queued" || it.status === "error") && !busy && (
                <button
                  onClick={() => removeItem(it.id)}
                  aria-label={`Elimină ${it.file.name}`}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Actions */}
      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {busy
              ? "Se încarcă și se citesc facturile cu AI…"
              : doneCount > 0
                ? `${doneCount} încărcate · ${pending} în așteptare`
                : `${pending} gata de încărcat`}
          </p>
          <div className="flex gap-2">
            {doneCount > 0 && !busy && (
              <button
                onClick={clearDone}
                className="inline-flex min-h-[40px] items-center rounded-lg border border-border px-3 py-1.5 text-sm text-foreground hover:bg-muted"
              >
                Curăță încărcate
              </button>
            )}
            <button
              onClick={uploadAll}
              disabled={busy || pending === 0}
              className={cn(
                "inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-medium",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Se încarcă…
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  Încarcă {pending > 0 ? `(${pending})` : ""}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
