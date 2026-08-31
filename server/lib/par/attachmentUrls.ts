/**
 * Adresa prin care se deschide un atașament PAR.
 *
 * PERF (audit 2026-08-29): corpul fișierului stă în `par_attachments.file_url` ca data-URL
 * base64 (megabyți). Trimiterea lui în răspunsurile JSON făcea ca fiecare deschidere de cerere
 * să care toate fișierele — lent pe orice conexiune și peste limita de corp a funcției
 * serverless când cererea are câteva scanuri. Ruta de preview livrează fișierul cu antetele
 * potrivite, la cerere, o singură bucată.
 */
export function attachmentPreviewUrl(parId: string, attachmentId: string): string {
  return `/api/par/${parId}/attachments/${attachmentId}/preview`;
}
