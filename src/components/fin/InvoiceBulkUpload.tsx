/**
 * INVOICE-REPORTING: InvoiceBulkUpload — upload up to 50 invoices at once
 *
 * Lives on the Invoice Reporting — Verificare page (the statement view) so the
 * accountant uploads the missing invoices right next to the transactions they
 * must match, instead of going to a separate Captures page one file at a time.
 *
 * Upload flow (direct-to-storage, robust for big/real receipts):
 *   1. sign-uploads → one tiny JSON request returns a signed Supabase URL per file.
 *   2. Each file's binary is PUT DIRECTLY to Supabase Storage (not through our
 *      Vercel function) → no ~4.5MB body limit, no edge 4xx on large PDFs.
 *   3. finalize (small batches) → server downloads each object, extracts fields,
 *      creates the capture. The parent is told (onUploaded) to auto-match + reload.
 *
 * A11y: WCAG AA — keyboard-activable dropzone, aria-labels, ≥44px targets,
 * live region for progress. Design: Vector 365 tokens only, light + dark mode.
 */
import { useCallback, useRef, useState } from "react";
import { Upload, CheckCircle2, XCircle, Loader2, FileText, X, AlertTriangle } from "lucide-react";
import {
  signCaptureUploads,
  putToSignedUrl,
  finalizeCaptures,
  type FinDocTeam,
} from "@/lib/api/finCaptures";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Max files accepted per batch (owner requirement). */
export const MAX_INVOICE_FILES = 50;
/** Max single-file size. The binary goes straight to Supabase Storage (not our function), so the
 *  Vercel ~4.5MB body limit no longer applies; we still cap generously to keep AI extraction sane. */
const MAX_FILE_BYTES = 12_000_000;
/** How many uploaded objects to finalize (download + AI-extract server-side) per request. Small
 *  so each finalize request stays well under the function timeout. */
const FINALIZE_BATCH = 4;
/** Edge rate-limit (Vercel firewall): 403/429. We must NOT retry these — retrying sends more
 *  requests and deepens the per-IP block. We stop and tell the user to wait / switch network. */
function isRateLimited(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 403 || e.status === 429);
}

const ACCEPT = "image/*,application/pdf,.csv,.txt,text/csv";

// done   = uploaded + matched to a transaction (green ✓)
// nomatch = uploaded fine but NO matching transaction found (yellow "fără tranzacție")
// error  = couldn't process the document (red)
type ItemStatus = "queued" | "uploading" | "done" | "nomatch" | "error";

interface UploadItem {
  id: string;
  file: File;
  status: ItemStatus;
  error?: string;
  captureId?: string;
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
  /**
   * Called after a batch finishes, with the capture ids that uploaded OK. The parent runs the
   * auto-match and returns the subset that actually matched a transaction — so we can mark each
   * file green ("potrivit") vs yellow ("fără tranzacție").
   */
  onUploaded: (uploadedCaptureIds: string[]) => Promise<string[]>;
}

export function InvoiceBulkUpload({ team = "other", onUploaded }: InvoiceBulkUploadProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [limitMsg, setLimitMsg] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
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
        if (rejected > 0) msgs.push(`${rejected} fișier(e) ignorate (tip neacceptat sau >12MB).`);
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
    // "Processed" = matched (done) or uploaded-without-match (nomatch); both can be cleared.
    setItems((prev) => prev.filter((it) => it.status !== "done" && it.status !== "nomatch"));
    setLimitMsg(null);
  };

  const setItemStatus = (id: string, status: ItemStatus, error?: string) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status, error } : it)));

  // Chunk a list into groups of `size`.
  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  const uploadAll = async () => {
    const queue = items.filter((it) => it.status === "queued" || it.status === "error");
    if (queue.length === 0 || busy) return;
    setBusy(true);
    setLimitMsg(null);
    setRateLimited(false);

    const uploadedIds: string[] = [];
    let hitRateLimit = false;
    try {
      queue.forEach((it) => setItemStatus(it.id, "uploading"));

      // 1) One tiny JSON request → a signed Supabase URL per file.
      const signed = await signCaptureUploads(queue.map((it) => ({ fileName: it.file.name })));

      // 2) Upload each binary DIRECTLY to Supabase Storage (NOT through our function → no body
      //    limit, no edge 4xx on large files). A storage failure marks just that file.
      const uploaded: Array<{ item: UploadItem; path: string }> = [];
      await Promise.all(
        queue.map(async (it, i) => {
          const s = signed[i];
          try {
            await putToSignedUrl(s.signedUrl, it.file);
            uploaded.push({ item: it, path: s.path });
          } catch (e) {
            setItemStatus(it.id, "error", e instanceof ApiError ? `storage_${e.status}` : "Eroare");
          }
        }),
      );

      // 3) Finalize in small batches: the server downloads each object and extracts its fields.
      //    A file that processes OK is marked "done" for now; after matching we reclassify it
      //    green ("potrivit") or yellow ("fără tranzacție").
      for (const group of chunk(uploaded, FINALIZE_BATCH)) {
        if (hitRateLimit) break;
        try {
          const { results } = await finalizeCaptures(
            group.map((g) => ({ path: g.path, fileName: g.item.file.name, mimeType: g.item.file.type })),
            team,
          );
          group.forEach((g, i) => {
            const r = results[i];
            if (r && r.ok) {
              const capId = r.capture.id;
              setItems((prev) => prev.map((it) => (it.id === g.item.id ? { ...it, status: "done", captureId: capId } : it)));
              uploadedIds.push(capId);
            } else {
              // Real processing failure → red, with a human reason.
              setItemStatus(g.item.id, "error", r && !r.ok ? "Nu s-a putut citi documentul" : "Eroare");
            }
          });
        } catch (e) {
          if (isRateLimited(e)) {
            hitRateLimit = true;
            group.forEach((g) => setItemStatus(g.item.id, "queued"));
            break;
          }
          group.forEach((g) => setItemStatus(g.item.id, "error", e instanceof ApiError ? `http_${e.status}` : "Eroare"));
        }
      }
    } catch (e) {
      // sign-uploads itself failed (e.g. rate-limited or storage off) → flag, keep files queued.
      if (isRateLimited(e)) {
        hitRateLimit = true;
        queue.forEach((it) => setItemStatus(it.id, "queued"));
      } else {
        queue.forEach((it) =>
          it.status === "uploading"
            ? setItemStatus(it.id, "error", e instanceof ApiError ? `http_${e.status}` : "Eroare")
            : null,
        );
      }
    }

    setBusy(false);
    setRateLimited(hitRateLimit);

    // 4) Auto-match, then color each uploaded file: matched a transaction → green; otherwise yellow
    //    "fără tranzacție" (uploaded fine, just no matching payment in this statement).
    if (uploadedIds.length > 0) {
      let matched: string[] = [];
      try {
        matched = await onUploaded(uploadedIds);
      } catch {
        matched = [];
      }
      const matchedSet = new Set(matched);
      setItems((prev) =>
        prev.map((it) =>
          it.captureId && uploadedIds.includes(it.captureId)
            ? { ...it, status: matchedSet.has(it.captureId) ? "done" : "nomatch" }
            : it,
        ),
      );
    }
  };

  const pending = items.filter((it) => it.status === "queued" || it.status === "error").length;
  const doneCount = items.filter((it) => it.status === "done" || it.status === "nomatch").length;

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
        <span className="text-xs text-muted-foreground">Poză, PDF sau CSV · max 12MB / fișier</span>
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

      {rateLimited && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300" role="alert">
          <p className="font-medium">Conexiunea a fost limitată temporar de server.</p>
          <p className="mt-1 text-xs">
            Prea multe încărcări într-un timp scurt. Așteaptă 2–3 minute (sau schimbă rețeaua —
            de ex. hotspot de pe telefon) și apasă din nou „Încarcă”. Fișierele rămase sunt
            păstrate în listă.
          </p>
        </div>
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
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400" title="Potrivit cu o tranzacție">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Potrivit
                </span>
              )}
              {it.status === "nomatch" && (
                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400" title="Încărcat, dar nu am găsit o tranzacție potrivită în acest extras">
                  <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Fără tranzacție
                </span>
              )}
              {it.status === "error" && (
                <span className="flex items-center gap-1 text-xs text-destructive" title={it.error ?? "Nu s-a putut procesa"}>
                  <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Nu s-a procesat
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
