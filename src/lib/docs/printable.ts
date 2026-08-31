/**
 * Foaia actului, partea fără dependențe: marginile paginii și HTML-ul gata de arătat.
 *
 * Trăiește separat de `documentPdfClient` pentru că previzualizarea are nevoie doar de string-uri,
 * iar `documentPdfClient` trage după el jsPDF + html2canvas. Un dialog care deschide o foaie nu
 * are de ce să încarce un motor de PDF.
 */

export interface PrintableResponse {
  html: string;
  fileName: string;
  hasStoredPdf: boolean;
  status: string;
}

/**
 * Marginile foii, în milimetri — aceleași cu `@page` din stilurile actului
 * (server/lib/docs/documentPdf.ts).
 *
 * De ce sunt repetate aici: `@page` guvernează DOAR tipărirea reală din browser. html2canvas
 * (care face PDF-ul) și iframe-ul de previzualizare o ignoră complet, deci fără marginile astea
 * textul iese lipit de marginea foii — se vede de la distanță că nu e un act, ci o pagină web.
 */
export const PAGE_MARGIN_MM = { top: 18, right: 16, bottom: 20, left: 16 } as const;

/** A4 la 96dpi: 210mm = 794px. Constanta leagă milimetrii de pixelii pe care îi vede html2canvas. */
export const A4_WIDTH_PX = 794;
export const PX_PER_MM = A4_WIDTH_PX / 210;

/**
 * Aceleași margini, pe ecran: previzualizarea trebuie să arate exact ca PDF-ul, altfel nu e o
 * previzualizare, ci o a doua părere.
 */
export function printableWithMargins(html: string): string {
  const { top, right, bottom, left } = PAGE_MARGIN_MM;
  const style = `<style>html,body{background:#fff}body{padding:${top}mm ${right}mm ${bottom}mm ${left}mm}</style>`;
  return html.includes("</head>") ? html.replace("</head>", `${style}</head>`) : html + style;
}
