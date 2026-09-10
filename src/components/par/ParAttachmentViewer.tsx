/**
 * Vizualizatorul de documente PAR — documentul se deschide PESTE listă, în aplicație.
 *
 * De ce există: decizia de aprobare se ia uitându-te la factură. `window.open` scotea aprobatorul
 * din aplicație (filă nouă, fără rândul pe care lucra, fără drum înapoi), iar pe atașamentele
 * salvate ca `data:` Chrome bloca de-a dreptul navigarea. Aici, documentul e adus autentificat de
 * la ruta de preview, transformat în blob și randat pe loc: PDF în `<iframe>`, imagine în `<img>`.
 *
 * Se montează O SINGURĂ dată, în `App.tsx`; paginile îl cheamă prin `openParAttachmentViewer`
 * (vezi `src/lib/par/attachmentViewerBus.ts`) sau prin `openParAttachment` din `src/lib/parFiles.ts`.
 *
 * Panoul are `role="dialog"`, deci scurtăturile de tastatură ale inbox-ului (j/k/a/m/r/x) se
 * auto-dezactivează cât timp e deschis — ele ignoră orice apăsare când există un dialog.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Download, ExternalLink, FileText, Loader2, X } from "lucide-react";
import { Button } from "@/components/ds";
import {
  parAttachmentPreviewUrl,
  registerParAttachmentViewer,
  type ParAttachmentTarget,
} from "@/lib/par/attachmentViewerBus";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; url: string; mime: string }
  | { status: "error"; message: string };

/** Ce poate randa browserul singur; restul (docx, xlsx) primesc butonul de descărcare. */
function renderKind(mime: string, fileName: string): "pdf" | "image" | "none" {
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  if (mime.includes("pdf") || ext === "pdf") return "pdf";
  if (mime.startsWith("image/") || ["png", "jpg", "jpeg", "webp", "gif", "avif"].includes(ext)) return "image";
  return "none";
}

export function ParAttachmentViewer() {
  const [target, setTarget] = useState<ParAttachmentTarget | null>(null);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => registerParAttachmentViewer(setTarget), []);

  const close = useCallback(() => setTarget(null), []);

  // Escape închide, iar fundalul nu mai derulează pe sub document.
  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [target, close]);

  // Documentul e adus cu cookie-ul de sesiune (ruta de preview verifică accesul la dosar) și ținut
  // ca blob: așa aflăm tipul real din `Content-Type`, iar un 403/404 devine un mesaj citibil în loc
  // de un `<iframe>` alb pe care nimeni nu-l poate interpreta.
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    setState({ status: "loading" });
    void (async () => {
      try {
        const res = await fetch(parAttachmentPreviewUrl(target.parId, target.attachmentId), {
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(
            res.status === 404
              ? "Documentul nu mai există sau nu ai acces la acest dosar."
              : res.status === 422
                ? "Fișierul nu poate fi previzualizat (format nerecunoscut)."
                : `Serverul a răspuns cu eroarea ${res.status}.`,
          );
        }
        const blob = await res.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setState({ status: "ready", url: objectUrl, mime: blob.type });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Documentul nu a putut fi încărcat.",
        });
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [target]);

  if (!target) return null;

  const previewUrl = parAttachmentPreviewUrl(target.parId, target.attachmentId);
  const kind = state.status === "ready" ? renderKind(state.mime, target.fileName) : "none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6">
      <button
        type="button"
        aria-label="Închide documentul"
        onClick={close}
        className="absolute inset-0 animate-fade-in bg-foreground/60"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Document: ${target.fileName}`}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-background shadow-lg outline-none animate-fade-in"
      >
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" title={target.fileName}>
            {target.fileName}
          </h2>
          {state.status === "ready" && (
            <a
              href={state.url}
              download={target.fileName}
              className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/10 max-sm:h-11"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="max-sm:sr-only">Descarcă</span>
            </a>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span className="max-sm:sr-only">Filă nouă</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={close} aria-label="Închide documentul">
            <X className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>

        <div className="flex-1 overflow-auto bg-muted/40">
          {state.status === "loading" && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Se încarcă documentul…
            </div>
          )}

          {state.status === "error" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
              <p className="max-w-md text-sm text-foreground">{state.message}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(previewUrl, "_blank", "noopener,noreferrer")}
              >
                Încearcă în filă nouă
              </Button>
            </div>
          )}

          {state.status === "ready" && kind === "pdf" && (
            <iframe src={state.url} title={target.fileName} className="h-full w-full border-0 bg-background" />
          )}

          {state.status === "ready" && kind === "image" && (
            <div className="flex min-h-full items-center justify-center p-4">
              <img src={state.url} alt={target.fileName} className="max-h-full max-w-full rounded-md" />
            </div>
          )}

          {state.status === "ready" && kind === "none" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="max-w-md text-sm text-foreground">
                Formatul acesta (Word, Excel) nu poate fi randat de browser. Descarcă-l ca să-l deschizi.
              </p>
              <a
                href={state.url}
                download={target.fileName}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 max-sm:h-11"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Descarcă {target.fileName}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
