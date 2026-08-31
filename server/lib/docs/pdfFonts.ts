/**
 * DC-102 — fonturile actului.
 *
 * Times New Roman e proprietar și nu poate fi livrat cu aplicația, dar Word-ul organizației îl
 * folosește. Tinos (Apache-2.0, Google Fonts) e metric-compatibil cu el: aceleași lățimi, deci
 * PDF-ul și fișierul Word rup rândurile în același loc și arată ca același document.
 *
 * Fonturile standard din PDF (Times-Roman) NU sunt o alternativă: folosesc WinAnsi, care nu are
 * `ă`, `î`, `ș`, `ț`. Un act în română scris cu ele iese ciuruit de semne lipsă.
 *
 * Căile se caută în mai multe locuri pentru că pachetul de producție e un singur fișier construit
 * cu esbuild: fonturile stau lângă el, copiate de `scripts/vercel-build.mjs`, nu în `server/`.
 */
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type FontStyle = "Regular" | "Bold" | "Italic" | "BoldItalic";

/** Numele familiei, așa cum îl cere pdfmake în `defaultStyle.font`. */
export const DOC_FONT_FAMILY = "Tinos";

function candidateDirs(): string[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    join(here, "assets", "fonts"), // pachetul serverless: fonturile lângă index.mjs
    join(here, "..", "..", "assets", "fonts"), // dezvoltare: server/lib/docs → server/assets/fonts
    join(process.cwd(), "server", "assets", "fonts"),
    join(process.cwd(), "assets", "fonts"),
  ];
}

/** Directorul în care se găsesc chiar cele patru fișiere .ttf, sau null dacă lipsesc. */
export function fontDir(): string | null {
  for (const dir of candidateDirs()) {
    if (existsSync(join(dir, "Tinos-Regular.ttf"))) return dir;
  }
  return null;
}

export function fontPath(style: FontStyle): string {
  const dir = fontDir();
  if (!dir) {
    // Fără fonturi nu există PDF cu diacritice; e mai cinstit să pice explicit decât să livreze
    // un act cu pătrățele în loc de „ș".
    throw new Error(
      "Fonturile actului lipsesc (server/assets/fonts/Tinos-*.ttf). Verifică pasul de copiere din build."
    );
  }
  return join(dir, `Tinos-${style}.ttf`);
}

/** Descrierea familiei pentru pdfmake. */
export function pdfFonts(): Record<string, Record<string, string>> {
  return {
    [DOC_FONT_FAMILY]: {
      normal: fontPath("Regular"),
      bold: fontPath("Bold"),
      italics: fontPath("Italic"),
      bolditalics: fontPath("BoldItalic"),
    },
  };
}
