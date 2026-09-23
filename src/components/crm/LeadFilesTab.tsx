/**
 * CRM Faza 9 — fila „Fișiere" din fișa leadului.
 *
 * Portare din crm-vector (FilesTab + `lib/crm/files.ts`). Oferta primită, caietul de sarcini,
 * poza de la fața locului — până acum nu aveau unde sta, așa că ajungeau pe email, unde nimeni
 * nu le mai găsea.
 *
 * Încărcarea are DOUĂ etape cu durate foarte diferite (fișierul urcă în Storage, apoi serverul
 * îi verifică octeții). Un buton care tace pe tot parcursul arată identic cu o aplicație blocată
 * — de-aici starea vizibilă „Se încarcă…" / „Se verifică…", ca la dosarele PAR.
 */
import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, Trash2, FileText, ExternalLink } from "lucide-react";
import { Button } from "@/components/ds";
import {
  listCrmLeadFiles,
  uploadCrmLeadFile,
  deleteCrmLeadFile,
  type CrmLeadFile,
} from "@/lib/api/crm";

export interface LeadFilesTabProps {
  leadId: string;
  onToast: (toast: { kind: "success" | "error"; message: string }) => void;
}

/** 15 MB — aceeași limită ca pe server (`MAX_LEAD_FILE_BYTES`). */
const MAX_BYTES = 15 * 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function LeadFilesTab({ leadId, onToast }: LeadFilesTabProps) {
  const [files, setFiles] = useState<CrmLeadFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"idle" | "compress" | "upload" | "finalize">("idle");
  const [busyId, setBusyId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listCrmLeadFiles(leadId)
      .then((res) => {
        if (!cancelled) setFiles(res.items);
      })
      .catch(() => {
        if (!cancelled) setFiles([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leadId]);

  async function handleFile(file: File) {
    if (file.size > MAX_BYTES) {
      onToast({ kind: "error", message: `Fișierul depășește ${Math.round(MAX_BYTES / 1024 / 1024)} MB.` });
      return;
    }
    setStep("upload");
    try {
      const created = await uploadCrmLeadFile(leadId, file, { onStep: setStep });
      setFiles((prev) => [created, ...prev]);
      onToast({ kind: "success", message: `„${created.fileName}” a fost atașat.` });
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut încărca fișierul." });
    } finally {
      setStep("idle");
      // Curățăm input-ul, altfel același fișier ales a doua oară nu mai declanșează `change`.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function removeFile(file: CrmLeadFile) {
    if (!confirm(`Ștergi fișierul „${file.fileName}”?`)) return;
    setBusyId(file.id);
    try {
      await deleteCrmLeadFile(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
    } catch (err) {
      onToast({ kind: "error", message: err instanceof Error ? err.message : "Nu am putut șterge fișierul." });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          id="crm-lead-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button onClick={() => inputRef.current?.click()} disabled={step !== "idle"}>
          {step === "idle" ? (
            <Upload className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          )}
          {step === "compress" ? "Se pregătește…" : step === "upload" ? "Se încarcă…" : step === "finalize" ? "Se verifică…" : "Încarcă fișier"}
        </Button>
        <span className="text-xs text-muted-foreground">PDF, imagini, Office, CSV, ZIP · max 15 MB</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8" role="status">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Se încarcă fișierele..." />
        </div>
      ) : files.length === 0 ? (
        <p className="text-sm text-muted-foreground">Niciun fișier atașat încă.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-2 rounded-lg border border-border p-2.5">
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                {/* Deschiderea trece prin ruta de preview a serverului — calea din Storage nu
                    ajunge niciodată în browser. `rel=noreferrer` fiindcă e o filă nouă. */}
                <a
                  href={file.previewUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
                >
                  <span className="truncate">{file.fileName}</span>
                  <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                </a>
                <p className="text-xs text-muted-foreground">
                  {formatSize(file.sizeBytes)} ·{" "}
                  {new Date(file.createdAt).toLocaleDateString("ro-MD", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Șterge fișierul ${file.fileName}`}
                onClick={() => void removeFile(file)}
                disabled={busyId === file.id}
              >
                {busyId === file.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
