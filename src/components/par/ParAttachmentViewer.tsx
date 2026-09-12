/**
 * Vizualizatorul de documente PAR — documentul se deschide PESTE listă, în aplicație.
 *
 * De ce există: decizia de aprobare se ia uitându-te la factură. `window.open` scotea aprobatorul
 * din aplicație (filă nouă, fără rândul pe care lucra, fără drum înapoi), iar pe atașamentele
 * salvate ca `data:` Chrome bloca de-a dreptul navigarea. Aici, documentul e randat pe loc din chiar
 * ruta de preview (autorizată pe server, aceeași origine): PDF în `<iframe>`, imagine în `<img>`,
 * Word și Excel prin `ParOfficePreview` (doar de citit — fișierul din stocare nu e atins).
 *
 * Sursa e URL-ul rutei, NU un `blob:` construit în pagină: un `blob:` are nevoie de `frame-src blob:`
 * în CSP, pe care un server mai vechi (sau un CDN cu headere proprii) nu-l are — și atunci
 * vizualizatorul afișa „This content is blocked". Un URL de pe propria origine trece prin
 * `default-src 'self'` oriunde. Cererea de verificare de mai jos e citită din cache de `<iframe>`.
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
import { previewKind } from "@/lib/par/officePreview";
import { ParDocxPreview, ParXlsxPreview } from "./ParOfficePreview";

type LoadState =
  | { status: "loading" }
  /** `file` = octeții deja descărcați; Word și Excel se randează din ei, fără a doua cerere. */
  | { status: "ready"; mime: string; file: Blob }
  | { status: "error"; message: string };

export function ParAttachmentViewer() {
  const [target, setTarget] = useState<ParAttachmentTarget | null>(null);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  /**
   * Word/Excel care s-a descărcat bine, dar pe care biblioteca nu l-a putut deschide (fișier
   * deteriorat, protejat cu parolă, `.docx` care e de fapt altceva). Nu e o eroare de acces —
   * documentul EXISTĂ — deci nu devine ecran de eroare, ci cade pe descărcare, cu motivul spus.
   */
  const [officeFailure, setOfficeFailure] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => registerParAttachmentViewer(setTarget), []);

  const close = useCallback(() => setTarget(null), []);

  // Identitate stabilă: `ParDocxPreview`/`ParXlsxPreview` o au în dependențele efectului de
  // randare, iar o funcție nouă la fiecare render ar re-parsa documentul la nesfârșit.
  const onOfficeFailed = useCallback((message: string) => setOfficeFailure(message), []);

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

  // Documentul e cerut o dată cu cookie-ul de sesiune (ruta de preview verifică accesul la dosar):
  // așa aflăm tipul real din `Content-Type`, iar un 403/404 devine un mesaj citibil în loc de un
  // cadru alb sau de un JSON de eroare afișat ca document. Răspunsul are `max-age=60`, deci
  // `<iframe>`/`<img>` îl iau din cache-ul browserului, fără a doua descărcare.
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    setState({ status: "loading" });
    setOfficeFailure(null);
    void (async () => {
      try {
        const res = await fetch(target.url ?? parAttachmentPreviewUrl(target.parId, target.attachmentId), {
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
        const mime = res.headers.get("content-type") ?? "";
        const file = await res.blob();
        if (cancelled) return;
        setState({ status: "ready", mime, file });
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
    };
  }, [target]);

  if (!target) return null;

  // VM5-14: ținta poate fi și DOSARUL complet (un PDF construit pe server din fișa aprobărilor +
  // toate actele), nu doar un atașament — de aceea ruta poate veni gata făcută.
  const previewUrl = target.url ?? parAttachmentPreviewUrl(target.parId, target.attachmentId);
  const kind =
    state.status === "ready" && officeFailure === null
      ? previewKind(state.mime, target.fileName)
      : "none";

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
              href={previewUrl}
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
            <iframe src={previewUrl} title={target.fileName} className="h-full w-full border-0 bg-background" />
          )}

          {state.status === "ready" && kind === "image" && (
            <div className="flex min-h-full items-center justify-center p-4">
              <img src={previewUrl} alt={target.fileName} className="max-h-full max-w-full rounded-md" />
            </div>
          )}

          {state.status === "ready" && kind === "docx" && (
            <ParDocxPreview file={state.file} fileName={target.fileName} onFailed={onOfficeFailed} />
          )}

          {state.status === "ready" && kind === "xlsx" && (
            <ParXlsxPreview file={state.file} fileName={target.fileName} onFailed={onOfficeFailed} />
          )}

          {state.status === "ready" && kind === "none" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <FileText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="max-w-md text-sm text-foreground">
                {officeFailure ??
                  "Formatele Office vechi (.doc, .xls, .ppt) și prezentările nu pot fi randate de browser. Descarcă documentul ca să-l deschizi."}
              </p>
              <a
                href={previewUrl}
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
