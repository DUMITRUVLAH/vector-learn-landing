/**
 * Referința actului în destinația plății — citită din corpusul REAL de documente.
 *
 * Testul urcă peste aceleași fișiere ca `documentCorpus.test.ts` (`fixtures/documents/*.txt`):
 * o factură fiscală tipizată, un cont de plată cu rândurile amestecate de PDF, o chitanță, un
 * contract, un invoice internațional, un act rusesc. Dacă un regex de aici „prinde" prea mult,
 * pică pe documentele care NU trebuie să dea referință.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import {
  formatDocumentRef,
  parseDocumentRef,
  paymentDestination,
  pickDocumentRef,
} from "../documentRef";

const DIR = join(__dirname, "fixtures", "documents");
const doc = (slug: string) => readFileSync(join(DIR, `${slug}.txt`), "utf8");

describe("parseDocumentRef — corpusul de documente", () => {
  it("factură fiscală tipizată: seria/numărul din rândul «Серия, №»", () => {
    const ref = parseDocumentRef(doc("1-factura-fiscala-tipizata-md-documentul-owner-ului"));
    expect(ref?.kind).toBe("factura_fiscala");
    expect(ref?.number).toBe("EBC000579678");
  });

  it("factură fiscală (PDF real, diacritice cu sedilă): prinde și data eliberării", () => {
    const ref = parseDocumentRef(doc("11-factura-fiscala-diacritice-sedila-pdf-real"));
    expect(ref?.number).toBe("EBC000579678");
    expect(ref?.date).toBe("2025-11-04");
    expect(formatDocumentRef(ref)).toBe("factura fiscală seria/nr. EBC000579678 din 04.11.2025");
  });

  it("cont de plată, layout tabelar: «Nr. 251 din 09.09.2026»", () => {
    const ref = parseDocumentRef(doc("7-proforma-cont-de-plata-layout-tabelar-minimal"));
    expect(ref?.kind).toBe("cont_de_plata");
    expect(formatDocumentRef(ref)).toBe("cont de plată nr. 251 din 09.09.2026");
  });

  it("cont de plată cu rândurile amestecate de PDF: numărul stă pe rândul de sub titlu", () => {
    const ref = parseDocumentRef(doc("12-cont-de-plata-antet-si-platitor-zbor-md"));
    expect(ref?.kind).toBe("cont_de_plata");
    expect(ref?.number).toBe("68339");
    expect(ref?.date).toBe("2026-08-25");
  });

  it("nota de subsol «Factura este valabilă timp de 1 zile» nu e un titlu de act", () => {
    // Același document ca mai sus: dacă fraza ar fi citită ca titlu, tipul ar deveni „factura".
    const ref = parseDocumentRef(doc("12-cont-de-plata-antet-si-platitor-zbor-md"));
    expect(ref?.kind).not.toBe("factura");
  });

  it("chitanță: numărul de pe titlu, data de pe rândul următor", () => {
    const ref = parseDocumentRef(doc("4-chitanta-bon-fiscal-fara-iban"));
    expect(ref?.kind).toBe("chitanta");
    expect(ref?.number).toBe("0041");
    expect(ref?.date).toBe("2026-07-18");
  });

  it("invoice internațional: «Invoice No: INV-2026-0042 Date: 12 August 2026»", () => {
    const ref = parseDocumentRef(doc("2-invoice-international-en-layout-us-ue"));
    expect(ref?.number).toBe("INV-2026-0042");
    expect(ref?.date).toBe("2026-08-12");
  });

  it("act rusesc: «АКТ ВЫПОЛНЕННЫХ РАБОТ № 17 от 03 марта 2026»", () => {
    const ref = parseDocumentRef(doc("3-akt-vypolnennyh-rabot-ru"));
    expect(ref?.kind).toBe("act");
    expect(ref?.number).toBe("17");
    expect(ref?.date).toBe("2026-03-03");
  });

  it("contract: numărul din titlu, chiar cu denumirea între ele", () => {
    const ref = parseDocumentRef(doc("5-contract-de-prestari-servicii-ro-rechizite-la-final"));
    expect(ref?.kind).toBe("contract");
    expect(ref?.number).toBe("88");
  });

  it("formularul PAR nu e un act justificativ — nicio referință", () => {
    expect(parseDocumentRef(doc("6-formular-par-beneficiar-persoana-fizica"))).toBeNull();
  });

  it("text gol / scan fără strat de text → null, nu o invenție", () => {
    expect(parseDocumentRef("")).toBeNull();
    expect(parseDocumentRef(null)).toBeNull();
    expect(parseDocumentRef("   \n \n")).toBeNull();
  });

  it("nu confundă codul fiscal de 13 cifre cu un număr de act", () => {
    const ref = parseDocumentRef("FACTURA FISCALA nr. 1024600006236 din 09.09.2026\nFurnizor: X SRL");
    expect(ref?.date).toBe("2026-09-09");
    expect(ref?.number).toBeNull();
    // Fără număr ȘI fără dată nu rămâne nimic de scris în ordinul de plată.
    expect(parseDocumentRef("FACTURA FISCALA nr. 1024600006236\nFurnizor: X SRL")).toBeNull();
  });
});

describe("pickDocumentRef — care document dă referința", () => {
  const analysisWith = (kind: string, number: string) =>
    JSON.stringify({
      status: "match",
      document: { kind, label: kind === "factura_fiscala" ? "factura fiscală" : "cont de plată", number, date: "2026-09-09" },
    });

  it("factura fiscală bate contul de plată", () => {
    const ref = pickDocumentRef([
      { kind: "quotation", analysis: analysisWith("cont_de_plata", "251") },
      { kind: "invoice", analysis: analysisWith("factura_fiscala", "EBC000579678") },
    ]);
    expect(ref?.number).toBe("EBC000579678");
  });

  it("ordinul de plată propriu nu e sursă de referință", () => {
    const ref = pickDocumentRef([
      { kind: "payment_order", analysis: analysisWith("factura_fiscala", "EBC000579678") },
    ]);
    expect(ref).toBeNull();
  });

  it("analiză veche, fără bloc «document» → null, fără să arunce", () => {
    expect(pickDocumentRef([{ kind: "invoice", analysis: JSON.stringify({ status: "match", checks: [] }) }])).toBeNull();
    expect(pickDocumentRef([{ kind: "invoice", analysis: "nu-i JSON" }])).toBeNull();
    expect(pickDocumentRef([])).toBeNull();
  });
});

describe("paymentDestination", () => {
  const ref = parseDocumentRef("CONT DE PLATĂ Nr. 251 din 09.09.2026");

  it("leagă descrierea de referință prin bară", () => {
    expect(paymentDestination("Achitare servicii video", ref)).toBe(
      "Achitare servicii video / cont de plată nr. 251 din 09.09.2026",
    );
  });

  it("fără referință rămâne descrierea de azi", () => {
    expect(paymentDestination("Achitare servicii video", null)).toBe("Achitare servicii video");
  });

  it("nu repetă un număr pe care solicitantul l-a scris deja în descriere", () => {
    expect(paymentDestination("Achitare cont de plată 251", ref)).toBe("Achitare cont de plată 251");
  });

  it("descriere goală → doar referința", () => {
    expect(paymentDestination(null, ref)).toBe("cont de plată nr. 251 din 09.09.2026");
  });
});
