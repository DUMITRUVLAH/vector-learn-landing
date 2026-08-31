/**
 * DC-102 — PDF-ul actului se cere serverului, nu se mai fotografiază în browser.
 *
 * Ce era: pe Vercel nu există chromium, deci PDF-ul se făcea aici cu html2canvas + jsPDF — o
 * imagine JPEG a paginii, tăiată la fiecare 297 mm prin mijlocul rândului, fără text de căutat sau
 * copiat. Owner-ul l-a descris exact: „parcă e un fișier HTML; Word-ul e ok".
 *
 * Ce e acum: serverul scrie un PDF adevărat (text vectorial, antet, „pagina X din Y", tabele care
 * își repetă antetul) și îl păstrează pentru actele finalizate. Browserul doar descarcă fișierul —
 * deci același document ajunge și în e-mail, și în ZIP, și ca atașament la cererea de plată, nu
 * doar la cel care a apăsat butonul.
 */
import { api } from "@/lib/api";
import type { PrintableResponse } from "./printable";

export type { PrintableResponse } from "./printable";

/** HTML-ul tipăribil (previzualizarea și exportul pentru Word pleacă de aici). */
export function fetchPrintable(documentId: string): Promise<PrintableResponse> {
  return api<PrintableResponse>(`/api/docs/documents/${documentId}/print`);
}

/** Numele fișierului anunțat de server; dacă lipsește, unul rezonabil. */
function fileNameFrom(header: string | null, fallback: string): string {
  const match = header ? /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(header) : null;
  return match ? decodeURIComponent(match[1]) : fallback;
}

/**
 * Salvează pe disc PDF-ul actului. Întoarce `true` dacă fișierul a ajuns la om.
 *
 * `credentials: "include"` pentru că sesiunea e pe cookie, ca la restul aplicației.
 */
export async function downloadDocumentPdf(documentId: string): Promise<boolean> {
  const res = await fetch(`/api/docs/documents/${documentId}/pdf`, { credentials: "include" });
  if (!res.ok) throw new Error(`pdf_failed_${res.status}`);

  const blob = await res.blob();
  const name = fileNameFrom(res.headers.get("content-disposition"), `${documentId}.pdf`);
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Fără revocare, fiecare descărcare ar ține în memorie o copie a fișierului până la refresh.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
  return true;
}

/**
 * Se asigură că actul finalizat are PDF-ul scris și păstrat pe server, fără să descarce nimic.
 *
 * Rămâne apelat înainte de trimiterea pe e-mail: dacă generarea pică (fonturi lipsă, act gol),
 * vrem să aflăm ÎNAINTE de a promite contrapărții „vă transmitem atașat", nu după.
 */
export async function ensureStoredPdf(documentId: string): Promise<boolean> {
  const res = await api<{ stored: boolean; hasPdf: boolean }>(
    `/api/docs/documents/${documentId}/pdf/ensure`,
    { method: "POST" }
  );
  return res.hasPdf;
}
