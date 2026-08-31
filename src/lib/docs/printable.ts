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
 * Marginile foii, în milimetri — aceleași cu ale PDF-ului (`server/lib/docs/pdfDocument.ts`).
 *
 * De ce sunt repetate aici: `@page` guvernează DOAR tipărirea reală din browser, iar previzualizarea
 * e un `<iframe>` care o ignoră. Fără marginile astea, foaia de pe ecran ar arăta altfel decât
 * fișierul descărcat — adică previzualizarea ar minți exact înainte de o semnătură.
 */
export const PAGE_MARGIN_MM = { top: 18, right: 16, bottom: 20, left: 16 } as const;

/**
 * Aceleași margini, pe ecran: previzualizarea trebuie să arate exact ca PDF-ul, altfel nu e o
 * previzualizare, ci o a doua părere.
 */
export function printableWithMargins(html: string): string {
  const { top, right, bottom, left } = PAGE_MARGIN_MM;
  const style = `<style>html,body{background:#fff}body{padding:${top}mm ${right}mm ${bottom}mm ${left}mm}</style>`;
  return html.includes("</head>") ? html.replace("</head>", `${style}</head>`) : html + style;
}
