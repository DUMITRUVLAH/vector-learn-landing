/**
 * VM4-05 — „Confirmarea plății", sus pe fișa cererii plătite.
 *
 * Owner, după prima zi de lucru pe ecranul de dovezi: „dacă intri la PAR de acolo, trebuie sus să
 * fie dovada… să poți adăuga fișier, captură de ecran… acest «choose file» parcă e old school, și
 * după ce e adăugat să poți vedea direct documentul confirmativ".
 *
 * Ce rezolvă:
 *   • locul — cine intră din „Dovezi de plată" caută UN singur lucru; el stă acum în capul paginii,
 *     nu la coada secțiunii 13, sub toate celelalte documente;
 *   • gestul — zonă de tragere + buton propriu + Ctrl+V pentru captura de ecran, în locul
 *     `<input type="file">` nestilizat al browserului;
 *   • verificarea — documentul se vede pe loc (PDF în cadru, imaginea ca imagine), nu doar ca nume
 *     de fișier pe care trebuie să-l deschizi ca să știi ce ai atașat.
 *
 * Fișierul rămâne un atașament obișnuit de tip `payment_order`: intră în dosarul cererii și în
 * secțiunea 13, iar cererea dispare din coada „Dovezi de plată". Nu există un al doilea depozit.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, FileText, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ds";
import { deleteAttachment, uploadAttachment, type ParAttachment } from "@/lib/api/par";
import { parAttachmentPreviewUrl } from "@/lib/par/attachmentViewerBus";
import { viewParAttachment } from "@/lib/parFiles";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL, attachmentTooLargeMessage } from "@/lib/par/attachmentLimits";
import { cn } from "@/lib/utils";

export interface ParPaymentProofCardProps {
  parId: string;
  requestNo: string;
  /** Toate atașamentele cererii; dovezile se aleg de aici (kind = payment_order). */
  attachments: ParAttachment[];
  /** Finanțe / par_admin: doar ei încarcă și șterg dovada. */
  canUpload: boolean;
  /** Cine a încărcat — ca să nu arătăm butonul de ștergere altcuiva (serverul o refuză oricum). */
  currentUserId: string | null;
  onChanged: () => void;
}

/** Tipul real e în prefixul data-URL-ului („data:application/pdf;base64,…"); lista nu îl trimite separat. */
function mimeOf(fileUrl: string | null | undefined): string {
  return fileUrl?.match(/^data:([^;]+)[;,]/)?.[1] ?? "";
}

/** Ce poate randa browserul pe loc; restul primesc butonul de deschidere. */
function previewKind(fileName: string, mime?: string | null): "pdf" | "image" | "none" {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (mime?.includes("pdf") || ext === "pdf") return "pdf";
  if (mime?.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "avif"].includes(ext)) return "image";
  return "none";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function ParPaymentProofCard({
  parId,
  requestNo,
  attachments,
  canUpload,
  currentUserId,
  onChanged,
}: ParPaymentProofCardProps) {
  const proofs = attachments.filter((a) => a.kind === "payment_order");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [justAdded, setJustAdded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = useCallback(
    async (file: File) => {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(attachmentTooLargeMessage(file.name));
        return;
      }
      setUploading(true);
      setError(null);
      try {
        const dataUrl = await fileToDataUrl(file);
        await uploadAttachment(parId, {
          file_name: `Confirmare plată — ${requestNo} (${file.name})`,
          file_url: dataUrl,
          mime: file.type || "application/pdf",
          kind: "payment_order",
        });
        setJustAdded(true);
        onChanged();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Documentul nu a putut fi atașat.");
      } finally {
        setUploading(false);
      }
    },
    [parId, requestNo, onChanged]
  );

  // Captura de ecran din bancă trăiește în clipboard, nu pe disc: Ctrl+V o atașează direct.
  useEffect(() => {
    if (!canUpload) return;
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (!file) return;
      e.preventDefault();
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
      void upload(new File([file], `captura-ordin-plata-${stamp}.png`, { type: file.type || "image/png" }));
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [canUpload, upload]);

  const remove = async (att: ParAttachment) => {
    if (!confirm(`Ștergi confirmarea de plată „${att.fileName}" din dosar?`)) return;
    setError(null);
    try {
      await deleteAttachment(parId, att.id);
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Documentul nu a putut fi șters.");
    }
  };

  // Nimeni nu are ce face aici: fără dovadă și fără drept de încărcare, cardul ar fi o cutie goală.
  if (proofs.length === 0 && !canUpload) return null;

  return (
    <section
      aria-labelledby="payment-proof-title"
      className="rounded-lg border border-border bg-card p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="payment-proof-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <FileText className="h-4 w-4 text-muted-foreground" aria-hidden />
          Confirmarea plății
        </h2>
        {proofs.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
            <CheckCircle2 className="h-4 w-4" aria-hidden />
            La dosar
          </span>
        ) : (
          <span className="text-xs font-medium text-warning">Lipsește din dosar</span>
        )}
      </div>

      {error && (
        <p role="alert" className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}

      {/* Documentul, vizibil pe loc — nu doar numele lui. */}
      {proofs.map((att) => {
        const kind = previewKind(att.fileName, mimeOf(att.fileUrl));
        const url = parAttachmentPreviewUrl(parId, att.id);
        return (
          <div key={att.id} className="space-y-2 rounded-md border border-border p-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => viewParAttachment(parId, att.id, att.fileName)}
                className="max-w-full flex-1 truncate text-left text-sm text-primary hover:underline"
                aria-label={`Deschide ${att.fileName} pe tot ecranul`}
              >
                {att.fileName}
              </button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => viewParAttachment(parId, att.id, att.fileName)}
                aria-label={`Deschide ${att.fileName} pe tot ecranul`}
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                Mărește
              </Button>
              {canUpload && att.uploadedBy === currentUserId && (
                <button
                  type="button"
                  onClick={() => void remove(att)}
                  aria-label={`Șterge ${att.fileName} din dosar`}
                  className="rounded p-2 text-muted-foreground hover:bg-accent hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>

            {kind === "pdf" && (
              <iframe
                src={url}
                title={`Previzualizare ${att.fileName}`}
                className="h-[320px] w-full rounded border border-border bg-muted"
              />
            )}
            {kind === "image" && (
              <button
                type="button"
                onClick={() => viewParAttachment(parId, att.id, att.fileName)}
                className="block w-full"
                aria-label={`Mărește ${att.fileName}`}
              >
                <img
                  src={url}
                  alt={`Confirmarea plății pentru ${requestNo}`}
                  className="max-h-[320px] w-full rounded border border-border object-contain"
                />
              </button>
            )}
            {kind === "none" && (
              <p className="text-xs text-muted-foreground">
                Formatul nu se poate previzualiza în pagină — deschide-l cu „Mărește".
              </p>
            )}
          </div>
        );
      })}

      {canUpload && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void upload(file);
          }}
          className={cn(
            "rounded-md border-2 border-dashed p-4 text-center transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-border"
          )}
        >
          <UploadCloud className="mx-auto h-6 w-6 text-muted-foreground" aria-hidden />
          <p className="mt-2 text-sm text-foreground">
            {proofs.length > 0 ? "Adaugă încă o confirmare" : "Adaugă confirmarea plății"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Trage aici ordinul de plată sau extrasul, apasă butonul, ori lipește o captură de ecran
            cu <kbd className="rounded border border-border px-1">Ctrl</kbd>+
            <kbd className="rounded border border-border px-1">V</kbd>. PDF sau imagine, max{" "}
            {MAX_ATTACHMENT_LABEL}.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <UploadCloud className="h-4 w-4" aria-hidden />}
            {uploading ? "Se atașează…" : "Alege fișierul"}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/*"
            className="sr-only"
            aria-label="Alege confirmarea plății"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
          {justAdded && !uploading && (
            <p role="status" className="mt-2 text-xs text-success">
              Adăugat la dosarul cererii (secțiunea 13, „Ordin de plată").
            </p>
          )}
        </div>
      )}
    </section>
  );
}
