/**
 * @vitest-environment node
 *
 * DG-112 — tabelul pozițiilor e chiar obiectul unui act de primire-predare. Testele apără două
 * lucruri: că se construiește corect (numerotare, totaluri, formatare RO) și că valorile rămân
 * escapate — un furnizor care își numește produsul cu marcaje HTML nu are voie să injecteze cod
 * într-un document oficial.
 */
import { describe, it, expect } from "vitest";
import { buildLinesTable, insertLinesTable, LINES_TABLE_TOKEN } from "../linesTable";

const LINES = [
  { description: "Laptop Dell Latitude", unit: "buc", quantity: 2, unitPriceCents: 1225000, lineTotalCents: 2450000 },
  { description: "Mouse", unit: "buc", quantity: 3, unitPriceCents: 25000, lineTotalCents: 75000 },
];

describe("DG-112 — tabelul pozițiilor", () => {
  it("[blocant] numerotează, formatează sumele RO și totalizează", () => {
    const html = buildLinesTable(LINES);
    expect(html).toContain("Laptop Dell Latitude");
    expect(html).toContain("12.250,00");
    expect(html).toContain("24.500,00");
    // Totalul din subsol: 24.500 + 750
    expect(html).toContain("25.250,00");
  });

  it("[blocant] valorile rămân escapate", () => {
    const html = buildLinesTable([
      { description: '<img src=x onerror="alert(1)">', unit: "buc", quantity: 1, unitPriceCents: 100, lineTotalCents: 100 },
    ]);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("[blocant] marcajul din șablon e înlocuit cu tabelul, oriunde apare", () => {
    const body = `<p>Bunuri:</p><p>${LINES_TABLE_TOKEN}</p>`;
    const out = insertLinesTable(body, LINES);
    expect(out).not.toContain(LINES_TABLE_TOKEN);
    expect(out).toContain("<table>");
  });

  it("[normal] un act fără poziții spune asta, nu lasă un tabel gol", () => {
    expect(buildLinesTable([])).toContain("Fără poziții");
  });

  it("[normal] un corp fără marcaj rămâne neatins", () => {
    expect(insertLinesTable("<p>Text</p>", LINES)).toBe("<p>Text</p>");
  });
});
