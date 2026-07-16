/**
 * VM3-02: WinAnsi-safe text for pdf-lib STANDARD fonts (Helvetica etc.).
 *
 * pdf-lib's standard fonts use WinAnsi (cp1252) encoding, which has NO ă/Ă, ș/Ș, ț/Ț
 * (nor the legacy cedilla forms ş/ţ) — `drawText` THROWS `WinAnsi cannot encode "ț"`,
 * turning the whole PDF response into a 500. This bit the dosar separator pages
 * ("Factură", "Ordin de plată", "Act de recepție") — see the regression test in
 * server/__tests__/par-finance-queue.routes.test.ts.
 *
 * â/î/Â/Î ARE in cp1252 and pass through unchanged. Anything else outside cp1252 is
 * replaced with "?" as a last resort — this function must NEVER let drawText throw.
 */

const RO_TRANSLIT: Record<string, string> = {
  "ă": "a", // ă
  "Ă": "A", // Ă
  "ș": "s", // ș (comma below)
  "Ș": "S", // Ș
  "ț": "t", // ț (comma below)
  "Ț": "T", // Ț
  "ş": "s", // ş (legacy cedilla)
  "Ş": "S", // Ş
  "ţ": "t", // ţ (legacy cedilla)
  "Ţ": "T", // Ţ
};

// cp1252 printable set: ASCII + Latin-1 supplement + the 27 extra chars in 0x80–0x9F.
const CP1252_EXTRAS = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";

export function winAnsiSafe(text: string): string {
  let out = "";
  for (const ch of text) {
    if (ch === "\n" || ch === "\t") {
      out += " ";
      continue;
    }
    const mapped = RO_TRANSLIT[ch];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || CP1252_EXTRAS.includes(ch)) {
      out += ch;
    } else {
      out += "?";
    }
  }
  return out;
}
