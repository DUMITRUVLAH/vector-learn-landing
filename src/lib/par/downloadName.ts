/**
 * Numele sub care se salvează un fișier primit de la server.
 *
 * De ce nu-l mai compune browserul: dosarul își primește numele pe SERVER (`dosarFileName` —
 * beneficiar, proiect, ordin de plată, data plății), iar clientul îl scria pe al lui,
 * `Dosar_PAR_<nr>.pdf`. Două nume pentru același fișier înseamnă că fișierul salvat de om nu
 * seamănă cu cel din Google Drive, deși e același PDF. Sursa de adevăr e antetul
 * `Content-Disposition`; numele local rămâne doar ca rezervă, dacă antetul lipsește.
 */

/** Numele din `Content-Disposition`, preferând `filename*=UTF-8''…` (cel cu diacritice). */
export function fileNameFromDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) return fallback;
  const extended = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (extended) {
    try {
      const decoded = decodeURIComponent(extended[1].trim());
      if (decoded) return decoded;
    } catch {
      /* antet stricat — cădem pe varianta ASCII */
    }
  }
  const plain = header.match(/filename\s*=\s*"([^"]+)"/i) ?? header.match(/filename\s*=\s*([^;]+)/i);
  const name = plain?.[1]?.trim();
  return name || fallback;
}

/** Salvează un blob pe disc, cu numele dat. Aceeași mecanică pentru dosar, formular și pachet. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
