/**
 * Previzualizarea actului — foaia, înainte de „Descarcă".
 *
 * De ce există: până acum singurul mod de a vedea actul era să-l descarci. Omul deschidea PDF-ul,
 * găsea un rând greșit, se întorcea, corecta, descărca din nou — trei fișiere pe disc pentru o
 * literă. Previzualizarea închide bucla pe ecran.
 *
 * Se randează în `<iframe srcDoc>`, nu într-un `<div>`: HTML-ul tipăribil e un document complet, cu
 * `<style>` care stilizează `body`, `h1`, `table`. Injectat în pagină, ar repicta aplicația din
 * jur. Iframe-ul îl ține în lumea lui, `sandbox=""` îi taie orice script, iar rezultatul e exact
 * ce vede și html2canvas când face PDF-ul.
 */
import { Loader2, Download } from "lucide-react";
import { Dialog } from "@/components/ds/Overlay";
import { printableWithMargins } from "@/lib/docs/printable";

export interface DocPreviewDialogProps {
  open: boolean;
  /** HTML-ul tipăribil venit de la server; `null` cât timp se încarcă. */
  html: string | null;
  loading: boolean;
  downloading: boolean;
  onDownloadPdf: () => void;
  onClose: () => void;
}

export function DocPreviewDialog({
  open,
  html,
  loading,
  downloading,
  onDownloadPdf,
  onClose,
}: DocPreviewDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="xl"
      title="Previzualizarea actului"
      description="Exact ce iese la tipar și în PDF. Ciorna se salvează întâi, deci vezi ultima variantă."
      footer={
        <>
          {/*
            Numele accesibil e mai lung decât eticheta vizibilă intenționat: dialogul are deja un
            „X" și un scrim, ambele numite „Închide". Trei butoane cu același nume sună identic la
            cititorul de ecran și sunt ambigue și pentru un test automat.
          */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Închide previzualizarea"
            className="touch-target inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground hover:bg-muted"
          >
            Închide
          </button>
          <button
            type="button"
            disabled={downloading || loading || !html}
            onClick={onDownloadPdf}
            className="touch-target inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4" aria-hidden="true" />
            )}
            Descarcă PDF
          </button>
        </>
      }
    >
      {loading || !html ? (
        <div className="flex h-[64vh] items-center justify-center gap-2 rounded-lg border border-border text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Pregătesc foaia…
        </div>
      ) : (
        // Hârtia rămâne albă și pe temă întunecată: actul se tipărește, nu se citește ca UI.
        <div className="h-[64vh] overflow-hidden rounded-lg border border-border bg-white">
          <iframe
            title="Previzualizarea actului"
            srcDoc={printableWithMargins(html)}
            sandbox=""
            className="h-full w-full border-0"
          />
        </div>
      )}
    </Dialog>
  );
}
