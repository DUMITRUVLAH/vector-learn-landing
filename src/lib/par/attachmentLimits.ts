/**
 * Plafonul pe un atașament PAR — o singură cifră, împărțită de interfață și de server
 * (`server/routes/parAttachments.ts` o importă de aici, ca cele două să nu poată diverge).
 *
 * Istoric, ca să nu se coboare din nou din reflex: fișierele plecau ca data-URL base64 într-un corp
 * JSON, base64 umflă cu ~33%, iar funcția serverless de pe Vercel refuză corpurile peste ~4,5 MB.
 * Orice fișier peste ~3,3 MB pica cu un 413 fără explicație, deși interfața promitea 10 MB, așa că
 * plafonul fusese coborât la 3 MB — o oprire onestă, nu o soluție (auditul PERF din 29.08.2026).
 *
 * Din 13.09.2026 binarul nu mai trece prin funcția noastră: browserul îl urcă direct în Supabase
 * Storage printr-un URL semnat, iar prin server trec doar două cereri JSON mici (`/attachments/sign`
 * și `/attachments/finalize`). Limita de platformă nu a crescut — a dispărut. Cifra de mai jos e
 * acum o decizie de produs (cât e rezonabil pentru un contract scanat), nu un ocol în jurul unei
 * limite tehnice.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_ATTACHMENT_LABEL = "10 MB";

export function attachmentTooLargeMessage(fileName: string): string {
  return `${fileName}: depășește ${MAX_ATTACHMENT_LABEL}. Comprimă fișierul sau împarte-l.`;
}
