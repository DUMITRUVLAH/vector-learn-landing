/**
 * Magistrala vizualizatorului de documente PAR.
 *
 * Până acum, un click pe un document din inbox / coada de finanțe / dosar făcea `window.open`:
 * aprobatorul pierdea rândul pe care lucra, ateriza într-o filă goală cu vizualizatorul de PDF al
 * browserului și trebuia să se întoarcă manual. Documentul e PROBA pe care se ia decizia — locul
 * lui e peste listă, nu în altă filă.
 *
 * Vizualizatorul se montează o singură dată, în rădăcina aplicației (`App.tsx`), iar paginile îl
 * cheamă prin funcția de aici. Deliberat un modul cu un singur abonat (nu un context/provider):
 * paginile PAR sunt frați ai rădăcinii, nu copiii unui provider comun, iar helperul din
 * `src/lib/parFiles.ts` (cod fără React) trebuie să-l poată deschide fără să importe componente.
 *
 * Dacă NU e montat niciun vizualizator (ex. o pagină randată izolat într-un test), `open` întoarce
 * `false`, iar apelantul rămâne cu vechiul comportament — fila nouă. Vezi `openParAttachment`.
 */

export interface ParAttachmentTarget {
  parId: string;
  attachmentId: string;
  fileName: string;
  /**
   * VM5-14: ruta care servește documentul, când nu e un atașament obișnuit — de exemplu DOSARUL
   * complet al cererii (`/api/par/:id/dosar`), care e tot un PDF autorizat pe server, doar că e
   * construit din fișa aprobărilor plus toate actele, în ordinea dosarului.
   */
  url?: string;
}

type Listener = (target: ParAttachmentTarget) => void;

let listener: Listener | null = null;

/** Ruta care servește documentul inline, cu autorizarea făcută pe server. */
export function parAttachmentPreviewUrl(parId: string, attachmentId: string): string {
  return `/api/par/${parId}/attachments/${attachmentId}/preview`;
}

/** VM5-14: dosarul complet, citit în aplicație (aceeași autorizare ca la descărcare). */
export function parDosarViewerTarget(parId: string, requestNo: string | null): ParAttachmentTarget {
  return {
    parId,
    attachmentId: "dosar",
    fileName: `Dosar ${requestNo ?? ""}`.trim(),
    url: `/api/par/${parId}/dosar`,
  };
}

/** Înregistrează vizualizatorul montat. Întoarce funcția de dezabonare. */
export function registerParAttachmentViewer(fn: Listener): () => void {
  listener = fn;
  return () => {
    if (listener === fn) listener = null;
  };
}

/**
 * Deschide documentul în vizualizatorul din aplicație.
 * `false` = niciun vizualizator montat, deci apelantul trebuie să se descurce altfel.
 */
export function openParAttachmentViewer(target: ParAttachmentTarget): boolean {
  if (!listener) return false;
  listener(target);
  return true;
}
