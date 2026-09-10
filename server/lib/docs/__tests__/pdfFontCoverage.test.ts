/**
 * @vitest-environment node
 * Fonturile livrate trebuie să acopere scrierile pe care le folosesc chiar clienții.
 *
 * Incident (10.09.2026): pe formularul PAR și pe fișa dosarului, textul rusesc al unei cereri
 * („наименование товаров", „ф." din denumirea băncii) ieșea ca șiruri de pătrate. Fonturile Tinos
 * din repo erau un SUBSET latin (1506 glife) al aceleiași versiuni 1.340; în Moldova, unde multe
 * denumiri și descrieri sunt în rusă, asta rupea documente reale. Le-am înlocuit cu build-ul
 * complet (3209 glife, ACELEAȘI metrici — deci Times New Roman rămâne referința pentru acte).
 *
 * Testul merge până la capăt, prin generatorul real: un caracter fără glifă iese la extragere ca
 * U+0000, deci absența lui e dovada că documentul chiar se poate citi.
 */
import { describe, it, expect } from "vitest";
import { renderDosarPagesPdf } from "../../par/dosarPdf";
import { DOC_FONT_FAMILY } from "../pdfFonts";

/** Româna cu ambele variante de diacritice (virgulă și sedilă), rusa și punctuația documentelor. */
const PROBE = "Mărfuri și servicii · poziţiei tarifare — наименование товаров, ф. «Молдова» №5";

/** Caracterul fără glifă, așa cum apare la extragerea textului. */
const NOTDEF = "\u0000";

async function textOf(bold: boolean): Promise<string> {
  const bytes = await renderDosarPagesPdf({
    pageSize: "A4",
    defaultStyle: { font: DOC_FONT_FAMILY, fontSize: 12, bold },
    content: [{ text: PROBE, italics: bold }],
  });
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(doc, { mergePages: true });
  return Array.isArray(text) ? text.join(" ") : text;
}

describe("Acoperirea fonturilor livrate", () => {
  it("[blocant] textul românesc ȘI cel rusesc se scriu, nu ies pătrate", async () => {
    const text = await textOf(false);
    expect(text).toContain("наименование товаров");
    expect(text).toContain("Mărfuri și servicii");
    expect(text).toContain("poziţiei");
    expect(text).not.toContain(NOTDEF);
  }, 60_000);

  it("[blocant] la fel pe bold/italic (casetele de semnătură și antetele le folosesc)", async () => {
    const text = await textOf(true);
    expect(text).toContain("наименование товаров");
    expect(text).not.toContain(NOTDEF);
  }, 60_000);
});
