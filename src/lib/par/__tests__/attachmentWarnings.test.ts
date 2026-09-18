/**
 * VM5-05 — ce se numără drept „nepotrivire" și ce nu.
 *
 * Miza e echilibrul: un avertisment care sare la fiecare aprobare nu mai e citit de nimeni, iar
 * unul care tace când documentul chiar e greșit nu apără pe nimeni. De aceea `null` (câmp
 * neverificat — document scanat prost, fără IBAN pe el) NU e nepotrivire.
 */
import { describe, it, expect } from "vitest";
import {
  analysisBadge,
  collectDocumentMismatches,
  CURRENT_ANALYSIS_VERSION,
  formatCheckValue,
  parseAttachmentAnalysis,
} from "../attachmentWarnings";

const analysis = (
  checks: { field: string; expected: unknown; found: unknown; matches: boolean | null }[],
  /** `null` = verdict vechi, salvat înainte să existe versionarea. */
  version: number | null = CURRENT_ANALYSIS_VERSION
) =>
  JSON.stringify({
    ...(version === null ? {} : { version }),
    status: checks.some((c) => c.matches === false) ? "warning" : "match",
    warnings: checks.filter((c) => c.matches === false).length,
    checks,
    analyzedAt: "2026-09-10T10:00:00Z",
  });

describe("parseAttachmentAnalysis()", () => {
  it("citește o analiză validă", () => {
    const parsed = parseAttachmentAnalysis(analysis([{ field: "sumă", expected: 100, found: 100, matches: true }]));
    expect(parsed?.status).toBe("match");
  });

  it("nu se sufocă pe text care nu e JSON", () => {
    expect(parseAttachmentAnalysis("nu e json")).toBeNull();
    expect(parseAttachmentAnalysis(null)).toBeNull();
    expect(parseAttachmentAnalysis("")).toBeNull();
  });

  it("respinge un JSON cu altă formă", () => {
    expect(parseAttachmentAnalysis(JSON.stringify({ status: "altceva" }))).toBeNull();
    expect(parseAttachmentAnalysis(JSON.stringify({ status: "match" }))).toBeNull();
  });
});

describe("collectDocumentMismatches()", () => {
  it("adună doar diferențele reale, nu și câmpurile neverificate", () => {
    const out = collectDocumentMismatches([
      {
        fileName: "factura.pdf",
        analysis: analysis([
          { field: "sumă", expected: 700000, found: 650000, matches: false },
          { field: "IBAN", expected: "MD24", found: null, matches: null },
          { field: "valută", expected: "MDL", found: "MDL", matches: true },
        ]),
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ fileName: "factura.pdf", field: "sumă", expected: 700000, found: 650000 });
  });

  it("strânge nepotrivirile din mai multe documente, în ordinea lor", () => {
    const out = collectDocumentMismatches([
      { fileName: "contract.pdf", analysis: analysis([{ field: "beneficiar", expected: "A", found: "B", matches: false }]) },
      { fileName: "factura.pdf", analysis: analysis([{ field: "plătitor", expected: "ATIC", found: "Digital Safeguard", matches: false }]) },
    ]);
    expect(out.map((m) => m.field)).toEqual(["beneficiar", "plătitor"]);
  });

  /**
   * Pe producție (10.09.2026) 17 din 23 de atașamente purtau un verdict vechi, aproape toate pe
   * „sumă": contracte-cadru comparate cu plata unei luni, un număr de factură citit drept sumă.
   * Ele rămân vizibile pe fișă, dar nu au voie să blocheze o semnătură.
   */
  it("ignoră verdictele făcute cu reguli vechi", () => {
    const vechi = collectDocumentMismatches([
      { fileName: "contract.pdf", analysis: analysis([{ field: "sumă", expected: 700000, found: 758854, matches: false }], null) },
    ]);
    expect(vechi).toEqual([]);
  });

  it("numără verdictele făcute cu regulile curente", () => {
    const nou = collectDocumentMismatches([
      { fileName: "factura.pdf", analysis: analysis([{ field: "sumă", expected: 700000, found: 650000, matches: false }]) },
    ]);
    expect(nou).toHaveLength(1);
  });

  it("un document fără analiză nu produce nimic", () => {
    expect(collectDocumentMismatches([{ fileName: "scan.pdf", analysis: null }])).toEqual([]);
    expect(collectDocumentMismatches([])).toEqual([]);
  });

  it("o cerere cu toate documentele concordante nu declanșează avertisment", () => {
    const out = collectDocumentMismatches([
      { fileName: "factura.pdf", analysis: analysis([{ field: "sumă", expected: 100, found: 100, matches: true }]) },
    ]);
    expect(out).toEqual([]);
  });
});

describe("formatCheckValue()", () => {
  it("scrie sumele în valuta cererii, din bani", () => {
    expect(formatCheckValue(700000, "MDL")).toContain("7");
    expect(formatCheckValue(700000, "EUR")).toContain("EUR");
  });

  it("lasă textul neatins și marchează lipsa cu o liniuță", () => {
    expect(formatCheckValue("Digital Safeguard SRL")).toBe("Digital Safeguard SRL");
    expect(formatCheckValue(null)).toBe("—");
    expect(formatCheckValue("")).toBe("—");
  });
});

describe("analysisBadge()", () => {
  const parsed = (checks: { field: string; expected: unknown; found: unknown; matches: boolean | null }[]) =>
    parseAttachmentAnalysis(analysis(checks))!;

  it("numără nepotrivirile în română", () => {
    expect(analysisBadge(parsed([{ field: "valută", expected: "USD", found: "MDL", matches: false }])))
      .toEqual({ label: "1 diferență", tone: "warning" });
    expect(analysisBadge(parsed([
      { field: "valută", expected: "USD", found: "MDL", matches: false },
      { field: "beneficiar", expected: "ATIC", found: "Altcineva SRL", matches: false },
    ])).label).toBe("2 diferențe");
  });

  it("spune „Concordant” doar când chiar s-a confirmat ceva", () => {
    expect(analysisBadge(parsed([{ field: "IDNO/IDNP", expected: "1006600034927", found: "1006600034927", matches: true }])))
      .toEqual({ label: "Concordant", tone: "success" });
  });

  it("un document din care n-a ieșit niciun câmp NU e verde", () => {
    // Act scanat prost: toate rândurile „document nedetectat". Zero nepotriviri, dar și zero
    // verificări — tăcerea nu e acord.
    expect(analysisBadge(parsed([
      { field: "sumă", expected: 4750000, found: null, matches: null },
      { field: "beneficiar", expected: "ATIC", found: null, matches: null },
    ]))).toEqual({ label: "Nimic de verificat", tone: "muted" });
  });
});
