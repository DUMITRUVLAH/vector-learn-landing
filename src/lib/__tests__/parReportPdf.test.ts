/**
 * @vitest-environment jsdom
 *
 * PDF-ul raportului PAR — partea pură (HTML-ul care se rasterizează).
 *
 * Ce apără testele: documentul spune ÎNTOTDEAUNA ce filtre și ce bază au produs cifrele. Un
 * raport de finanțe fără scopul lui scris pe el e o cifră scoasă din context: cineva o compară
 * cu alt total, nu se potrivește, și crede că sistemul greșește. Plus regula de bază a oricărui
 * HTML construit prin concatenare — numele venite din date nu au voie să injecteze marcaj.
 */
import { describe, it, expect } from "vitest";
import { buildReportHtml, esc, money, type ReportPdfInput } from "@/lib/parReportPdf";

const base: ReportPdfInput = {
  orgName: "A.O. ATIC",
  periodLabel: "1 ian. 2026 – 31 mar. 2026",
  filterLabels: ["Proiect: LED", "Status: Plătită"],
  basisLabel: "plătit efectiv",
  totalCents: 1_234_56,
  totalCount: 7,
  cycleTime: { avgSubmitToApprovedDays: 2.5, avgSubmitToPaidDays: 6.25 },
  currencyBreakdown: [{ currency: "EUR", nativeTotalCents: 500_00, mdlTotalCents: 10_000_00, count: 2 }],
  sections: [{
    title: "Cheltuieli pe proiect/program",
    labelHead: "Proiect",
    items: [
      { id: "1", label: "LED", totalCents: 900_00, paidCents: 400_00, count: 3 },
      { id: "2", label: "Digital Safeguard", totalCents: 300_00, paidCents: 0, count: 1 },
    ],
  }],
  aging: [{ status: "paid", count: 3, totalCents: 400_00, avgAgingDays: 12.3 }],
  agingStatusLabel: (s) => (s === "paid" ? "Plătită" : s),
  generatedAt: new Date("2026-08-29T10:00:00Z"),
};

describe("buildReportHtml", () => {
  it("[blocant] scrie perioada, filtrele active și baza sumelor în antet", () => {
    const html = buildReportHtml(base);
    expect(html).toContain("1 ian. 2026 – 31 mar. 2026");
    expect(html).toContain("Proiect: LED");
    expect(html).toContain("Status: Plătită");
    expect(html).toContain("plătit efectiv");
  });

  it("spune explicit când nu s-a filtrat nimic — nu lasă antetul gol", () => {
    const html = buildReportHtml({ ...base, filterLabels: [] });
    expect(html).toContain("fără filtre suplimentare");
  });

  it("[blocant] tabelul arată ambele coloane, estimat ȘI plătit, sortate descrescător", () => {
    const html = buildReportHtml(base);
    expect(html).toContain("Estimat (MDL)");
    expect(html).toContain("Plătit (MDL)");
    expect(html.indexOf("LED")).toBeLessThan(html.indexOf("Digital Safeguard"));
    expect(html).toContain("900,00");
    expect(html).toContain("400,00");
  });

  it("include aging-ul cu etichetele omului, nu codurile de status", () => {
    const html = buildReportHtml(base);
    expect(html).toContain("Plătită");
    expect(html).toContain("12.3 zile");
  });

  it("o secțiune goală nu produce un tabel fals, ci un rând explicit", () => {
    const html = buildReportHtml({ ...base, sections: [{ title: "Pe departament", labelHead: "Departament", items: [] }] });
    expect(html).toContain("Nicio înregistrare.");
  });

  it("[blocant] un nume din date nu poate injecta marcaj în document", () => {
    const html = buildReportHtml({
      ...base,
      orgName: '<script>alert(1)</script>',
      sections: [{ title: "X", labelHead: "Y", items: [{ id: "1", label: '<img src=x onerror=1>', totalCents: 1, paidCents: 0, count: 1 }] }],
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
  });

  it("timpii lipsa se scriu cu liniuta, nu cu null", () => {
    const html = buildReportHtml({ ...base, cycleTime: { avgSubmitToApprovedDays: null, avgSubmitToPaidDays: null } });
    expect(html).not.toContain("null");
    expect(html).toContain("—");
  });
});

describe("helperi", () => {
  it("money scrie sumele în format moldovenesc, din unități minore", () => {
    expect(money(123_456)).toBe("1.234,56");
    expect(money(0)).toBe("0,00");
  });

  it("esc scapă caracterele care ar rupe HTML-ul", () => {
    expect(esc('a<b>"c"&d')).toBe("a&lt;b&gt;&quot;c&quot;&amp;d");
    expect(esc(null)).toBe("");
  });
});
