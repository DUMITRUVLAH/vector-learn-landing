/**
 * Antetul `Content-Disposition`, construit din numele REAL al unui fișier.
 *
 * De ce există: un antet HTTP nu poate transporta decât ISO-8859-1. Codul scria numele fișierului
 * direct în antet, așa că orice document botezat românește („Confirmare plată — PAR-2026-0023.png",
 * „Act de predare-primire.pdf") arunca la runtime — `TypeError: Cannot convert argument to a
 * ByteString … value of 259` — și utilizatorul primea un sec „Serverul a răspuns cu eroarea 500"
 * exact când voia să deschidă documentul. Incident real, 10.09.2026, pe dovada unei plăți.
 *
 * Ce facem: exact ce prevede RFC 6266 + RFC 5987 — un `filename=` ASCII, pe care îl înțelege orice
 * client, plus `filename*=UTF-8''…` cu numele complet, pe care browserele moderne îl preferă. Așa
 * nimeni nu pierde diacriticele și nimeni nu primește 500.
 *
 * Bonus de securitate: numele vine de la utilizator (îl scrie la încărcare). Ghilimelele, `\` și
 * caracterele de control sunt scoase, deci un nume ca `x"; rm -rf /\r\nX-Injectat: da` nu mai poate
 * închide antetul și nu poate injecta altul.
 */

/** Diacriticele românești au un echivalent ASCII evident; „_" ar fi o pierdere inutilă. */
const ASCII_FOLD: Record<string, string> = {
  "ă": "a", "â": "a", "î": "i", "ș": "s", "ş": "s", "ț": "t", "ţ": "t",
  "Ă": "A", "Â": "A", "Î": "I", "Ș": "S", "Ş": "S", "Ț": "T", "Ţ": "T",
  "—": "-", "–": "-", "„": "", "”": "", "“": "", "’": "'",
};

/** Numele redus la ASCII tipăribil, fără caractere care pot sparge antetul. */
export function asciiFileName(fileName: string, fallback = "document"): string {
  const folded = fileName
    .replace(/[ăâîșşțţĂÂÎȘŞȚŢ—–„”“’]/g, (ch) => ASCII_FOLD[ch] ?? ch)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Ghilimele și backslash — vectorul prin care un nume poate închide antetul.
    .replace(/["\\]/g, "_")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, "_")
    // Restul non-ASCII (chirilice, emoji) nu are echivalent — devine „_".
    .replace(/[^\u0020-\u007e]/g, "_")
    .trim();
  return folded || fallback;
}

/**
 * Antetul complet. `disposition` = "inline" (se vede în pagină) sau "attachment" (se descarcă).
 */
export function contentDisposition(
  disposition: "inline" | "attachment",
  fileName: string,
  fallback = "document",
): string {
  const ascii = asciiFileName(fileName, fallback);
  // `encodeURIComponent` lasă !'()* neescapate, iar ele n-au ce căuta într-un `filename*`.
  // eslint-disable-next-line no-control-regex
  const clean = fileName.replace(/[\u0000-\u001f\u007f]/g, "");
  const encoded = encodeURIComponent(clean).replace(
    /['()!*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
