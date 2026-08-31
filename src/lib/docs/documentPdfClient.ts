/**
 * Fix prod — PDF-ul actului se face ÎN BROWSER.
 *
 * Ce s-a întâmplat: pe Vercel nu rulează chromium, deci randarea pe server întorcea mereu HTML,
 * iar „Descarcă PDF" deschidea o pagină web în loc să salveze un fișier. Aceeași problemă a fost
 * rezolvată deja în aplicație pentru formularul PAR (src/lib/parPdf.ts): randăm HTML-ul cu
 * html2canvas și îl împachetăm cu jsPDF. Ambele sunt deja dependențe.
 *
 * Bonus important: după ce browserul a produs PDF-ul unui act finalizat, îl trimitem serverului să-l
 * păstreze — ca atașamentul la cererea de plată și ZIP-ul să existe și pe producție.
 */
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { api } from "@/lib/api";
import { A4_WIDTH_PX, PAGE_MARGIN_MM, PX_PER_MM, type PrintableResponse } from "./printable";

export type { PrintableResponse };

/** HTML-ul tipăribil al actului — sursa unică pentru previzualizare, PDF și e-mail. */
export function fetchPrintable(documentId: string): Promise<PrintableResponse> {
  return api<PrintableResponse>(`/api/docs/documents/${documentId}/print`);
}

/** Randează HTML-ul într-un PDF A4, cu paginare pe înălțime. */
async function htmlToPdf(html: string): Promise<jsPDF> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.width = `${A4_WIDTH_PX}px`; // A4 la 96dpi — altfel textul se rupe altfel decât la tipar
  // Marginile se pun pe GAZDĂ, nu prin CSS pe `body`: HTML-ul e injectat cu innerHTML, deci un
  // selector `body` din el ar nimeri corpul aplicației, nu foaia pe care o fotografiem.
  host.style.boxSizing = "border-box";
  host.style.padding = `${PAGE_MARGIN_MM.top * PX_PER_MM}px ${PAGE_MARGIN_MM.right * PX_PER_MM}px ${PAGE_MARGIN_MM.bottom * PX_PER_MM}px ${PAGE_MARGIN_MM.left * PX_PER_MM}px`;
  host.style.background = "#ffffff";
  host.innerHTML = html;
  document.body.appendChild(host);

  try {
    if (document.fonts?.ready) await document.fonts.ready;
    const canvas = await html2canvas(host, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    const imgH = (canvas.height * pageW) / canvas.width;
    const jpeg = canvas.toDataURL("image/jpeg", 0.92);

    if (imgH <= 297) {
      pdf.addImage(jpeg, "JPEG", 0, 0, pageW, imgH);
    } else {
      let remaining = imgH;
      let offset = 0;
      while (remaining > 0) {
        pdf.addImage(jpeg, "JPEG", 0, -offset, pageW, imgH);
        remaining -= 297;
        offset += 297;
        if (remaining > 0) pdf.addPage();
      }
    }
    return pdf;
  } finally {
    document.body.removeChild(host);
  }
}

/**
 * Se asigură că actul are PDF stocat pe server — fără să descarce nimic pe disc.
 *
 * De ce: trimiterea pe e-mail atașează PDF-ul stocat, iar pe producție el se naște doar în browser.
 * Fără pasul ăsta, e-mailul pleca scriind „vă transmitem atașat" și fără act — exact ce a pățit
 * owner-ul. Acum, înainte de trimitere, browserul randează și încarcă documentul.
 */
export async function ensureStoredPdf(documentId: string): Promise<boolean> {
  const printable = await fetchPrintable(documentId);
  if (printable.hasStoredPdf) return true;
  if (printable.status === "draft") return false;

  const pdf = await htmlToPdf(printable.html);
  const base64 = pdf.output("datauristring").split(",")[1] ?? "";
  const res = await api<{ stored: boolean }>(`/api/docs/documents/${documentId}/pdf`, {
    method: "PUT",
    body: JSON.stringify({ base64 }),
  });
  return res.stored;
}

/**
 * Descarcă actul ca PDF. Întoarce `true` dacă fișierul a fost salvat.
 * Actele finalizate își trimit PDF-ul înapoi la server, o singură dată.
 */
export async function downloadDocumentPdf(documentId: string): Promise<boolean> {
  const printable = await fetchPrintable(documentId);
  const pdf = await htmlToPdf(printable.html);
  pdf.save(printable.fileName);

  if (printable.status !== "draft" && !printable.hasStoredPdf) {
    try {
      const base64 = pdf.output("datauristring").split(",")[1] ?? "";
      await api(`/api/docs/documents/${documentId}/pdf`, {
        method: "PUT",
        body: JSON.stringify({ base64 }),
      });
    } catch {
      // Stocarea e un bonus (atașament la PAR, ZIP): dacă pică, omul are deja fișierul în mână.
    }
  }
  return true;
}
